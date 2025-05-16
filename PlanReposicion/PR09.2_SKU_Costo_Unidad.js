const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

//const url = `mongodb://${host}:${puerto}/${dbName}`;
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


const collection1 = 'plan_reposicion_01';
const collection2 = 'sku';

// Realizar la operación de join y actualización
async function actualizarDatos() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 09.2 - Calculo del Costo por Unidad`);

  let client;
  try {

  client = await MongoClient.connect(mongoUri);
  //const client = await MongoClient.connect(url);
  const db = client.db(dbName);

  const col1 = db.collection(collection1);

  const col2 = db.collection(collection2);

  // Realizar el join y la actualización
  const result = await col1.aggregate([
    {
      $lookup: {
        from: collection2,
        localField: 'SKU',
        foreignField: 'SKU',
        as: 'joinedData'
      }
    },
    {
      $unwind: '$joinedData'
    },
    {
      $set: {
        'Costo_Unidad': '$joinedData.Costo_Unidad'
      }
    }
  ]).toArray();

  console.log(result);
  // Actualizar los documentos en la colección 1
 
  for (const doc of result) {
  
    await col1.updateOne(
      { _id: doc._id },
      {
        $set: {
          Costo_Unidad: doc.Costo_Unidad
        }
      }
    );
  }
  
  writeToLog(`\tTermina el Calculo del Costo por Unidad`);
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
