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
const logFile = `${path_users}/${parametroFolder}/log/PowerBI_PlanReposicion_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collectionName = 'powerbi_plan_reposicion_01_sem'; 

const client = new MongoClient(mongoUri);

async function updateCosto_Inv() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 09 - Calculo de los campos:`);
  writeToLog(`\t- Costo_A`);
  writeToLog(`\t- Costo_B`);
  writeToLog(`\t- Costo_C`); 
  writeToLog(`\t- Costo_D`);

  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collectionName);
    
    const result = await db.collection('powerbi_plan_reposicion_01_sem').aggregate([
      {
        $project: {
          _id: 1,
          Costo_A: { $cond: [{ $eq: ["$Clasificacion", "A"] }, { $ifNull: ["$Costo_Inv", 0] }, 0] },
          Costo_B: { $cond: [{ $eq: ["$Clasificacion", "B"] }, { $ifNull: ["$Costo_Inv", 0] }, 0] },
          Costo_C: { $cond: [{ $eq: ["$Clasificacion", "C"] }, { $ifNull: ["$Costo_Inv", 0] }, 0] },
          Costo_D: { $cond: [{ $eq: ["$Clasificacion", "D"] }, { $ifNull: ["$Costo_Inv", 0] }, 0] },
          }
      }
    ]).toArray();
    
    // Actualizar cada documento con los valores calculados
    await Promise.all(result.map(doc => 
      db.collection('powerbi_plan_reposicion_01_sem').updateOne(
        { _id: doc._id },
        { $set: {
            Costo_A: doc.Costo_A,
            Costo_B: doc.Costo_B,
            Costo_C: doc.Costo_C,
            Costo_D: doc.Costo_D
          }
        }
      )
    ));

    writeToLog(`\tTermina el Calculo de los Campos de Costos A, B, C y D`);
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
