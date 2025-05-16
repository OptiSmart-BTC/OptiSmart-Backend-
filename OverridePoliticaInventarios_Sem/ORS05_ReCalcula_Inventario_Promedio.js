const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
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
const logFile = `../../${parametroFolder}/log/Override_PolInvent_Sem.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

async function calculateAndSetSSCantidad() {
  writeToLog(`\nPaso 05 - Re-Calculo de la Media del inventario estimado bajo la política de inventario.`);

  let client;
  client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(`${dbName}`);
    const col = db.collection('politica_inventarios_01_sem');

    const result = await col.aggregate([
      {
        $project: {
          ROQ: 1,
          Override_SS_Cantidad: 1,
          SS_Cantidad: 1, // Validación para usar valores predeterminados
          Override_ROP: 1,
          ROP: 1, // Validación para usar valores predeterminados
          Inventario_Promedio: {
            $add: [
              { $divide: ['$ROQ', 2] },
              { $ifNull: ['$Override_SS_Cantidad', '$SS_Cantidad'] },
              { $ifNull: ['$Override_ROP', '$ROP'] }
            ]
          }
        }
      }
    ]).toArray();

    for (const doc of result) {
      await col.updateOne(
        { _id: doc._id },
        { $set: { 'Inventario_Promedio': doc.Inventario_Promedio } }
      );
    }

    writeToLog(`\tTermina el Re-Calculo de la Media del inventario estimado bajo la política de inventario.`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Ejecutar la función
calculateAndSetSSCantidad();
