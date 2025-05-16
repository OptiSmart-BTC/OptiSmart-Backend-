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
  writeToLog(`\nPaso 13 - Calcula de los Tipos de Caso`);

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
        Tipo_Caso: {
          $cond: [
            { $gt: ["$Costo_UP", 0] },"Arriba de Rango",
            {
              $cond: [
                { $gt: ["$Costo_Down", 0] },"Abajo de Rango",
                {
                  $cond: [
                    {
                      $or: [
                        { $eq: ["$Inventario_Disponible", "SIN DEMANDA"] },
                        { $lte: ["$Inventario_Disponible", 0] }
                      ]
                    },
                    "Faltante",
                    "OK"
                  ]
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
          Tipo_Caso: doc.Tipo_Caso
        }
      }
    );
  }
console.log(result);
  writeToLog(`\tTermina el Calculo de los Tipos de Casos`);
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
