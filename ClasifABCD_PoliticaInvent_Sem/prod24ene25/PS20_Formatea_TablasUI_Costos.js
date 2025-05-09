const fs = require('fs'); 
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto} = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

//const url = `mongodb://${host}:${puerto}/${dbName}`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

// Configuración de la conexión a MongoDB
//const url = 'mongodb://127.0.0.1:27017'; // Cambia la URL según tu configuración
//const dbName = 'btc_opti_a001'; // Cambia el nombre de la base de datos
const collectionName = 'politica_inventarios_costo_sem'; // Cambia el nombre de la colección
//const targetCollectionName = 'ui_política_inventarios_costo';
const targetCollectionName = 'ui_sem_pol_inv_costo';

// Función para formatear un número como moneda mexicana
function formatCurrency(number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 4,
  }).format(number);
}

// Función para formatear los datos de la colección y guardarlos en la tabla de destino
async function formatAndSaveData() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 20 - Formateo de la Tabla de Costos para mostrar en UI`);


  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const cursor = collection.find();

    const formattedData = [];

    await cursor.forEach((document) => {
      const formattedDocument = {
        Tipo_Calendario:"Sem",
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

    //console.log('Datos formateados guardados correctamente en la tabla ui_política_inventarios_costo.');
    //writeToLog(`${now} - Ejecucion exitosa`);
    writeToLog(`\tTermina el Formateo de la Tabla de Costos para mostrar en UI`);
  } catch (error) {
    //console.error('Ocurrió un error:', error);
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Llamar a la función para formatear y guardar los datos
formatAndSaveData();
