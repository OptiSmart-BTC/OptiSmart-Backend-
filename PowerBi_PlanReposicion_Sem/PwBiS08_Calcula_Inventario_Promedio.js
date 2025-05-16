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


const collection1 = 'powerbi_plan_reposicion_01_sem';
const collection2 = 'politica_inventarios_01_sem';

// Realizar la operación de join y actualización
async function actualizarDatos() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 03 - Calculo del Inventario Promedio`);

  let client;
  try {

  client = await MongoClient.connect(mongoUri);
  //const client = await MongoClient.connect(url);
  const db = client.db(dbName);

  const col1 = db.collection(collection1);

  const col2 = db.collection(collection2);

  // Realizar el join y la actualización
  const result = await db.collection('powerbi_plan_reposicion_01_sem').aggregate([
    {
      $lookup: {
        from: 'politica_inventarios_01_sem',
        localField: 'Producto',       
        foreignField: 'Producto',      
        as: 'inventario_info'
      }
    },
    {
      $addFields: {
        Inventario_Promedio: {
          $ifNull: [{ $arrayElemAt: ['$inventario_info.Inventario_Promedio', 0] }, "SIN DEMANDA"]
        }
      }
    },
    {
      $project: {
        Producto: 1,
        Inventario_Promedio: 1
      }
    }
  ]).toArray();


  for (const doc of result) {
  
    await col1.updateOne(
      { _id: doc._id },
      {
        $set: {
          Inventario_Promedio: doc.Inventario_Promedio
        }
      }
    );
  }
  
  
  writeToLog(`\tTermina el Calculo del Inventario Promedio`);
  } catch (error) {
    // Manejar el error
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    // Cerrar la conexión a la base de datos
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
