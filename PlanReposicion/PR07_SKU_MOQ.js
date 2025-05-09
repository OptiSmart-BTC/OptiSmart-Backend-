const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection1 = 'plan_reposicion_01';
const collection2 = 'sku';

async function actualizarDatos() {
  writeToLog(`\nPaso 07 - Calculo de la Cantidad Minima a Abastecer (MOQ)`);
  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const col1 = db.collection(collection1);
    const col2 = db.collection(collection2);

    const docs = await col1.find({}).toArray();
    const skuDocs = await col2.find({}).toArray();

    const skuMap = new Map();
    skuDocs.forEach(sku => skuMap.set(sku.SKU, sku));

    const updates = docs.map(doc => {
      const match = skuMap.get(doc.SKU);
      if (!match) return null;

      const moq = !match.MOQ || match.MOQ <= 0 ? 1 : match.MOQ;

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { MOQ: moq } }
        }
      };
    }).filter(Boolean);

    if (updates.length > 0) {
      await col1.bulkWrite(updates);
    }

    writeToLog(`\tTermina el Calculo del MOQ (${updates.length} registros actualizados)`);
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
