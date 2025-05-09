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
  writeToLog(`\nPaso 01.1 - Actualizacion de Descripciones SKU`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const col1 = db.collection(collection1);
    const col2 = db.collection(collection2);

    const docs = await col1.find({}).toArray();
    const skuDocs = await col2.find({}).toArray();

    const skuMap = new Map();
    skuDocs.forEach(sku => skuMap.set(sku.SKU?.trim(), sku));

    const updates = docs.map(doc => {
      const skuMatch = skuMap.get(doc.SKU?.trim());
      if (!skuMatch) return null;

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              Desc_Producto: skuMatch.Desc_Producto || "0",
              Familia_Producto: skuMatch.Familia_Producto || "0",
              Categoria: skuMatch.Categoria || "0",
              Segmentacion_Producto: skuMatch.Segmentacion_Producto || "0",
              Presentacion: skuMatch.Presentacion || "0",
              Desc_Ubicacion: skuMatch.Desc_Ubicacion || "0",
              UOM_Base: skuMatch.Desc_Empaque_UOM_Base || "0"
            }
          }
        }
      };
    }).filter(Boolean);

    if (updates.length > 0) {
      await col1.bulkWrite(updates);
    }

    writeToLog(`\tTermina la Actualizacion de Descripciones SKU (${updates.length} registros)`);
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
