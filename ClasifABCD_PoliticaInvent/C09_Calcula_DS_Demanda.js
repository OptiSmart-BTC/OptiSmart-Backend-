const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');
 
const { host, puerto} = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 

//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const collectionName = 'demanda_abcd_01';

async function actualizarDatos() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 09 - Calculo del DS de Demanda`);

  try {

    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const documentos = await collection.find().toArray();


    for (const document of documentos) {
      const raizCuadrada = Math.sqrt(document.Variabilidad_Demanda);

      await collection.updateOne(
        { _id: document._id },
        { $set: { DS_Demanda: raizCuadrada } }
      );

    }

    client.close();

    writeToLog(`\tTermina el Calculo del DS de Demanda`);
  } catch (err) {
    writeToLog(`${now} - Error: ${err}`);
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

actualizarDatos();
