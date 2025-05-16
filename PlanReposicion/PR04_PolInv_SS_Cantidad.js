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
const collection2 = 'politica_inventarios_01';

// Realizar la operación de join y actualización
async function actualizarDatos() {
  //writeToLog('------------------------------------------------------------------------------');
=======
const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection1 = 'plan_reposicion_01';
const collection2 = 'politica_inventarios_01';

async function actualizarDatos() {
>>>>>>> origin/test
  writeToLog(`\nPaso 04 - Campos relacionados a la Politica de Inventario`);
  writeToLog(`\t-Inventario de Seguridad (SS Cantidad)`);
  writeToLog(`\t-Punto de reorden (ROP)`);
  writeToLog(`\t-Inventario objetivo (META)`);

<<<<<<< HEAD

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
        'SS_Cantidad': '$joinedData.SS_Cantidad',
        'ROP': '$joinedData.ROP',
        'META': '$joinedData.META',
      }
    }
  ]).toArray();

  console.log(result);
  // Actualizar los documentos en la colección 1
 
  for (const doc of result) {
     /*
    await col1.updateOne(
      { _id: doc._id },
      {
        $set: {
          SS_Cantidad: doc.SS_Cantidad,
          ROP: doc.ROP,
          META: doc.META,
        }
      }
    );
  }
  */

  await col1.updateOne(
    { _id: doc._id },
    {
      $set: {
        SS_Cantidad: doc.SS_Cantidad,
      }
    }
  );

  // Segunda actualización: ROP
  await col1.updateOne(
    { _id: doc._id },
    {
      $set: {
        ROP: doc.ROP,
      }
    }
  );

  // Tercera actualización: META
  await col1.updateOne(
    { _id: doc._id },
    {
      $set: {
        META: doc.META,
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
  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const col1 = db.collection(collection1);
    const col2 = db.collection(collection2);

    const docs = await col1.find({}).toArray();
    const politicas = await col2.find({}).toArray();

    const poliMap = new Map();
    politicas.forEach(p => {
      poliMap.set(`${p.SKU}_${p.Ubicacion}`, p);
    });

    const updates = docs.map(doc => {
      const match = poliMap.get(`${doc.SKU}_${doc.Ubicacion}`);
      if (!match) return null;

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              SS_Cantidad: match.SS_Cantidad ?? 0,
              ROP: match.ROP ?? 0,
              META: match.META ?? 0
            }
          }
        }
      };
    }).filter(Boolean);

    if (updates.length > 0) {
      await col1.bulkWrite(updates);
    }

    writeToLog(`\tTermina el Calculo de la Política de Inventario (${updates.length} registros actualizados)`);
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
