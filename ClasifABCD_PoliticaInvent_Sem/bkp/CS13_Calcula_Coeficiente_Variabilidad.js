const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../../Configuraciones/ConStrDB');
const moment = require('moment');


const { host, puerto} = require('../../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 


const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;

const collectionName = 'demanda_abcd_01_sem';


async function updateDocuments() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 13 - Calculo del Coeficiente de Variabilidad por Semana`);
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();


    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    await collection.updateMany(
      { Producto: { $ne: 'Producto' } },
      [
        {
          $set: {
            'Coeficiente_Variabilidad': {
              $divide: [
                '$DS_Demanda',
                '$Demanda_Promedio_Semanal_Costo'
              ]
            }
          }
        }
      ]
    );

    writeToLog(`\tTermina el Calculo del Coeficiente de Variabilidad por Semana`);
  } catch (err) {
    writeToLog(`${now} - Error al realizar la operación de actualización: ${err}`);
  } finally {
    client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}


updateDocuments();
