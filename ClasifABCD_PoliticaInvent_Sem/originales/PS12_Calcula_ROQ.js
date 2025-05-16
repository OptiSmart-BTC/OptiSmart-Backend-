const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

//const uri = `mongodb://${host}:${puerto}/${dbName}`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


const collectionName = 'politica_inventarios_01_sem'; // Cambia esto por el nombre de tu colección

const client = new MongoClient(mongoUri);

async function updateROQ() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 12 - Calculo de la Cantidad a reponer o ROQ`);

  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collectionName);
    
    const result = await col.aggregate([
      {
        $project: {
          Demanda_LT: 1,
          MOQ: 1,
          ROQ: {
            $multiply: [
              {
                $ceil: {
                  $divide: ['$Demanda_LT', '$MOQ']
                }
              },
              '$MOQ'
            ]
          }
        }
      }
    ]).toArray();

    // Actualizar los documentos en la colección con los nuevos valores de ROQ
    await Promise.all(result.map(doc => col.updateOne({ _id: doc._id }, { $set: { ROQ: doc.ROQ } })));

    //console.log('Actualización exitosa');
    //writeToLog(`${now} - Ejecucion exitosa`);
    writeToLog(`\tTermina el Calculo del ROQ`);
  } catch (error) {
    //console.error('Error al realizar la actualización:', error);
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

updateROQ();
