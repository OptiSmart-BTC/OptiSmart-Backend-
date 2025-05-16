const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;


const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection = 'politica_inventarios_01_sem';

async function actualizarDatos() {
  writeToLog(`\nPaso 08 - Calculo del Promedio LT`);

  let client;
  try {

  client = await MongoClient.connect(mongoUri);
  const db = client.db(dbName);

  const col = db.collection(collection);

  const result = await col.aggregate([
    {
      $project: {
        _id: 1,
        Prom_LT: {
          $add: [
            {$multiply: ['$Lead_Time_Abasto','$Fill_Rate']}
            ,
            {$multiply: [{$add: ['$Frecuencia_Revision_dias', '$Lead_Time_Abasto']}
                        ,
                {
                  $subtract: [1, '$Fill_Rate'] 
                }
              ]
            }
          ]
        }
      }
    }
  ]).toArray();

  for (const doc of result) {
    await col.updateOne(
      { _id: doc._id },
      {
        $set: {
          Prom_LT: doc.Prom_LT
        }
      }
    );
  }

  writeToLog(`\tTermina el Calculo del Promedio LT`);
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
