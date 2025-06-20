const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parte = dbName.substring(dbName.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collectionName = 'plan_reposicion_01';

async function calcularExcedente() {
  writeToLog(`\nPaso 12 - Cálculo de Alerta de Excedentes`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const docs = await collection.find().toArray();

    const updates = docs.map(doc => {
      const inv = doc.Inventario_Disponible || 0;
      const trans = doc.Cantidad_Transito || 0;
      const confirmada = doc.Cantidad_Confirmada_Total || 0;
      const demandaInd = doc.Cantidad_Demanda_Indirecta || doc["Cantidad Demanda Indirecta"] || 0;
      const meta = doc.META || 0;

      const total_inventario = inv + trans - confirmada - demandaInd;
      const excedente = total_inventario - meta;

      const alerta = excedente > 0 ? "SI" : "NO";

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: { Excedente_Alerta: alerta }
          }
        }
      };
    });

    if (updates.length > 0) {
      await collection.bulkWrite(updates);
      writeToLog(`\t✔ Excedente_Alerta actualizado en ${updates.length} documentos`);
    }
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) client.close();
  }
}

function writeToLog(msg) {
  fs.appendFileSync(logFile, msg + '\n');
}

calcularExcedente().catch(console.error);
