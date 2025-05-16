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
const logFile = `${path_users}/${parametroFolder}/log/PowerBI_PlanReposicion.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection = 'powerbi_plan_reposicion_01';

// Realizar los cálculos y la actualización
async function actualizarDatos() {

  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 11 - Calcula la Rotacion_Anual_Dias`);

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
        Rotacion_Anual_Dias: {
          $cond: [
            { $or: [{ $eq: ["$Inventario_Promedio", "SIN DEMANDA"] }, { $eq: ["$Inventario_Promedio", 0] }, { $eq: ["$Inventario_Promedio", null] }] },
            0, 
            { $divide: [{ $multiply: ["$Demanda_Diaria", 365] }, "$Inventario_Promedio"] }
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
          Rotacion_Anual_Dias: doc.Rotacion_Anual_Dias
        }
      }
    );
  }
console.log(result);
  writeToLog(`\tTermina el Calculo de la Rotacion_Anual_Dias`);
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
