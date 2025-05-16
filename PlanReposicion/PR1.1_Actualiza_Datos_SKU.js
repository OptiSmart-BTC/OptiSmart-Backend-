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

=======
const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
>>>>>>> origin/test
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

<<<<<<< HEAD

const collection1 = 'plan_reposicion_01';
const collection2 = 'sku';

// Realizar la operación de join y actualización
async function actualizarDatos() {
  //writeToLog('------------------------------------------------------------------------------');
=======
const collection1 = 'plan_reposicion_01';
const collection2 = 'sku';

async function actualizarDatos() {
>>>>>>> origin/test
  writeToLog(`\nPaso 01.1 - Actualizacion de Descripciones SKU`);

  let client;
  try {
<<<<<<< HEAD

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
        'Desc_Producto': '$joinedData.Desc_Producto',
        'Familia_Producto': '$joinedData.Familia_Producto',
        'Categoria': '$joinedData.Categoria',
        'Segmentacion_Producto': '$joinedData.Segmentacion_Producto',
        'Presentacion': '$joinedData.Presentacion',
        'Desc_Ubicacion': '$joinedData.Desc_Ubicacion',
        'UOM_Base': '$joinedData.Desc_Empaque_UOM_Base',
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
          Desc_Producto:  doc.Desc_Producto,
          Familia_Producto: doc.Familia_Producto,
          Categoria: doc.Categoria,
          Segmentacion_Producto: doc.Segmentacion_Producto,
          Presentacion: doc.Presentacion,
          Desc_Ubicacion: doc.Desc_Ubicacion,
          UOM_Base: doc.UOM_Base
        }
      }
    );
  }
  
  writeToLog(`\tTermina la Actualizacion de Descripciones SKU`);
  } catch (error) {
    // Manejar el error
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    // Cerrar la conexión a la base de datos
    if (client) {
      client.close();
    }
=======
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const col1 = db.collection(collection1);
    const col2 = db.collection(collection2);

    const docs = await col1.find({}).toArray();
    const skuDocs = await col2.find({}).toArray();

    const skuMap = new Map();
    skuDocs.forEach(sku => skuMap.set(sku.SKU?.trim(), sku));

    const updates = docs.map(doc => {
      const skuMatch = skuMap.get(doc.SKU?.trim());
      if (!skuMatch) return null;

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              Desc_Producto: skuMatch.Desc_Producto || "0",
              Familia_Producto: skuMatch.Familia_Producto || "0",
              Categoria: skuMatch.Categoria || "0",
              Segmentacion_Producto: skuMatch.Segmentacion_Producto || "0",
              Presentacion: skuMatch.Presentacion || "0",
              Desc_Ubicacion: skuMatch.Desc_Ubicacion || "0",
              UOM_Base: skuMatch.Desc_Empaque_UOM_Base || "0"
            }
          }
        }
      };
    }).filter(Boolean);

    if (updates.length > 0) {
      await col1.bulkWrite(updates);
    }

    writeToLog(`\tTermina la Actualizacion de Descripciones SKU (${updates.length} registros)`);
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
