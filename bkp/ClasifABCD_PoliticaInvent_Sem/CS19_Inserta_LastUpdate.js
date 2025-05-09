const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto} = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 

const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;


const collectionName = 'ui_sem_demanda_abcd'; 

const addFechaCreacion = async () => {
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    writeToLog(`\nPaso 19 - Se registra la fecha de procesamiento de datos`);


  const client = new MongoClient(mongoUri);

  try {

    await client.connect();


    const database = client.db(dbName);
    const collection = database.collection(collectionName);


    const fechaCreacion = new Date();


    const updateResult = await collection.updateMany({}, { $set: { fecha_creacion: fechaCreacion } });

    writeToLog(`\tTermina el registro`);
  } catch (err) {

    writeToLog(`${now} - Error al agregar el campo "fecha_creacion": ${err}`);

  } finally {

    await client.close();
  }
};


function writeToLog(message) {
    fs.appendFileSync(logFile, message + '\n');
  }

addFechaCreacion().catch(console.error);
