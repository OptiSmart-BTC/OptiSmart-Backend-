const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collectionName = 'politica_inventarios_01_sem'; 

const client = new MongoClient(mongoUri);

async function updateMETA() {

  writeToLog(`\nPaso 14 - Calculo del Inventario objetivo al momento de hacer un pedido o META`);

  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collectionName);
    
    const result = await col.aggregate([
      {
        $project: {
          ROQ: 1,
          SS_Cantidad: 1,
          // CAMBIO: Usar $ceil para redondear hacia arriba
          META: { 
            $ceil: { 
              $add: ['$ROQ', '$SS_Cantidad'] 
            } 
          }
        }
      }
    ]).toArray();

    // Actualizar los documentos en la colección con los nuevos valores de META
    await Promise.all(result.map(doc => col.updateOne({ _id: doc._id }, { $set: { META: doc.META } })));

    writeToLog(`\tTermina el Calculo de META`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

updateMETA();