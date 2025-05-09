const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`; // Cambia esta ruta según la ubicación de tu archivo CSV


//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);



const collectionsToDelete = [
  'plan_reposicion_01',
  'ui_plan_reposicion'
];


async function deleteCollection(db, collectionName) {
  try {
    await db.collection(collectionName).drop();
    console.log(`La colección '${collectionName}' ha sido eliminada.`);
  } catch (error) {
    console.error(`Error al eliminar la colección '${collectionName}': ${error.message}`);
  }
}

async function main() {
  let client;
  writeToLog(`Paso 00 - Depuracion de Tablas del Proceso`);
 

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);


    const collections = await db.listCollections().toArray();
    const existingCollections = collections.map(collection => collection.name);

    for (const collectionName of collectionsToDelete) {
      if (existingCollections.includes(collectionName)) {
        await deleteCollection(db, collectionName);
      } else {
        console.log(`La colección '${collectionName}' no existe.`);
      }
    }
    writeToLog(`\tTermina la depuracion`);
  } catch (error) {

    writeToLog(`${now} - Error al eliminar los datos: ${error}`);
  } finally {
    if (client) {
      client.close();
    }
  }
}


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}


// Ejecutar la función principal
main();
