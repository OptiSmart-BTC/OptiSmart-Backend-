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
const logFile = `../../${parametroFolder}/log/Override_PolInvent_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection1 = 'politica_inventarios_01_sem';
const collection2 = 'sku';

async function actualizarDatos() {
  writeToLog('\nPaso 01 - Validación Override SI o NO');

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const col1 = db.collection(collection1);

    const result = await col1.aggregate([
      {
        $project: {
          _id: 1,
          Override_SI_NO: {
            $cond: {
              if: { $ne: [{ $ifNull: ['$Override_SS_Cantidad', '$SS_Cantidad'] }, '$STAT_SS'] },
              then: 'SI',
              else: 'NO'
            }
          },
          Override_ROP_SI_NO: {
            $cond: {
              if: { $ne: [{ $ifNull: ['$Override_ROP', '$ROP'] }, '$STAT_ROP'] },
              then: 'SI',
              else: 'NO'
            }
          }
        }
      }
    ]).toArray();

    console.log(result);

    // Actualizar los documentos en la colección 1
    for (const doc of result) {
      await col1.updateOne(
        { _id: doc._id },
        {
          $set: {
            Override_SI_NO: doc.Override_SI_NO,
            Override_ROP_SI_NO: doc.Override_ROP_SI_NO
          }
        }
      );
    }

    writeToLog('\tTermina el proceso de Validación Override SI o NO');
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) {
      client.close();
    }
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Llamar a la función para actualizar los datos
actualizarDatos().catch(console.error);
