const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const fs = require('fs');
const moment = require('moment');

const now = moment().format('YYYY-MM-DD HH:mm:ss');

const dbName = process.argv[2];
const parametroFolder = process.argv[3];
const AppUser = process.argv[4];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/dbvars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`;

async function writeToLog(message) {
  fs.appendFileSync(logFile, `${message}\n`);
}

async function actualizarUbisSaved() {
  writeToLog(`\nPaso 08 - Actualización de la colección 'ubis_saved'`);

  try {
    const passadminDeCripta = await decryptData(`${DBPassword}`);
    const mongoUri = conex.getUrl(DBUser, passadminDeCripta, host, puerto, dbName);
    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = client.db();

    const skuCollection = db.collection('sku');
    const ubisSavedCollection = db.collection('ubis_saved');

    const ubicacionesSKU = await skuCollection
      .aggregate([
        {
          $group: {
            _id: '$Ubicacion',
            Desc_Ubicacion: { $first: '$Desc_Ubicacion' }
          }
        }
      ])
      .toArray();

    const ubicacionesSKUMap = new Map(ubicacionesSKU.map(u => [u._id, u.Desc_Ubicacion]));

    const ubicacionesGuardadas = await ubisSavedCollection.find({}).toArray();
    const guardadasMap = new Map(ubicacionesGuardadas.map(u => [u.Ubicacion, u.Desc_Ubicacion]));

    let insertadas = 0;
    let actualizadas = 0;
    let eliminadas = 0;

    for (const [ubi, desc] of ubicacionesSKUMap) {
      if (!guardadasMap.has(ubi)) {
        await ubisSavedCollection.insertOne({ Ubicacion: ubi, Desc_Ubicacion: desc });
        insertadas++;
      } else if (guardadasMap.get(ubi) !== desc) {
        await ubisSavedCollection.updateOne({ Ubicacion: ubi }, { $set: { Desc_Ubicacion: desc } });
        actualizadas++;
      }
    }

    for (const [ubi] of guardadasMap) {
      if (!ubicacionesSKUMap.has(ubi)) {
        await ubisSavedCollection.deleteOne({ Ubicacion: ubi });
        eliminadas++;
      }
    }

    writeToLog(`\tUbicaciones insertadas en 'ubis_saved': ${insertadas}`);
    writeToLog(`\tUbicaciones actualizadas en 'ubis_saved': ${actualizadas}`);
    writeToLog(`\tUbicaciones eliminadas de 'ubis_saved': ${eliminadas}`);

    client.close();
  } catch (error) {
    writeToLog(`${now} - Error en 'ubis_saved': ${error}`);
    console.error(error);
  }
}

actualizarUbisSaved();
