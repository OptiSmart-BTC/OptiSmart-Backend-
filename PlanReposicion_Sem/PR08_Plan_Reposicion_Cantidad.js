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

const collectionName = 'plan_reposicion_01_sem';

// Función helper para obtener valor numérico seguro
function getNumericValue(value, fieldName, sku) {
  if (value === null || value === undefined) {
    return 0;
  }
  
  const numValue = Number(value);
  if (isNaN(numValue)) {
    writeToLog(`    [WARNING] ${sku}: ${fieldName} no es numérico (${value})`);
    return 0;
  }
  
  return numValue;
}

// Función para calcular si requiere reposición (igual que el script anterior)
function calcularRequiereReposicion(doc, sku) {
  const inv = getNumericValue(doc.Inventario_Disponible, 'Inventario_Disponible', sku);
  const trans = getNumericValue(doc.Cantidad_Transito, 'Cantidad_Transito', sku);
  const conf = getNumericValue(doc.Cantidad_Confirmada_Total, 'Cantidad_Confirmada_Total', sku);
  const demandaInd = getNumericValue(doc.Cantidad_Demanda_Indirecta, 'Cantidad_Demanda_Indirecta', sku);
  const rop = getNumericValue(doc.ROP, 'ROP', sku);
  
  // Convertir Nivel_OA a número si es string
  const nivelOA = typeof doc.Nivel_OA === 'string' ? parseInt(doc.Nivel_OA) : (doc.Nivel_OA || 0);

  const comparador = nivelOA >= 2
    ? inv + trans - conf - demandaInd
    : inv + trans - conf;

  const requiere = rop > comparador ? "Si" : "No";
  
  writeToLog(`    AUTO-CÁLCULO REQUIERE_REPOSICION:`);
  writeToLog(`      ROP: ${rop}, Comparador: ${comparador} => ${requiere}`);
  
  return requiere;
}

