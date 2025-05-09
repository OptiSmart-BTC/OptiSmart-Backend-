const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`;

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const historicoDemandaCollection = 'requerimientos_confirmados';
const planRepoCollection = 'plan_reposicion_01';

async function calcularConfirmadaTotal() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 03 - Calculo de la Cantidad Confirmada Total`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const agregados = await db.collection(historicoDemandaCollection).aggregate([
      {
        $group: {
          _id: { Producto: "$Producto", Ubicacion: "$Ubicacion" },
          Cantidad_Confirmada_Total: { $sum: "$Cantidad_Confirmada" }
        }
      }
    ]).toArray();

    const updates = agregados.map(r => ({
      updateOne: {
        filter: {
          Producto: r._id.Producto,
          Ubicacion: r._id.Ubicacion
        },
        update: {
          $set: { Cantidad_Confirmada_Total: r.Cantidad_Confirmada_Total }
        }
      }
    }));

    if (updates.length > 0) {
      await db.collection(planRepoCollection).bulkWrite(updates);
    }

    writeToLog(`\tTermina el Calculo de la Cantidad Confirmada Total (${updates.length} registros)`);
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
  } finally {
    if (client) client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

calcularConfirmadaTotal();