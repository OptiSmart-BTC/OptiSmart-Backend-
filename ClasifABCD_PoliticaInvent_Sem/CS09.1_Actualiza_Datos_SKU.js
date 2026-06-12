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
const parte = parametro.substring(parametro.lastIndexOf('_') + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection1 = 'demanda_abcd_01_sem';
const collection2 = 'sku';

async function actualizarDatos() {
  writeToLog('\nPaso 09.1 - Actualizacion de Descripciones SKU');

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const col1 = db.collection(collection1);
    const col2 = db.collection(collection2);

    await col2.createIndex({ SKU: 1 }, { name: 'SKU_1' });

    await col1.aggregate([
      {
        $lookup: {
          from: collection2,
          localField: 'SKU',
          foreignField: 'SKU',
          as: 'joinedData'
        }
      },
      { $unwind: '$joinedData' },
      {
        $set: {
          Desc_Producto: '$joinedData.Desc_Producto',
          Familia_Producto: '$joinedData.Familia_Producto',
          Categoria: '$joinedData.Categoria',
          Segmentacion_Producto: '$joinedData.Segmentacion_Producto',
          Presentacion: '$joinedData.Presentacion',
          Desc_Ubicacion: '$joinedData.Desc_Ubicacion'
        }
      },
      { $unset: 'joinedData' },
      {
        $merge: {
          into: collection1,
          on: '_id',
          whenMatched: 'replace',
          whenNotMatched: 'discard'
        }
      }
    ], { allowDiskUse: true }).toArray();

    writeToLog('\tTermina la Actualizacion de Descripciones SKU');
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

actualizarDatos().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
