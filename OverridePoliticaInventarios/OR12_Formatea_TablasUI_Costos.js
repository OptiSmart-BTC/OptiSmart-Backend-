const fs = require('fs'); 
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/Override_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collectionName = 'politica_inventarios_costo'; 
const targetCollectionName = 'ui_pol_inv_costo';

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
  writeToLog(`\nPaso 12 - Formateo de la Tabla de Costos para mostrar en UI`);

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const cursor = collection.find();

    const finalCollection = db.collection('ui_pol_inv_costo');
    await finalCollection.deleteMany({});

    const formattedData = [];

    await cursor.forEach((document) => {
      // Validar Override_ROP y Override_SS_Cantidad
      const SS_Utilizado = document.Override_SS_Cantidad || document.SS_Cantidad;
      const ROP_Utilizado = document.Override_ROP || document.ROP;

      
      const formattedDocument = {
        Tipo_Calendario: "Dia",
        SKU: document.SKU,
        Producto: document.Producto,
        Desc_Producto: document.Desc_Producto,
        Familia_Producto: document.Familia_Producto,
        Categoria: document.Categoria,
        Segmentacion_Producto: document.Segmentacion_Producto,
        Presentacion: document.Presentacion,
        Ubicacion: document.Ubicacion,
        Desc_Ubicacion: document.Desc_Ubicacion,
        SS: formatCurrency(SS_Utilizado),
        Demanda_LT: formatCurrency(document.Demanda_LT),
        MOQ: formatCurrency(document.MOQ),
        ROQ: formatCurrency(document.ROQ),
        ROP: formatCurrency(ROP_Utilizado),
        META: formatCurrency(document.META),
        Inventario_Promedio: formatCurrency(document.Inventario_Promedio),
      };

      formattedData.push(formattedDocument);
    });

    const targetCollection = db.collection(targetCollectionName);
    await targetCollection.insertMany(formattedData);

    writeToLog(`\tTermina el Formateo de la Tabla de Costos para mostrar en UI`);
  } catch (error) {
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
