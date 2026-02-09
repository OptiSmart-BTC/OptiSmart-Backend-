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
const collection2 = 'sku';

// Función helper para obtener valor numérico seguro
function getNumericValue(value, fieldName, sku, defaultValue = 0) {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  
  const numValue = Number(value);
  if (isNaN(numValue)) {
    writeToLog(`    [WARNING] ${sku}: ${fieldName} no es numérico (${value}), usando ${defaultValue}`);
    return defaultValue;
  }
  
  return numValue;
}

// Función para calcular si requiere reposición
function calcularRequiereReposicion(doc, sku) {
  const inv = getNumericValue(doc.Inventario_Disponible, 'Inventario_Disponible', sku);
  const trans = getNumericValue(doc.Cantidad_Transito, 'Cantidad_Transito', sku);
  const conf = getNumericValue(doc.Cantidad_Confirmada_Total, 'Cantidad_Confirmada_Total', sku);
  const demandaInd = getNumericValue(doc.Cantidad_Demanda_Indirecta, 'Cantidad_Demanda_Indirecta', sku);
  const rop = getNumericValue(doc.ROP, 'ROP', sku);
  
  const nivelOA = typeof doc.Nivel_OA === 'string' ? parseInt(doc.Nivel_OA) : (doc.Nivel_OA || 0);

  const comparador = nivelOA >= 2
    ? inv + trans - conf - demandaInd
    : inv + trans - conf;

  return rop > comparador ? "Si" : "No";
}

// Función para calcular cantidad a reponer
function calcularCantidadReponer(doc, sku) {
  const meta = getNumericValue(doc.META, 'META', sku);
  const confirmada = getNumericValue(doc.Cantidad_Confirmada_Total, 'Cantidad_Confirmada_Total', sku);
  const inventario = getNumericValue(doc.Inventario_Disponible, 'Inventario_Disponible', sku);
  const transito = getNumericValue(doc.Cantidad_Transito, 'Cantidad_Transito', sku);
  
  const nivelOADoc = typeof doc.Nivel_OA === 'string' ? parseInt(doc.Nivel_OA) : (doc.Nivel_OA || 0);
  const indirecta = nivelOADoc >= 2 
    ? getNumericValue(doc.Cantidad_Demanda_Indirecta || doc["Cantidad Demanda Indirecta"], 'Cantidad_Demanda_Indirecta', sku)
    : 0;
  
  const suma = meta + confirmada + indirecta;
  const resta = inventario + transito;
  const diferencia = suma - resta;
  const calculo = Math.max(0, Math.round(diferencia));
  
  return calculo;
}

