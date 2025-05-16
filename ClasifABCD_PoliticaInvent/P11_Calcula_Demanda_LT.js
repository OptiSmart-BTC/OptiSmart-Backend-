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
 
async function calculateAndUpdateDemandaLT() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 11 - Calculo de la Cantidad de Demanda en el periodo de reposición`);

  let client;
  client = new MongoClient(mongoUri);
  //const client = new MongoClient(uri);
=======
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

async function calculateAndUpdateDemandaLT() {
  writeToLog(
    `\nPaso 11 - Calculo de la Cantidad de Demanda en el periodo de reposición`
  );

  let client;
  client = new MongoClient(mongoUri);
>>>>>>> origin/test

  try {
    await client.connect();
    const database = client.db(`${dbName}`);
<<<<<<< HEAD
    const collection = database.collection('politica_inventarios_01');
=======
    const collection = database.collection(collectionName);
>>>>>>> origin/test

    const pipeline = [
      {
        $project: {
          Demanda_LT: {
            $multiply: [
<<<<<<< HEAD
              { $add: ['$Prom_LT', '$Frecuencia_Revision_dias'] },
              '$Demanda_Promedio_Diaria'
            ]
          }
        }
      }
=======
              { $add: ["$Prom_LT", "$Frecuencia_Revision_dias"] },
              "$Demanda_Promedio_Diaria",
            ],
          },
        },
      },
>>>>>>> origin/test
    ];

    const result = await collection.aggregate(pipeline).toArray();
    for (const doc of result) {
<<<<<<< HEAD
      await collection.updateOne({ _id: doc._id }, { $set: { Demanda_LT: doc.Demanda_LT } });
    }

    //console.log('Demanda_LT actualizado correctamente.');
    //writeToLog(`${now} - Ejecucion exitosa`);
    writeToLog(`\tTermina el Calculo de la Cantidad de Demanda en el periodo de reposición`);
  } catch (error) {
    //console.error('Error al calcular y actualizar Demanda_LT:', error);
=======
      await collection.updateOne(
        { _id: doc._id },
        { $set: { Demanda_LT: doc.Demanda_LT } }
      );
    }

    writeToLog(
      `\tTermina el Calculo de la Cantidad de Demanda en el periodo de reposición`
    );
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

calculateAndUpdateDemandaLT();
