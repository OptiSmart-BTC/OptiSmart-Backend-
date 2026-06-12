const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf('_') + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;

async function actualizarMargenUnitario() {
  writeToLog('\nPaso 15 - Calculo del Margen Unitario por Semana');

  const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const abcdCollection = db.collection('demanda_abcd_01_sem');
    const skuCollection = db.collection('sku');

    await Promise.all([
      abcdCollection.createIndex({ SKU: 1 }, { name: 'SKU_1' }),
      skuCollection.createIndex({ SKU: 1 }, { name: 'SKU_1' })
    ]);

    await abcdCollection.aggregate([
      {
        $lookup: {
          from: 'sku',
          localField: 'SKU',
          foreignField: 'SKU',
          as: 'skuData'
        }
      },
      { $unwind: '$skuData' },
      { $set: { Margen_Unitario: '$skuData.MargenUnitario' } },
      { $unset: 'skuData' },
      {
        $merge: {
          into: 'demanda_abcd_01_sem',
          on: '_id',
          whenMatched: 'replace',
          whenNotMatched: 'discard'
        }
      }
    ], { allowDiskUse: true }).toArray();

    writeToLog('\tTermina el Calculo del Margen Unitario por Semana');
  } catch (error) {
    writeToLog(`Error: ${error}`);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

actualizarMargenUnitario().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