async function actualizarDatos() {
  writeToLog(`\n${now} - Paso 08 - Calculo del Plan de Reposicion en Cantidad (Nivel ${nivelFiltrado})`);

  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Filtro corregido para manejar string y number
    let filter = {};
    if (nivelFiltrado !== null) {
      filter = { 
        $or: [
          { Nivel_OA: nivelFiltrado },
          { Nivel_OA: nivelFiltrado.toString() }
        ]
      };
      writeToLog(`  Filtrando por Nivel_OA: ${nivelFiltrado} (string o number)`);
    } else {
      writeToLog(`  Sin filtro de nivel (procesando todos los documentos)`);
    }

    const documentos = await collection.find(filter).toArray();
    writeToLog(`  Documentos encontrados: ${documentos.length}`);

    if (documentos.length === 0) {
      //writeToLog(`  [ERROR] No se encontraron documentos con el filtro especificado`);
      return;
    }

    // Analizar si existe Requiere_Reposicion
    const conRequiereReposicion = documentos.filter(d => d.Requiere_Reposicion !== undefined).length;
    const sinRequiereReposicion = documentos.length - conRequiereReposicion;
    
    writeToLog(`  Documentos CON Requiere_Reposicion: ${conRequiereReposicion}`);
    writeToLog(`  Documentos SIN Requiere_Reposicion: ${sinRequiereReposicion}`);

    // Mostrar estructura del primer documento
    if (documentos.length > 0) {
      const primer = documentos[0];
      writeToLog(`\n  === ESTRUCTURA PRIMER DOCUMENTO ===`);
      writeToLog(`    SKU: ${primer.SKU}`);
      writeToLog(`    Requiere_Reposicion: ${primer.Requiere_Reposicion}`);
      writeToLog(`    META: ${primer.META} (${typeof primer.META})`);
      writeToLog(`    Inventario_Disponible: ${primer.Inventario_Disponible} (${typeof primer.Inventario_Disponible})`);
      writeToLog(`    ROP: ${primer.ROP} (${typeof primer.ROP})`);
      writeToLog(`    Nivel_OA: ${primer.Nivel_OA} (${typeof primer.Nivel_OA})`);
    }

    const updates = [];
    let requierenReposicion = 0;
    let noRequierenReposicion = 0;
    let calculosAutomaticos = 0;
    let calculosPositivos = 0;

    for (let i = 0; i < documentos.length; i++) {
      const doc = documentos[i];
      const sku = doc.SKU || `DOC_${i}`;
      
      // Solo hacer log detallado para los primeros 10 documentos
      const logDetallado = i < 10;
      
      if (logDetallado) {
        writeToLog(`\n  === PROCESANDO SKU: ${sku} (${i + 1}/${documentos.length}) ===`);
      }

      try {
        // 1. Verificar o calcular Requiere_Reposicion
        let requiere;
        if (doc.Requiere_Reposicion === undefined || doc.Requiere_Reposicion === null) {
          if (logDetallado) writeToLog(`    Campo Requiere_Reposicion faltante, calculando...`);
          requiere = calcularRequiereReposicion(doc, sku) === "Si";
          calculosAutomaticos++;
        } else {
          requiere = doc.Requiere_Reposicion === 'Si';
          if (logDetallado) writeToLog(`    Requiere_Reposicion existente: "${doc.Requiere_Reposicion}" => ${requiere}`);
        }

        if (!requiere) {
          noRequierenReposicion++;
          if (logDetallado) writeToLog(`    RESULTADO: No requiere reposición, Plan = 0`);
          
          updates.push({
            updateOne: {
              filter: { _id: doc._id },
              update: {
                $set: {
                  Cantidad_Reponer: 0,
                  Plan_Reposicion_Cantidad: 0
                }
              }
            }
          });
          continue;
        }

        requierenReposicion++;

        // 2. Obtener valores para el cálculo
        const meta = getNumericValue(doc.META, 'META', sku);
        const confirmada = getNumericValue(doc.Cantidad_Confirmada_Total, 'Cantidad_Confirmada_Total', sku);
        
        // 3. Demanda indirecta según el nivel del documento (NO el parámetro filtro)
        const nivelOADoc = typeof doc.Nivel_OA === 'string' ? parseInt(doc.Nivel_OA) : (doc.Nivel_OA || 0);
        const indirecta = nivelOADoc >= 2 
          ? getNumericValue(doc.Cantidad_Demanda_Indirecta || doc["Cantidad Demanda Indirecta"], 'Cantidad_Demanda_Indirecta', sku)
          : 0;
        
        const inventario = getNumericValue(doc.Inventario_Disponible, 'Inventario_Disponible', sku);
        const transito = getNumericValue(doc.Cantidad_Transito, 'Cantidad_Transito', sku);

        // 4. Cálculo
        const suma = meta + confirmada + indirecta;
        const resta = inventario + transito;
        const diferencia = suma - resta;
        const calculo = Math.max(0, Math.ceil(diferencia));

        if (calculo > 0) calculosPositivos++;

        if (logDetallado) {
          writeToLog(`    VALORES PARA CÁLCULO:`);
          writeToLog(`      META: ${meta}`);
          writeToLog(`      Cantidad_Confirmada_Total: ${confirmada}`);
          writeToLog(`      Cantidad_Demanda_Indirecta: ${indirecta} (Nivel_OA=${nivelOADoc}, aplicada: ${nivelOADoc >= 2})`);
          writeToLog(`      Inventario_Disponible: ${inventario}`);
          writeToLog(`      Cantidad_Transito: ${transito}`);
          writeToLog(`    CÁLCULO:`);
          writeToLog(`      (${meta} + ${confirmada} + ${indirecta}) - (${inventario} + ${transito})`);
          writeToLog(`      ${suma} - ${resta} = ${diferencia}`);
          writeToLog(`      MAX(0, ROUND(${diferencia})) = ${calculo}`);
        }

        // Log especial para casos que requieren reposición pero dan 0
        if (calculo === 0) {
          writeToLog(`    [ALERT] SKU=${sku} requiere reposición pero calculo=0: META=${meta}, Inv=${inventario}, ROP=${doc.ROP}`);
        }

        updates.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                Cantidad_Reponer: calculo,
                Plan_Reposicion_Cantidad: calculo
              }
            }
          }
        });

      } catch (error) {
        writeToLog(`    [ERROR] Procesando SKU ${sku}: ${error.message}`);
        updates.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                Cantidad_Reponer: 0,
                Plan_Reposicion_Cantidad: 0
              }
            }
          }
        });
      }
    }

    writeToLog(`\n  === RESUMEN ANTES DE ACTUALIZAR ===`);
    writeToLog(`    Total documentos: ${documentos.length}`);
    writeToLog(`    Requieren reposición: ${requierenReposicion}`);
    writeToLog(`    No requieren reposición: ${noRequierenReposicion}`);
    writeToLog(`    Requiere_Reposicion calculados automáticamente: ${calculosAutomaticos}`);
    writeToLog(`    Cálculos con resultado > 0: ${calculosPositivos}`);

    if (updates.length > 0) {
      const result = await collection.bulkWrite(updates);
      writeToLog(`\n  === RESULTADO DE ACTUALIZACIÓN ===`);
      writeToLog(`    Documentos modificados: ${result.modifiedCount}`);
      writeToLog(`    Documentos coincidentes: ${result.matchedCount}`);
    }

    // Verificación final
    const totalConPlan = await collection.countDocuments({
      ...filter,
      Plan_Reposicion_Cantidad: { $gt: 0 }
    });

    writeToLog(`\n  RESULTADO FINAL: ${totalConPlan} documentos con Plan_Reposicion_Cantidad > 0`);

    // Mostrar algunos ejemplos de documentos con plan > 0
    const ejemplos = await collection.find({
      ...filter,
      Plan_Reposicion_Cantidad: { $gt: 0 }
    }, {
      projection: { SKU: 1, Plan_Reposicion_Cantidad: 1, META: 1, Inventario_Disponible: 1 }
    }).limit(5).toArray();

    if (ejemplos.length > 0) {
      writeToLog(`\n  EJEMPLOS CON PLAN > 0:`);
      ejemplos.forEach(e => {
        writeToLog(`    SKU: ${e.SKU}, Plan: ${e.Plan_Reposicion_Cantidad}, META: ${e.META}, Inv: ${e.Inventario_Disponible}`);
      });
    }

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
    console.log(message);
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
writeToLog(`INICIO PASO 08: ${now}`);
writeToLog(`Parámetros: dbName=${dbName}, DBUser=${DBUser}, nivelFiltrado=${nivelFiltrado}`);
writeToLog(`${'='.repeat(80)}`);

actualizarDatos().catch(error => {
  console.error('Error fatal:', error);
  writeToLog(`${moment().format('YYYY-MM-DD HH:mm:ss')} - [ERROR FATAL] ${error.message}`);
  process.exit(1);
});