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
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collectionName = 'plan_reposicion_01';

async function actualizarDatos() {
  writeToLog(`\nPaso 08 - Calculo del Plan de Reposicion en Cantidad (Nivel ${nivelFiltrado})`);

  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const filter = nivelFiltrado !== null ? { Nivel_OA: nivelFiltrado } : {};
    const documentos = await collection.find(filter).toArray();

    const updates = [];

    for (const doc of documentos) {
      const requiere = doc.Requiere_Reposicion === 'Si';
      const meta = doc.META || 0;
      const confirmada = doc.Cantidad_Confirmada_Total || 0;
      const indirecta = (nivelFiltrado >= 2)
        ? (doc["Cantidad Demanda Indirecta"] || doc.Cantidad_Demanda_Indirecta || 0)
        : 0;
      const inventario = doc.Inventario_Disponible || 0;
      const transito = doc.Cantidad_Transito || 0;

      const calculo = requiere
        ? Math.max(0, Math.round(meta + confirmada + indirecta - inventario - transito))
        : 0;

      if (requiere && calculo === 0) {
        writeToLog(`⚠️ SKU=${doc.SKU} marcado como "Si" pero calculo da 0. meta=${meta}, confirmada=${confirmada}, indirecta=${indirecta}, inventario=${inventario}, transito=${transito}`);
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
    }

    if (updates.length > 0) {
      await collection.bulkWrite(updates);
    }

    writeToLog(`\t✔ Cantidad y Plan_Reposicion_Cantidad calculados en ${updates.length} documentos para Nivel ${nivelFiltrado}`);
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
