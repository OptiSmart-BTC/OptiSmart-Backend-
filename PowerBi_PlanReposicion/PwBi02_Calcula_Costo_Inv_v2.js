const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');
const { path_sftp, path_opti, path_users } = require(`../Configuraciones/paths_vars`);

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);


const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `${path_users}/${parametroFolder}/log/PowerBI_PlanReposicion.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collectionName = 'powerbi_plan_reposicion_01'; 

const client = new MongoClient(mongoUri);

async function updateCosto_Inv() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 02 - Calculo del Costo_Inv`);

  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collectionName);
    
    const result = await col.aggregate([
      {
        $project: {
          Costo_Inv: {
            $multiply: ['$Inventario_Disponible', '$Costo_Unidad']
          },
          CERO_INV: {
            $cond: [{ $eq: ['$Inventario_Disponible', 0] }, 0, 1]
          }
        }
      }
    ]).toArray();
    

    await Promise.all(result.map(doc => 
      col.updateOne(
        { _id: doc._id }, 
        { 
          $set: { 
            Costo_Inv: doc.Costo_Inv,
            CERO_INV: doc.CERO_INV  // Agregando el campo CERO_INV
          } 
        }
      )
    ));
    

    writeToLog(`\tTermina el Calculo del Costo_Inv`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

updateCosto_Inv();
