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

async function actualizarDatos() {
  writeToLog(`\nPaso 09.2 - Calculo del Costo por Unidad (Nivel ${nivelFiltrado})`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const col1 = db.collection(collection1);
    const col2 = db.collection(collection2);

    let filtro = {};
    if (nivelFiltrado !== null) {
      filtro = {
        $or: [
          { Nivel_OA: nivelFiltrado },
          { Nivel_OA: nivelFiltrado.toString() }
        ]
      };
    }
    
    const docs = await col1.find(filtro).toArray();
    const skuDocs = await col2.find({}).toArray();

    const skuMap = new Map();
    skuDocs.forEach(sku => skuMap.set(sku.SKU, sku));

    let stats = {
      procesados: 0,
      actualizados: 0
    };

    const updates = docs.map(doc => {
      stats.procesados++;
      
      const skuData = skuMap.get(doc.SKU);
      if (!skuData || skuData.Costo_Unidad == null) {
        return null;
      }

      const costoUnidad = parseFloat(skuData.Costo_Unidad);
      if (isNaN(costoUnidad) || costoUnidad <= 0) {
        return null;
      }

      const costoActual = parseFloat(doc.Costo_Unidad) || 0;
      if (Math.abs(costoActual - costoUnidad) < 0.001) {
        return null;
      }

      stats.actualizados++;

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              Costo_Unidad: costoUnidad
            }
          }
        }
      };
    }).filter(Boolean);

    if (updates.length > 0) {
      const result = await col1.bulkWrite(updates);
      writeToLog(`\tRegistros actualizados: ${result.modifiedCount} de ${stats.procesados} procesados`);
    } else {
      writeToLog(`\tNo hay registros para actualizar`);
    }

    writeToLog(`Termina el Calculo del Costo por Unidad para Nivel ${nivelFiltrado}`);

  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
    writeToLog(`${now} - [ERROR] Stack: ${error.stack}`);
    console.error('Error completo:', error);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

function writeToLog(message) {
  const timestamp = moment().format('HH:mm:ss');
  const logMessage = `[${timestamp}] ${message}`;
  fs.appendFileSync(logFile, logMessage + '\n');
  console.log(logMessage);
}

actualizarDatos().catch(console.error);