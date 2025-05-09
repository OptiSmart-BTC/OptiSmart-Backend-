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
  writeToLog(`\nPaso 03 - Calculo de la Clasificacion`);

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
        localField: 'Producto',
        foreignField: 'Producto',
        as: 'joinedData'
      }
    },
    {
      $unwind: '$joinedData'
    },
    {
      $set: {
        Clasificacion: { $ifNull: ['$joinedData.Clasificacion', 'SIN DEMANDA'] } 
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
          Clasificacion: doc.Clasificacion
        }
      }
    );
  }
  

  await db.collection('powerbi_plan_reposicion_01').updateMany(
    { Clasificacion: 0 },
    { $set: { Clasificacion: "SIN DEMANDA" } }
  );

  
  writeToLog(`\tTermina el Calculo de la Clasificacion`);
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
