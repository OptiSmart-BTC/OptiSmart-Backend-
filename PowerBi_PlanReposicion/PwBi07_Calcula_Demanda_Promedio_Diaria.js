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


const collection1 = 'powerbi_plan_reposicion_01';
const collection2 = 'politica_inventarios_01';

// Realizar la operación de join y actualización
async function actualizarDatos() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 03 - Calculo de la Demanda Promedio Diaria`);

  let client;
  try {

  client = await MongoClient.connect(mongoUri);
  //const client = await MongoClient.connect(url);
  const db = client.db(dbName);

  const col1 = db.collection(collection1);

  const col2 = db.collection(collection2);

  // Realizar el join y la actualización
  const result = await db.collection('powerbi_plan_reposicion_01').aggregate([
    {
      $lookup: {
        from: 'politica_inventarios_01',
        localField: 'Producto', 
        foreignField: 'Producto', 
        as: 'inventario_info'
      }
    },
    {
      $addFields: {
        Demanda_Promedio_Diaria: {
          $ifNull: [{ $arrayElemAt: ['$inventario_info.Demanda_Promedio_Diaria', 0] }, "SIN DEMANDA"]
        }
      }
    },
    {
      $project: {
        Producto: 1,
        Demanda_Promedio_Diaria: 1
      }
    }
  ]).toArray();


  for (const doc of result) {
  
    await col1.updateOne(
      { _id: doc._id },
      {
        $set: {
          Demanda_Promedio_Diaria: doc.Demanda_Promedio_Diaria
        }
      }
    );
  }
  
/*
  await db.collection('powerbi_plan_reposicion_01').updateMany(
    { Demanda_Promedio_Diaria: 0 },
    { $set: { Demanda_Promedio_Diaria: "SIN DEMANDA" } }
  );
*/
  
  writeToLog(`\tTermina el Calculo de la Demanda Promedio Diaria`);
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
