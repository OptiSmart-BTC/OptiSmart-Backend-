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

const collection1 = 'plan_reposicion_01';

async function actualizarDatos() {
  writeToLog(`\nPaso 05 - Evaluación de Requiere_Reposicion (Nivel ${nivelFiltrado})`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const col = db.collection(collection1);

    const filtro = nivelFiltrado !== null ? { Nivel_OA: nivelFiltrado } : {};
    const docs = await col.find(filtro).toArray();

    const updates = [];
    let omitidos = 0;

    for (const doc of docs) {
      const inv = doc.Inventario_Disponible || 0;
      const trans = doc.Cantidad_Transito || 0;
      const conf = doc.Cantidad_Confirmada_Total || 0;
      const demandaInd = doc.Cantidad_Demanda_Indirecta ?? doc["Cantidad Demanda Indirecta"] ?? 0;
      const rop = doc.ROP || 0;

      if (typeof doc.Nivel_OA !== 'number') {
        writeToLog(`⚠️ Documento omitido por Nivel_OA inválido (SKU=${doc.SKU}): Nivel_OA = ${doc.Nivel_OA}`);
        omitidos++;
        continue;
      }

      const comparador = doc.Nivel_OA >= 2
        ? inv + trans - conf - demandaInd
        : inv + trans - conf;

      const requiere = rop > comparador ? "Si" : "No";

      updates.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { Requiere_Reposicion: requiere } }
        }
      });
    }

    if (updates.length > 0) {
      await col.bulkWrite(updates);
    }

    writeToLog(`\t✔ Requiere_Reposicion actualizado en ${updates.length} documentos`);
    if (omitidos > 0) writeToLog(`\t⚠️ ${omitidos} documentos fueron omitidos por Nivel_OA inválido.`);

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
