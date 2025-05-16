<<<<<<< HEAD
const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');
=======
const fs = require("fs");
const MongoClient = require("mongodb").MongoClient;
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");

const { host, puerto } = require("../Configuraciones/ConexionDB");
>>>>>>> origin/test

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];
<<<<<<< HEAD

//const uri = `mongodb://${host}:${puerto}/${dbName}`;
//const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

=======
const collectionName = process.argv.slice(2)[3] || "politica_inventarios_01";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
>>>>>>> origin/test

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
<<<<<<< HEAD
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


//const uri = 'mongodb://127.0.0.1:27017'; 
//const dbName = 'btc_opti_a001'; 
const collectionName = 'politica_inventarios_01'; 
=======
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");
>>>>>>> origin/test

const client = new MongoClient(mongoUri);

async function updateMETA() {
<<<<<<< HEAD

  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 14 - Calculo del Inventario objetivo al momento de hacer un pedido o META`);
=======
  writeToLog(
    `\nPaso 14 - Calculo del Inventario objetivo al momento de hacer un pedido o META`
  );
>>>>>>> origin/test

  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collectionName);
<<<<<<< HEAD
    
    const result = await col.aggregate([
      {
        $project: {
          ROQ: 1,
          SS_Cantidad: 1,
          META: { $add: ['$ROQ', '$SS_Cantidad'] }
        }
      }
    ]).toArray();

    // Actualizar los documentos en la colección con los nuevos valores de META
    await Promise.all(result.map(doc => col.updateOne({ _id: doc._id }, { $set: { META: doc.META } })));

    //console.log('Actualización exitosa');
    //writeToLog(`${now} - Ejecucion exitosa`);
    writeToLog(`\tTermina el Calculo de META`);
  } catch (error) {
    //console.error('Error al realizar la actualización:', error);
=======

    const result = await col
      .aggregate([
        {
          $project: {
            ROQ: 1,
            SS_Cantidad: 1,
            META: { $add: ["$ROQ", "$SS_Cantidad"] },
          },
        },
      ])
      .toArray();

    await Promise.all(
      result.map((doc) =>
        col.updateOne({ _id: doc._id }, { $set: { META: doc.META } })
      )
    );

    writeToLog(`\tTermina el Calculo de META`);
  } catch (error) {
>>>>>>> origin/test
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
<<<<<<< HEAD
  fs.appendFileSync(logFile, message + '\n');
=======
  fs.appendFileSync(logFile, message + "\n");
>>>>>>> origin/test
}

updateMETA();
