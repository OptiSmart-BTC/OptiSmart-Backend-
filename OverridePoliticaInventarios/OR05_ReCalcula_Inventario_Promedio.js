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
const logFile = `../../${parametroFolder}/log/Override_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

async function calculateAndSetSSCantidad() {
  writeToLog(`\nPaso 05 - Re-Calculo de la Media del inventario estimado bajo la política de inventario.`);

  let client;
  client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(`${dbName}`); 
    const col = db.collection('politica_inventarios_01');

    const result = await col.aggregate([
      {
        $project: {
          Override_SS_Cantidad: 1,
          SS_Cantidad: 1, // Incluimos SS_Cantidad para la validación
          Override_ROP: 1, // Incluimos Override_ROP para la validación
          ROP: 1, // Incluimos ROP para la validación
          ROQ: 1, // Incluimos ROQ para el cálculo
          Inventario_Promedio: { 
            $add: [
              { $divide: ['$ROQ', 2] }, 
              { 
                $ifNull: ['$Override_SS_Cantidad', '$SS_Cantidad'] 
              }, 
              { 
                $ifNull: ['$Override_ROP', '$ROP'] 
              }
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

calculateAndSetSSCantidad();
