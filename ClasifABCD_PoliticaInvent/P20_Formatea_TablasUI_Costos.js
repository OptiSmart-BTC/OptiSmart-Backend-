<<<<<<< HEAD
const fs = require('fs'); 
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto} = require('../Configuraciones/ConexionDB');
=======
const fs = require("fs");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");

const { host, puerto } = require("../Configuraciones/ConexionDB");
>>>>>>> origin/test

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];
<<<<<<< HEAD

//const url = `mongodb://${host}:${puerto}/${dbName}`;
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

=======
const collectionName = process.argv.slice(2)[3] || "politica_inventarios_costo";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
>>>>>>> origin/test

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
<<<<<<< HEAD
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

// Configuración de la conexión a MongoDB
//const url = 'mongodb://127.0.0.1:27017'; // Cambia la URL según tu configuración
//const dbName = 'btc_opti_a001'; // Cambia el nombre de la base de datos
const collectionName = 'politica_inventarios_costo'; // Cambia el nombre de la colección
//const targetCollectionName = 'ui_política_inventarios_costo';
const targetCollectionName = 'ui_pol_inv_costo';

// Función para formatear un número como moneda mexicana
function formatCurrency(number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
=======
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

const targetCollectionName = "ui_pol_inv_costo";

function formatCurrency(number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
>>>>>>> origin/test
    minimumFractionDigits: 4,
  }).format(number);
}

<<<<<<< HEAD
// Función para formatear los datos de la colección y guardarlos en la tabla de destino
async function formatAndSaveData() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 20 - Formateo de la Tabla de Costos para mostrar en UI`);


  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
=======
async function formatAndSaveData() {
  writeToLog(`\nPaso 20 - Formateo de la Tabla de Costos para mostrar en UI`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
>>>>>>> origin/test
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const cursor = collection.find();

    const formattedData = [];

    await cursor.forEach((document) => {
      const formattedDocument = {
<<<<<<< HEAD
        Tipo_Calendario:"Dia",
=======
        Tipo_Calendario: "Dia",
>>>>>>> origin/test
        SKU: document.SKU,
        Producto: document.Producto,
        Desc_Producto: document.Desc_Producto,
        Familia_Producto: document.Familia_Producto,
        Categoria: document.Categoria,
        Segmentacion_Producto: document.Segmentacion_Producto,
        Presentacion: document.Presentacion,
        Ubicacion: document.Ubicacion,
        Desc_Ubicacion: document.Desc_Ubicacion,
        SS: formatCurrency(document.SS),
        Demanda_LT: formatCurrency(document.Demanda_LT),
        MOQ: formatCurrency(document.MOQ),
        ROQ: formatCurrency(document.ROQ),
        ROP: formatCurrency(document.ROP),
        META: formatCurrency(document.META),
        Inventario_Promedio: formatCurrency(document.Inventario_Promedio),
      };

      formattedData.push(formattedDocument);
    });

    const targetCollection = db.collection(targetCollectionName);
    await targetCollection.insertMany(formattedData);

<<<<<<< HEAD
    //console.log('Datos formateados guardados correctamente en la tabla ui_política_inventarios_costo.');
    //writeToLog(`${now} - Ejecucion exitosa`);
    writeToLog(`\tTermina el Formateo de la Tabla de Costos para mostrar en UI`);
  } catch (error) {
    //console.error('Ocurrió un error:', error);
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    client.close();
=======
    writeToLog(
      `\tTermina el Formateo de la Tabla de Costos para mostrar en UI`
    );
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) await client.close();
>>>>>>> origin/test
  }
}

function writeToLog(message) {
<<<<<<< HEAD
  fs.appendFileSync(logFile, message + '\n');
}

// Llamar a la función para formatear y guardar los datos
=======
  fs.appendFileSync(logFile, message + "\n");
}

>>>>>>> origin/test
formatAndSaveData();
