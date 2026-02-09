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
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion_Sem.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

// Función helper para obtener valor numérico seguro
function getNumericValue(value, fieldName, sku) {
  if (value === null || value === undefined) {
    writeToLog(`    [WARNING] ${sku}: ${fieldName} es null/undefined`);
    return 0;
  }
  
  const numValue = Number(value);
  if (isNaN(numValue)) {
    writeToLog(`    [WARNING] ${sku}: ${fieldName} no es numérico (${value})`);
    return 0;
  }
  
  return numValue;
}

// Función para buscar campo con múltiples nombres posibles
function findFieldValue(doc, possibleNames, sku) {
  for (const name of possibleNames) {
    if (doc.hasOwnProperty(name) && doc[name] !== null && doc[name] !== undefined) {
      return doc[name];
    }
  }
  writeToLog(`    [WARNING] ${sku}: No se encontró ningún campo de ${possibleNames.join(', ')}`);
  return 0;
}

async function actualizarDatos() {
  writeToLog(`\n${now} - Paso 06 - Calculo de la Cantidad a Reponer (Nivel ${nivelFiltrado})`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const collection = db.collection('plan_reposicion_01_sem');

    // Primero, ver qué filtro estamos usando
    let filtro = {};
    if (nivelFiltrado !== null) {
      filtro = { Nivel_OA: nivelFiltrado };
      writeToLog(`  Filtrando por Nivel_OA: ${nivelFiltrado}`);
    } else {
      writeToLog(`  Sin filtro de nivel (procesando todos los documentos)`);
    }

    const documentos = await collection.find(filtro).toArray();
    writeToLog(`  Documentos encontrados: ${documentos.length}`);

    if (documentos.length === 0) {
      //writeToLog(`  [ERROR] No se encontraron documentos con el filtro especificado`);
      return;
    }

    // Analizar estructura de los primeros documentos
    writeToLog(`\n  === ANÁLISIS DE ESTRUCTURA DE DATOS ===`);
    const primerDoc = documentos[0];
    writeToLog(`  Campos disponibles en el primer documento:`);
    Object.keys(primerDoc).forEach(key => {
      const value = primerDoc[key];
      const type = typeof value;
      writeToLog(`    ${key}: ${value} (${type})`);
    });

    let requierenReposicion = 0;
    let noRequierenReposicion = 0;
    let erroresTotales = 0;

    const updates = documentos.map((doc, index) => {
      const sku = doc.SKU || `DOC_${index}`;
      writeToLog(`\n  === PROCESANDO SKU: ${sku} ===`);

      try {
        // 1. Verificar Requiere_Reposicion
        const requiereRepos = doc.Requiere_Reposicion === "Si";
        writeToLog(`    Requiere_Reposicion: "${doc.Requiere_Reposicion}" => ${requiereRepos}`);

        if (!requiereRepos) {
          noRequierenReposicion++;
          writeToLog(`    RESULTADO: No requiere reposición, Cantidad_Reponer = 0`);
          return {
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: { Cantidad_Reponer: 0 } }
            }
          };
        }

        requierenReposicion++;

        // 2. Obtener valores de los campos
        const inv = getNumericValue(
          findFieldValue(doc, ['Inventario_Disponible', 'inventario_disponible', 'InventarioDisponible'], sku),
          'Inventario_Disponible',
          sku
        );

        const trans = getNumericValue(
          findFieldValue(doc, ['Cantidad_Transito', 'cantidad_transito', 'CantidadTransito'], sku),
          'Cantidad_Transito',
          sku
        );

        const confirmada = getNumericValue(
          findFieldValue(doc, ['Cantidad_Confirmada_Total', 'cantidad_confirmada_total', 'CantidadConfirmadaTotal'], sku),
          'Cantidad_Confirmada_Total',
          sku
        );

        const meta = getNumericValue(
          findFieldValue(doc, ['META', 'meta', 'Meta'], sku),
          'META',
          sku
        );

        // 3. Demanda indirecta solo para niveles >= 2
        let demandaInd = 0;
        if (nivelFiltrado >= 2) {
          demandaInd = getNumericValue(
            findFieldValue(doc, ['Cantidad_Demanda_Indirecta', 'Cantidad Demanda Indirecta', 'cantidad_demanda_indirecta'], sku),
            'Cantidad_Demanda_Indirecta',
            sku
          );
        }

        // 4. Verificar el campo Nivel_OA del documento
        const nivelOADoc = doc.Nivel_OA;
        writeToLog(`    Nivel_OA del documento: ${nivelOADoc}`);

        // 5. Log de valores obtenidos
        writeToLog(`    VALORES EXTRAÍDOS:`);
        writeToLog(`      Inventario_Disponible: ${inv}`);
        writeToLog(`      Cantidad_Transito: ${trans}`);
        writeToLog(`      Cantidad_Confirmada_Total: ${confirmada}`);
        writeToLog(`      META: ${meta}`);
        writeToLog(`      Cantidad_Demanda_Indirecta: ${demandaInd} (aplicada: ${nivelFiltrado >= 2})`);

        // 6. Cálculo
        const calculo = Math.max(0, Math.ceil(meta + confirmada + demandaInd - inv - trans));
        
        writeToLog(`    CÁLCULO:`);
        writeToLog(`      Fórmula: MAX(0, ROUND(META + Confirmada + DemandaInd - Inv - Trans))`);
        writeToLog(`      Sustitución: MAX(0, ROUND(${meta} + ${confirmada} + ${demandaInd} - ${inv} - ${trans}))`);
        writeToLog(`      = MAX(0, ROUND(${meta + confirmada + demandaInd - inv - trans}))`);
        writeToLog(`      RESULTADO: ${calculo}`);

        return {
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { Cantidad_Reponer: calculo } }
          }
        };

      } catch (error) {
        erroresTotales++;
        writeToLog(`    [ERROR] Procesando SKU ${sku}: ${error.message}`);
        return {
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { Cantidad_Reponer: 0 } }
          }
        };
      }
    });

    writeToLog(`\n  === RESUMEN ANTES DE ACTUALIZAR ===`);
    writeToLog(`    Total documentos: ${documentos.length}`);
    writeToLog(`    Requieren reposición: ${requierenReposicion}`);
    writeToLog(`    No requieren reposición: ${noRequierenReposicion}`);
    writeToLog(`    Errores: ${erroresTotales}`);

    if (updates.length > 0) {
      const result = await collection.bulkWrite(updates);
      writeToLog(`\n  === RESULTADO DE ACTUALIZACIÓN ===`);
      writeToLog(`    Documentos modificados: ${result.modifiedCount}`);
      writeToLog(`    Documentos coincidentes: ${result.matchedCount}`);
    }

    // Verificación post-actualización
    const verificacion = await collection.find(filtro, { 
      projection: { SKU: 1, Cantidad_Reponer: 1, Requiere_Reposicion: 1 } 
    }).toArray();

    writeToLog(`\n  === VERIFICACIÓN POST-ACTUALIZACIÓN ===`);
    const conReposicion = verificacion.filter(d => d.Cantidad_Reponer > 0);
    const sinReposicion = verificacion.filter(d => d.Cantidad_Reponer === 0);
    
    writeToLog(`    Documentos con Cantidad_Reponer > 0: ${conReposicion.length}`);
    writeToLog(`    Documentos con Cantidad_Reponer = 0: ${sinReposicion.length}`);

    if (conReposicion.length > 0) {
      writeToLog(`    Primeros 5 con reposición:`);
      conReposicion.slice(0, 5).forEach(d => {
        writeToLog(`      SKU: ${d.SKU}, Cantidad_Reponer: ${d.Cantidad_Reponer}, Requiere: ${d.Requiere_Reposicion}`);
      });
    }

    writeToLog(`\n  Termina el Cálculo de la Cantidad a Reponer (${updates.length} documentos procesados)`);

  } catch (error) {
    writeToLog(`${now} - [ERROR FATAL] ${error.message}`);
    writeToLog(`${now} - [ERROR STACK] ${error.stack}`);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

function writeToLog(message) {
  try {
    fs.appendFileSync(logFile, message + '\n');
    console.log(message); // También mostrar en consola
  } catch (logError) {
    console.error('Error escribiendo log:', logError.message);
    console.log(message);
  }
}

// Validación de argumentos
if (!dbName || !DBUser || !DBPassword) {
  console.error('Faltan argumentos requeridos: node script.js <dbName> <DBUser> <DBPassword> [nivelFiltrado]');
  process.exit(1);
}

writeToLog(`\n${'='.repeat(80)}`);
writeToLog(`INICIO DE EJECUCIÓN: ${now}`);
writeToLog(`Parámetros: dbName=${dbName}, DBUser=${DBUser}, nivelFiltrado=${nivelFiltrado}`);
writeToLog(`${'='.repeat(80)}`);

actualizarDatos().catch(error => {
  console.error('Error fatal:', error);
  writeToLog(`${moment().format('YYYY-MM-DD HH:mm:ss')} - [ERROR FATAL] ${error.message}`);
  process.exit(1);
});