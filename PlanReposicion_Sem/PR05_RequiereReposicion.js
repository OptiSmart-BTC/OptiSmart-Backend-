const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const nivelFiltrado = process.argv[5] ? parseInt(process.argv[5]) : null;

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parte = dbName.substring(dbName.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion_Sem.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection1 = 'plan_reposicion_01_sem';

// Función helper para obtener valores numéricos seguros
function getNumericValue(value, defaultValue = 0) {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  
  const numValue = Number(value);
  if (isNaN(numValue)) {
    return defaultValue;
  }
  
  return numValue;
}

// Función helper para obtener el valor de un campo con nombres alternativos
function getFieldValue(doc, primaryField, alternativeField = null, defaultValue = 0) {
  let value = doc[primaryField];
  
  // Si el campo principal es null/undefined y hay un campo alternativo
  if ((value === null || value === undefined) && alternativeField) {
    value = doc[alternativeField];
  }
  
  return getNumericValue(value, defaultValue);
}

async function actualizarDatos() {
  writeToLog(`\n${now} - Paso 05 - Evaluación de Requiere_Reposicion (Nivel ${nivelFiltrado})`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const col = db.collection(collection1);

    // FILTRO CORREGIDO: Busca como string Y como número
    let filtro = {};
    if (nivelFiltrado !== null) {
      filtro = {
        $or: [
          { Nivel_OA: nivelFiltrado },        // Como número
          { Nivel_OA: nivelFiltrado.toString() } // Como string
        ]
      };
      writeToLog(`\tFiltro aplicado: Nivel_OA = ${nivelFiltrado} (como número) O "${nivelFiltrado}" (como string)`);
    } else {
      writeToLog(`\tSin filtro de nivel - procesando todos los documentos`);
    }

    const docs = await col.find(filtro).toArray();
    writeToLog(`\tDocumentos encontrados: ${docs.length}`);

    // ANÁLISIS INICIAL DE DATOS
    if (docs.length > 0) {
      const primerDoc = docs[0];
      writeToLog(`\tEstructura del primer documento:`);
      writeToLog(`\t   SKU: ${primerDoc.SKU}`);
      writeToLog(`\t   Nivel_OA: ${primerDoc.Nivel_OA} (tipo: ${typeof primerDoc.Nivel_OA})`);
      writeToLog(`\t   Inventario_Disponible: ${primerDoc.Inventario_Disponible} (tipo: ${typeof primerDoc.Inventario_Disponible})`);
      writeToLog(`\t   ROP: ${primerDoc.ROP} (tipo: ${typeof primerDoc.ROP})`);
      writeToLog(`\t   Requiere_Reposicion actual: ${primerDoc.Requiere_Reposicion}`);
      
      const campos = Object.keys(primerDoc);
      writeToLog(`\t   Total campos: ${campos.length}`);
    }

    // ANÁLISIS DE NIVEL_OA
    const distribNivelOA = {};
    docs.forEach(doc => {
      const nivel = doc.Nivel_OA;
      const tipo = typeof nivel;
      const key = `${nivel} (${tipo})`;
      distribNivelOA[key] = (distribNivelOA[key] || 0) + 1;
    });

    writeToLog(`\tDistribución de Nivel_OA encontrados:`);
    Object.entries(distribNivelOA).forEach(([key, count]) => {
      writeToLog(`\t   ${key}: ${count} documentos`);
    });

    // ANÁLISIS DE CAMPOS CRÍTICOS
    const camposCriticos = ['Inventario_Disponible', 'Cantidad_Transito', 'Cantidad_Confirmada_Total', 'ROP'];
    camposCriticos.forEach(campo => {
      const distribCampo = { null: 0, undefined: 0, zero: 0, positive: 0, negative: 0, string: 0 };
      
      docs.forEach(doc => {
        const valor = doc[campo];
        if (valor === null) distribCampo.null++;
        else if (valor === undefined) distribCampo.undefined++;
        else if (typeof valor === 'string') distribCampo.string++;
        else if (parseFloat(valor) === 0) distribCampo.zero++;
        else if (parseFloat(valor) > 0) distribCampo.positive++;
        else if (parseFloat(valor) < 0) distribCampo.negative++;
      });

      writeToLog(`\t${campo}:`);
      writeToLog(`\t   null: ${distribCampo.null}, undefined: ${distribCampo.undefined}, string: ${distribCampo.string}`);
      writeToLog(`\t   zero: ${distribCampo.zero}, positive: ${distribCampo.positive}, negative: ${distribCampo.negative}`);
    });

    const updates = [];
    let omitidos = 0;
    let procesados = 0;
    let siRequieren = 0;
    let noRequieren = 0;

    for (const doc of docs) {
      try {
        // Validar que el documento tenga un _id válido
        if (!doc._id) {
          writeToLog(`\tDocumento omitido: Sin _id válido`);
          omitidos++;
          continue;
        }

        // Obtener valores con manejo seguro de nulls
        const inv = getFieldValue(doc, 'Inventario_Disponible', null, 0);
        const trans = getFieldValue(doc, 'Cantidad_Transito', null, 0);
        const conf = getFieldValue(doc, 'Cantidad_Confirmada_Total', null, 0);
        const demandaInd = getFieldValue(doc, 'Cantidad_Demanda_Indirecta', 'Cantidad Demanda Indirecta', 0);
        const rop = getFieldValue(doc, 'ROP', null, 0);
        
        // MANEJO CORRECTO DE NIVEL_OA (puede ser string o número)
        const nivelOA = getNumericValue(doc.Nivel_OA, 0);

        // Validar Nivel_OA
        if (isNaN(nivelOA) || nivelOA < 0) {
          writeToLog(`\tDocumento omitido por Nivel_OA inválido (SKU=${doc.SKU || 'N/A'}): Nivel_OA = ${doc.Nivel_OA} (tipo: ${typeof doc.Nivel_OA})`);
          omitidos++;
          continue;
        }

        // Calcular comparador
        const comparador = nivelOA >= 2
          ? inv + trans - conf - demandaInd
          : inv + trans - conf;

        // Determinar si requiere reposición
        const requiere = rop > comparador ? "Si" : "No";

        // Contar resultados
        if (requiere === "Si") siRequieren++;
        else noRequieren++;

        // Log detallado para los primeros 5 documentos
        if (procesados < 5) {
          writeToLog(`\tSKU=${doc.SKU || 'N/A'} - Cálculo detallado:`);
          writeToLog(`\t   Nivel_OA: ${doc.Nivel_OA} → ${nivelOA}`);
          writeToLog(`\t   Inventario: ${doc.Inventario_Disponible} → ${inv}`);
          writeToLog(`\t   Tránsito: ${doc.Cantidad_Transito} → ${trans}`);
          writeToLog(`\t   Confirmada: ${doc.Cantidad_Confirmada_Total} → ${conf}`);
          writeToLog(`\t   Demanda Ind: ${doc.Cantidad_Demanda_Indirecta} → ${demandaInd}`);
          writeToLog(`\t   ROP: ${doc.ROP} → ${rop}`);
          writeToLog(`\t   Comparador: ${comparador} (${nivelOA >= 2 ? 'con' : 'sin'} demanda indirecta)`);
          writeToLog(`\t   Resultado: ROP (${rop}) ${rop > comparador ? '>' : '<='} Comparador (${comparador}) = ${requiere}`);
        }

        updates.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { 
              $set: { 
                Requiere_Reposicion: requiere,
                // Campos de auditoría
                _Inventario_Disponible_Processed: inv,
                _Cantidad_Transito_Processed: trans,
                _Cantidad_Confirmada_Total_Processed: conf,
                _Cantidad_Demanda_Indirecta_Processed: demandaInd,
                _ROP_Processed: rop,
                _Comparador_Calculated: comparador,
                _Nivel_OA_Processed: nivelOA,
                _Last_Updated: new Date()
              }
            }
          }
        });

        procesados++;

      } catch (docError) {
        writeToLog(`\tError procesando documento SKU=${doc.SKU || 'N/A'}: ${docError.message}`);
        omitidos++;
      }
    }

    writeToLog(`\nRESUMEN DE CÁLCULOS:`);
    writeToLog(`\tTotal documentos: ${docs.length}`);
    writeToLog(`\tProcesados exitosamente: ${procesados}`);
    writeToLog(`\tOmitidos por errores: ${omitidos}`);
    writeToLog(`\tUpdates a ejecutar: ${updates.length}`);
    writeToLog(`\tRequieren reposición (Si): ${siRequieren}`);
    writeToLog(`\tNo requieren reposición (No): ${noRequieren}`);

    if (updates.length > 0) {
      const result = await col.bulkWrite(updates);
      writeToLog(`\tBulk write ejecutado:`);
      writeToLog(`\t   Registros coincidentes: ${result.matchedCount}`);
      writeToLog(`\t   Registros modificados: ${result.modifiedCount}`);
      writeToLog(`\t   Errores de escritura: ${result.writeErrors ? result.writeErrors.length : 0}`);
    } else {
      writeToLog(`\tNo hay updates para ejecutar`);
    }

    // VERIFICACIÓN POST-ACTUALIZACIÓN
    const verificacion = await col.find(filtro).limit(5).toArray();
    writeToLog(`\nVERIFICACIÓN POST-ACTUALIZACIÓN (primeros 5):`);
    verificacion.forEach(doc => {
      writeToLog(`\t   SKU ${doc.SKU}: Requiere_Reposicion = "${doc.Requiere_Reposicion}"`);
    });

    // ESTADÍSTICAS FINALES
    const estadisticasFinales = await col.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: null,
          totalRegistros: { $sum: 1 },
          requierenSi: { 
            $sum: { $cond: [{ $eq: ["$Requiere_Reposicion", "Si"] }, 1, 0] }
          },
          requierenNo: { 
            $sum: { $cond: [{ $eq: ["$Requiere_Reposicion", "No"] }, 1, 0] }
          },
          requierenNull: { 
            $sum: { $cond: [{ $eq: ["$Requiere_Reposicion", null] }, 1, 0] }
          },
          otros: {
            $sum: { 
              $cond: [
                { $and: [
                  { $ne: ["$Requiere_Reposicion", "Si"] },
                  { $ne: ["$Requiere_Reposicion", "No"] },
                  { $ne: ["$Requiere_Reposicion", null] }
                ]}, 1, 0
              ]
            }
          }
        }
      }
    ]).toArray();

    if (estadisticasFinales.length > 0) {
      const stats = estadisticasFinales[0];
      writeToLog(`\nESTADÍSTICAS FINALES:`);
      writeToLog(`\tTotal registros: ${stats.totalRegistros}`);
      writeToLog(`\tRequiere_Reposicion = "Si": ${stats.requierenSi}`);
      writeToLog(`\tRequiere_Reposicion = "No": ${stats.requierenNo}`);
      writeToLog(`\tRequiere_Reposicion = null: ${stats.requierenNull}`);
      writeToLog(`\tOtros valores: ${stats.otros}`);
      
      const porcentajeSi = stats.totalRegistros > 0 ? 
        ((stats.requierenSi / stats.totalRegistros) * 100).toFixed(1) : 0;
      const porcentajeNo = stats.totalRegistros > 0 ? 
        ((stats.requierenNo / stats.totalRegistros) * 100).toFixed(1) : 0;
      
      writeToLog(`\tPorcentaje "Si": ${porcentajeSi}%`);
      writeToLog(`\tPorcentaje "No": ${porcentajeNo}%`);
    }
    
    // Verificar si hay documentos con valores null después de la actualización
    const nullCheck = await col.countDocuments({ 
      ...filtro,
      Requiere_Reposicion: null 
    });
    
    if (nullCheck > 0) {
      writeToLog(`\tADVERTENCIA: ${nullCheck} documentos aún tienen Requiere_Reposicion = null`);
      
      // Mostrar algunos ejemplos de documentos con null
      const ejemplosNull = await col.find({ 
        ...filtro,
        Requiere_Reposicion: null 
      }).limit(3).toArray();
      
      writeToLog(`\t   Ejemplos de documentos con null:`);
      ejemplosNull.forEach(doc => {
        writeToLog(`\t   - SKU ${doc.SKU}: ROP=${doc.ROP}, Inv=${doc.Inventario_Disponible}, Nivel=${doc.Nivel_OA}`);
      });
    }

    writeToLog(`\nTermina la Evaluación de Requiere_Reposicion para Nivel ${nivelFiltrado}`);

  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
    writeToLog(`${now} - [ERROR STACK] ${error.stack}`);
    console.error('Error completo:', error);
  } finally {
    if (client) {
      await client.close();
      writeToLog(`\tConexión a MongoDB cerrada`);
    }
  }
}

function writeToLog(message) {
  try {
    const timestamp = moment().format('HH:mm:ss');
    const logMessage = `[${timestamp}] ${message}`;
    fs.appendFileSync(logFile, logMessage + '\n');
    console.log(logMessage);
  } catch (logError) {
    console.error('Error escribiendo log:', logError.message);
    console.log(message);
  }
}

// Verificar argumentos requeridos
if (!dbName || !DBUser || !DBPassword) {
  console.error('Faltan argumentos requeridos: dbName, DBUser, DBPassword');
  process.exit(1);
}

actualizarDatos().catch(error => {
  console.error('Error fatal:', error);
  writeToLog(`${moment().format('YYYY-MM-DD HH:mm:ss')} - [ERROR FATAL] ${error.message}`);
  process.exit(1);
});