async function actualizarDatos() {
  writeToLog(`\n${now} - Paso 09 - Cálculo de Plan de Reposición (múltiplo de MOQ, Nivel ${nivelFiltrado})`);
  let client;                             

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const col1 = db.collection(collection1);
    const col2 = db.collection(collection2);

    // Filtro corregido para manejar string y number
    let filtro = {};
    if (nivelFiltrado !== null) {
      filtro = { 
        $or: [
          { Nivel_OA: nivelFiltrado },
          { Nivel_OA: nivelFiltrado.toString() }
        ]
      };
      writeToLog(`  Filtrando por Nivel_OA: ${nivelFiltrado} (string o number)`);
    } else {
      writeToLog(`  Sin filtro de nivel (procesando todos los documentos)`);
    }

    const docs = await col1.find(filtro).toArray();
    writeToLog(`  Documentos en plan_reposicion_01_sem: ${docs.length}`);

    if (docs.length === 0) {
      //writeToLog(`  [ERROR] No se encontraron documentos con el filtro especificado`);
      return;
    }

    // Obtener datos de SKU
    const skuDocs = await col2.find({}).toArray();
    writeToLog(`  Documentos en colección SKU: ${skuDocs.length}`);
    
    const skuMap = new Map();
    skuDocs.forEach(sku => {
      skuMap.set(sku.SKU, sku);
    });

    // Analizar estructura de datos
    if (docs.length > 0) {
      const primer = docs[0];
      writeToLog(`\n  === ESTRUCTURA PRIMER DOCUMENTO PLAN ===`);
      writeToLog(`    SKU: ${primer.SKU}`);
      writeToLog(`    Cantidad_Reponer: ${primer.Cantidad_Reponer} (${typeof primer.Cantidad_Reponer})`);
      writeToLog(`    Requiere_Reposicion: ${primer.Requiere_Reposicion}`);
      writeToLog(`    META: ${primer.META}`);
      writeToLog(`    Inventario_Disponible: ${primer.Inventario_Disponible}`);
      
      const skuData = skuMap.get(primer.SKU);
      if (skuData) {
        writeToLog(`  === ESTRUCTURA PRIMER DOCUMENTO SKU ===`);
        writeToLog(`    SKU: ${skuData.SKU}`);
        writeToLog(`    MOQ: ${skuData.MOQ} (${typeof skuData.MOQ})`);
        writeToLog(`    Unidades_Pallet: ${skuData.Unidades_Pallet} (${typeof skuData.Unidades_Pallet})`);
      } else {
        writeToLog(`  [WARNING] No se encontró SKU ${primer.SKU} en colección SKU`);
      }
    }

    let sinSKU = 0;
    let sinCantidadReponer = 0;
    let conPlanPositivo = 0;
    let cantidadReponerCalculada = 0;
    let requiereReposicionCalculado = 0;
    
    const updates = [];

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const sku = doc.SKU || `DOC_${i}`;
      
      // Log detallado para los primeros 10
      const logDetallado = i < 10;
      
      if (logDetallado) {
        writeToLog(`\n  === PROCESANDO SKU: ${sku} (${i + 1}/${docs.length}) ===`);
      }

      try {
        // 1. Verificar si existe en colección SKU
        const skuData = skuMap.get(doc.SKU);
        if (!skuData) {
          sinSKU++;
          if (logDetallado) writeToLog(`    [ERROR] SKU no encontrado en colección SKU`);
          continue;
        }

        // 2. Verificar/calcular Cantidad_Reponer
        let cantidadReponer = getNumericValue(doc.Cantidad_Reponer, 'Cantidad_Reponer', sku);
        
        if (cantidadReponer === 0) {
          // Si Cantidad_Reponer es 0, verificar si realmente debe serlo
          let requiere;
          if (doc.Requiere_Reposicion === undefined || doc.Requiere_Reposicion === null) {
            if (logDetallado) writeToLog(`    Requiere_Reposicion faltante, calculando...`);
            requiere = calcularRequiereReposicion(doc, sku) === "Si";
            requiereReposicionCalculado++;
          } else {
            requiere = doc.Requiere_Reposicion === 'Si';
          }
          
          if (requiere) {
            cantidadReponer = calcularCantidadReponer(doc, sku);
            cantidadReponerCalculada++;
            if (logDetallado) writeToLog(`    Cantidad_Reponer recalculada: ${cantidadReponer}`);
          } else {
            sinCantidadReponer++;
            if (logDetallado) writeToLog(`    No requiere reposición, saltando...`);
            continue;
          }
        }

        if (cantidadReponer <= 0) {
          sinCantidadReponer++;
          if (logDetallado) writeToLog(`    Cantidad_Reponer = ${cantidadReponer}, saltando...`);
          continue;
        }

        // 3. Obtener MOQ y Unidades_Pallet
        const moq = getNumericValue(skuData.MOQ, 'MOQ', sku, 1);
        const unidadesPallet = getNumericValue(skuData.Unidades_Pallet, 'Unidades_Pallet', sku, 1);

        // 4. Calcular plan ajustado a MOQ
        const planCantidad = Math.ceil(cantidadReponer / moq) * moq;
        const planPallets = planCantidad / unidadesPallet;

        if (planCantidad > 0) conPlanPositivo++;

        if (logDetallado) {
          writeToLog(`    VALORES PARA CÁLCULO MOQ:`);
          writeToLog(`      Cantidad_Reponer: ${cantidadReponer}`);
          writeToLog(`      MOQ: ${moq}`);
          writeToLog(`      Unidades_Pallet: ${unidadesPallet}`);
          writeToLog(`    CÁLCULO:`);
          writeToLog(`      Plan_Cantidad = CEIL(${cantidadReponer} / ${moq}) * ${moq} = ${planCantidad}`);
          writeToLog(`      Plan_Pallets = ${planCantidad} / ${unidadesPallet} = ${planPallets}`);
        }

        updates.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                Plan_Reposicion_Cantidad: planCantidad,
                Plan_Reposicion_Pallets: planPallets,
                Plan_Firme_Pallets: planPallets
              }
            }
          }
        });

      } catch (error) {
        writeToLog(`    [ERROR] Procesando SKU ${sku}: ${error.message}`);
      }
    }

    writeToLog(`\n  === RESUMEN ANTES DE ACTUALIZAR ===`);
    writeToLog(`    Total documentos procesados: ${docs.length}`);
    writeToLog(`    SKUs no encontrados en colección SKU: ${sinSKU}`);
    writeToLog(`    Sin cantidad a reponer: ${sinCantidadReponer}`);
    writeToLog(`    Con plan de reposición > 0: ${conPlanPositivo}`);
    writeToLog(`    Cantidad_Reponer recalculada: ${cantidadReponerCalculada}`);
    writeToLog(`    Requiere_Reposicion recalculado: ${requiereReposicionCalculado}`);
    writeToLog(`    Updates a realizar: ${updates.length}`);

    if (updates.length > 0) {
      const result = await col1.bulkWrite(updates);
      writeToLog(`\n  === RESULTADO DE ACTUALIZACIÓN ===`);
      writeToLog(`    Documentos modificados: ${result.modifiedCount}`);
      writeToLog(`    Documentos coincidentes: ${result.matchedCount}`);
    }

    // Verificación final
    const totalConPlan = await col1.countDocuments({
      ...filtro,
      Plan_Reposicion_Cantidad: { $gt: 0 }
    });

    writeToLog(`\n  RESULTADO FINAL: ${totalConPlan} documentos con Plan_Reposicion_Cantidad > 0`);

    // Mostrar algunos ejemplos
    const ejemplos = await col1.find({
      ...filtro,
      Plan_Reposicion_Cantidad: { $gt: 0 }
    }, {
      projection: { 
        SKU: 1, 
        Plan_Reposicion_Cantidad: 1, 
        Plan_Reposicion_Pallets: 1,
        Cantidad_Reponer: 1,
        META: 1,
        Inventario_Disponible: 1
      }
    }).limit(5).toArray();

    if (ejemplos.length > 0) {
      writeToLog(`\n  EJEMPLOS CON PLAN > 0:`);
      ejemplos.forEach(e => {
        writeToLog(`    SKU: ${e.SKU}, Plan_Cant: ${e.Plan_Reposicion_Cantidad}, Plan_Pallets: ${e.Plan_Reposicion_Pallets}, Cant_Reponer: ${e.Cantidad_Reponer}`);
      });
    }

    writeToLog(`\n  Termina el cálculo del Plan de Reposición ajustado a MOQ (Nivel ${nivelFiltrado})`);

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
writeToLog(`INICIO PASO 09: ${now}`);
writeToLog(`Parámetros: dbName=${dbName}, DBUser=${DBUser}, nivelFiltrado=${nivelFiltrado}`);
writeToLog(`${'='.repeat(80)}`);

actualizarDatos().catch(error => {
  console.error('Error fatal:', error);
  writeToLog(`${moment().format('YYYY-MM-DD HH:mm:ss')} - [ERROR FATAL] ${error.message}`);
  process.exit(1);
});