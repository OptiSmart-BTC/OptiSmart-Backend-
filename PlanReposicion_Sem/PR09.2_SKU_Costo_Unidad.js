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

const collection1 = 'plan_reposicion_01_se,';
const collection2 = 'sku';

async function actualizarDatos() {
  writeToLog(`\nPaso 09.2 - Calculo del Costo por Unidad (Nivel ${nivelFiltrado})`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const col1 = db.collection(collection1);
    const col2 = db.collection(collection2);

    const filtro = nivelFiltrado !== null ? { Nivel_OA: nivelFiltrado } : {};
    const docs = await col1.find(filtro).toArray();

    const skuDocs = await col2.find({}).toArray();
    const skuMap = new Map();
    skuDocs.forEach(sku => skuMap.set(sku.SKU, sku));

    const updates = docs.map(doc => {
      const skuData = skuMap.get(doc.SKU);
      if (!skuData || skuData.Costo_Unidad == null) return null;

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              Costo_Unidad: skuData.Costo_Unidad
            }
          }
        }
      };
    }).filter(Boolean);

    if (updates.length > 0) {
      await col1.bulkWrite(updates);
    }

    writeToLog(`\tTermina el Calculo del Costo por Unidad para Nivel ${nivelFiltrado}`);

  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

actualizarDatos().catch(console.error);
