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
  writeToLog(`\nPaso 09 - Calculo del Plan de Reposicion en Pallets`);

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
        'Plan_Reposicion_Pallets': {
          $divide: ['$Plan_Reposicion_Cantidad', '$joinedData.Unidades_Pallet']
        }
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
          Plan_Reposicion_Pallets: doc.Plan_Reposicion_Pallets,
          //Plan_Firme_Pallets: doc.Plan_Reposicion_Pallets,
        }
      }
    );


    await col1.updateOne(
      { _id: doc._id },
      {
        $set: {
          //Plan_Reposicion_Pallets: doc.Plan_Reposicion_Pallets,
          Plan_Firme_Pallets: doc.Plan_Reposicion_Pallets,
        }
      }
    );





  }
  
  writeToLog(`\tTermina el Calculo del Plan de Reposicion en Pallets`);
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
  writeToLog(`\nPaso 09 - Cálculo de Plan de Reposición (múltiplo de MOQ, Nivel ${nivelFiltrado})`);
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
      if (!skuData) return null;

      const cantidadReponer = doc.Cantidad_Reponer || 0;
      const moq = skuData.MOQ > 0 ? skuData.MOQ : 1;
      const unidadesPallet = skuData.Unidades_Pallet > 0 ? skuData.Unidades_Pallet : 1;

      const planCantidad = cantidadReponer > 0
        ? Math.ceil(cantidadReponer / moq) * moq
        : 0;

      const planPallets = planCantidad > 0
        ? planCantidad / unidadesPallet
        : 0;

      console.log(`[DEBUG] SKU=${doc.SKU}, Nivel=${doc.Nivel_OA}, CantidadReponer=${cantidadReponer}, MOQ=${moq}, PlanCantidad=${planCantidad}`);

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              Plan_Reposicion_Cantidad: planCantidad,
              Plan_Reposicion_Pallets: planPallets,
              Plan_Firme_Pallets: planPallets
            }
          }
        }
      };
    }).filter(Boolean);

    if (updates.length > 0) {
      await col1.bulkWrite(updates);
    }

    writeToLog(`\tTermina el cálculo del Plan de Reposición ajustado a MOQ (Nivel ${nivelFiltrado})`);

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
=======
>>>>>>> origin/test
actualizarDatos().catch(console.error);
