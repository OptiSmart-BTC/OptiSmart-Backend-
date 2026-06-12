const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parametroFolder = dbName
  .substring(dbName.lastIndexOf('_') + 1)
  .toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion_Sem.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

async function validarCostos() {
  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const plan = client.db(dbName).collection('plan_reposicion_01_sem');

    const [total, sinNivel, sinCosto] = await Promise.all([
      plan.countDocuments(),
      plan.countDocuments({
        Nivel_OA: { $nin: [0, 1, 2, 3, '0', '1', '2', '3'] }
      }),
      plan.countDocuments({
        $or: [
          { Costo_Unidad: { $exists: false } },
          { Costo_Unidad: null },
          { Costo_Unidad: { $lte: 0 } }
        ]
      })
    ]);

    if (total === 0) {
      throw new Error('El plan semanal no contiene registros.');
    }
    if (sinNivel > 0 || sinCosto > 0) {
      throw new Error(
        `Validacion incompleta: ${sinNivel} registros sin Nivel_OA y ${sinCosto} sin Costo_Unidad valido.`
      );
    }

    writeToLog(
      `\tValidacion de costos correcta: ${total} registros con nivel y costo unitario.`
    );
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (client) await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, `${message}\n`);
}

validarCostos();
