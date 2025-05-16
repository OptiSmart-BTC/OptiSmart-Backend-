const fs = require('fs');
const { MongoClient } = require('mongodb');
<<<<<<< HEAD
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
  writeToLog(`\nPaso 09.1 - Calculo del Plan de Reposicion en Costo`);

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
        'Plan_Reposicion_Costo': {
          $multiply: [
            '$Plan_Firme_Pallets', 
            '$joinedData.Costo_Unidad', 
            '$joinedData.Unidades_Pallet'
          ]
        }
      }
    }
  ]).toArray();
  
//writeToLog(JSON.stringify(result, null, 2));
  /*
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
        'Plan_Reposicion_Costo': {
          $multiply: ['$Plan_Reposicion_Cantidad', '$joinedData.Costo_Unidad']
        }
      }
    }
  ]).toArray();
*/



  console.log(result);
  // Actualizar los documentos en la colección 1
 
  for (const doc of result) {
  
    await col1.updateOne(
      { _id: doc._id },
      {
        $set: {
          Plan_Reposicion_Costo: doc.Plan_Reposicion_Costo
        }
      }
    );
  }
  
  writeToLog(`\tTermina el Calculo del Plan de Reposicion en Costo`);
  } catch (error) {
    // Manejar el error
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    // Cerrar la conexión a la base de datos
    if (client) {
      client.close();
    }
=======
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const nivelFiltrado = process.argv[5] ? parseInt(process.argv[5]) : null;

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parte = dbName.substring(dbName.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection1 = 'plan_reposicion_01';
const collection2 = 'sku';

async function actualizarDatos() {
  writeToLog(`\nPaso 09.1 - Calculo del Plan de Reposicion en Costo (Nivel ${nivelFiltrado})`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const col1 = db.collection(collection1);
    const col2 = db.collection(collection2);

    const filtro = nivelFiltrado !== null ? { Nivel_OA: nivelFiltrado } : {};
    const docs = await col1.find(filtro).toArray();

    const skuDocs = await col2.find({}).toArray();
    const skuMap = new Map();
    skuDocs.forEach(sku => skuMap.set(sku.SKU, sku));

    const updates = docs.map(doc => {
      const skuData = skuMap.get(doc.SKU);
      if (!skuData || skuData.Costo_Unidad == null || skuData.Unidades_Pallet == null) return null;

      const costoUnidad = skuData.Costo_Unidad;
      const unidadesPallet = skuData.Unidades_Pallet > 0 ? skuData.Unidades_Pallet : 1;
      const planFirmePallets = doc.Plan_Firme_Pallets || 0;

      const totalCosto = planFirmePallets * costoUnidad * unidadesPallet;

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              Plan_Reposicion_Costo: totalCosto
            }
          }
        }
      };
    }).filter(Boolean);

    if (updates.length > 0) {
      await col1.bulkWrite(updates);
    }

    writeToLog(`\tTermina el Calculo del Plan de Reposicion en Costo para Nivel ${nivelFiltrado}`);

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
