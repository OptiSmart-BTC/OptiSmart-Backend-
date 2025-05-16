const fs = require('fs');
const { MongoClient } = require('mongodb');
<<<<<<< HEAD
const conex= require('../Configuraciones/ConStrDB');
=======
const conex = require('../Configuraciones/ConStrDB');
>>>>>>> origin/test
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

<<<<<<< HEAD
//const url = `mongodb://${host}:${puerto}/${dbName}`;
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


const collection1 = 'plan_reposicion_01';
const collection2 = 'inventario_transito';

// Realizar la operación de join y actualización
async function actualizarDatos() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 02 - Calculo del Inventario en Transito`);

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
        'Cantidad_Transito': '$joinedData.Cantidad_Transito',
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
          Cantidad_Transito: doc.Cantidad_Transito,
        }
      }
    );
  }

  writeToLog(`\tTermina el Calculo del Inventario en Transito`);
  } catch (error) {
    // Manejar el error
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    // Cerrar la conexión a la base de datos
    if (client) {
      client.close();
    }
=======
const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection1 = 'plan_reposicion_01';
const collection2 = 'inventario_transito';

async function actualizarDatos() {
  writeToLog(`\nPaso 02 - Calculo del Inventario en Transito`);
  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const col1 = db.collection(collection1);
    const col2 = db.collection(collection2);

    const docs = await col1.find({}).toArray();
    const transitoDocs = await col2.find({}).toArray();

    const transitoMap = new Map();
    transitoDocs.forEach(item => transitoMap.set(item.SKU, item.Cantidad_Transito));

    const updates = docs.map(doc => {
      const cantidad = transitoMap.get(doc.SKU);
      if (cantidad === undefined) return null;
      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              Cantidad_Transito: cantidad
            }
          }
        }
      };
    }).filter(Boolean);

    if (updates.length > 0) {
      await col1.bulkWrite(updates);
    }

    writeToLog(`\tTermina el Calculo del Inventario en Transito (${updates.length} registros actualizados)`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) client.close();
>>>>>>> origin/test
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

<<<<<<< HEAD
// Llamar a la función para actualizar los datos
actualizarDatos().catch(console.error);
=======
actualizarDatos().catch(console.error);
>>>>>>> origin/test
