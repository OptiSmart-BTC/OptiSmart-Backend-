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
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

async function actualizarDatos() {
  writeToLog(`\nPaso 06 - Calculo de la Cantidad a Reponer (Nivel ${nivelFiltrado})`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const collection = db.collection('plan_reposicion_01');

    const documentos = await collection.find({ Nivel_OA: nivelFiltrado }).toArray();

    const updates = documentos.map(doc => {
      const requiereRepos = doc.Requiere_Reposicion === "Si";

      const inv = doc.Inventario_Disponible || 0;
      const trans = doc.Cantidad_Transito || 0;
      const confirmada = doc.Cantidad_Confirmada_Total || 0;
      const meta = doc.META || 0;
      const demandaInd = (nivelFiltrado >= 2) ? (doc["Cantidad Demanda Indirecta"] || 0) : 0;

      const calculo = requiereRepos
        ? Math.max(0, Math.round(meta + confirmada + demandaInd - inv - trans))
        : 0;

      // 🟡 Log de depuración
      if (requiereRepos) {
        console.log(`[DEPURACIÓN] SKU=${doc.SKU}, Nivel=${nivelFiltrado}, META=${meta}, Confirmada=${confirmada}, DemandaInd=${demandaInd}, Inv=${inv}, Trans=${trans} => Reponer=${calculo}`);
      }

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { Cantidad_Reponer: calculo } }
        }
      };
    });

    if (updates.length > 0) {
      await collection.bulkWrite(updates);
    }

    writeToLog(`\tTermina el Calculo de la Cantidad a Reponer (${updates.length} documentos actualizados)`);

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
