const fs = require('fs');
const { MongoClient } = require('mongodb');
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

const collection = 'powerbi_plan_reposicion_01_sem';

// Realizar los cálculos y la actualización
async function actualizarDatos() {

  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 12 - Calcula de los Dias de Cobertura`);

  let client;
  try {

  client = await MongoClient.connect(mongoUri);
  const db = client.db(dbName);
  const col = db.collection(collection);

  // Realizar los cálculos y la actualización
  const result = await col.aggregate([
    {
      $project: {
        _id: 1,
        Dias_Cobertura: {
          $cond: [
            { 
              $or: [
                { $eq: ["$Inventario_Disponible", "SIN DEMANDA"] },
                { $eq: ["$Demanda_Promedio_Semanal", "SIN DEMANDA"] },
                { $eq: ["$Inventario_Disponible", 0] },
                { $eq: ["$Demanda_Promedio_Semanal", 0] },
                { $eq: ["$Inventario_Disponible", null] },
                { $eq: ["$Demanda_Promedio_Semanal", null] }
              ]
            },
            0,  
            { $divide: [
              { $multiply: ["$Inventario_Disponible", 7] },
              "$Demanda_Promedio_Semanal"
            ]} 
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
          Dias_Cobertura: doc.Dias_Cobertura
        }
      }
    );
  }
console.log(result);
  writeToLog(`\tTermina el Calculo de los Dias de Cobertura`);
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
