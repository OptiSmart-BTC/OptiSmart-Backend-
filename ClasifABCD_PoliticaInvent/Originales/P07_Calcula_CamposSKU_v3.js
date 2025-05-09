const fs = require('fs');
const { MongoClient } = require('mongodb');
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
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


//const url = 'mongodb://127.0.0.1:27017'; // Cambia la URL según tu configuración
//const dbName = 'btc_opti_a001'; // Cambia el nombre de la base de datos
const collection1 = 'politica_inventarios_01';
const collection2 = 'sku';

// Realizar la operación de join y actualización
async function actualizarDatos() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 07 - Obtencion de campos relacionados con el SKU`);
  writeToLog(`\t-Lead Time Abasto`);
  writeToLog(`\t-Fill Rate`);
  writeToLog(`\t-Frecuencia Revision en dias`);
  writeToLog(`\t-MOQ\n`);

  let client;
  try {

  client = await MongoClient.connect(mongoUri);
  //const client = await MongoClient.connect(url);
  const db = client.db(dbName);

  // Obtener la colección 1 (política_inventarios_01)
  const col1 = db.collection(collection1);

  // Obtener la colección 2 (sku)
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
        'Lead_Time_Abasto': '$joinedData.LeadTime_Abasto_Dias',
        'Fill_Rate': '$joinedData.Fill_Rate',
        'Frecuencia_Revision_dias': '$joinedData.Frecuencia_Revision_Dias',
        'MOQ': '$joinedData.MOQ'
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
          Lead_Time_Abasto: doc.Lead_Time_Abasto,
          Fill_Rate: doc.Fill_Rate,
          Frecuencia_Revision_dias: doc.Frecuencia_Revision_dias,
          MOQ: doc.MOQ
        }
      }
    );
  }

  //console.log('Actualización completa');
  //writeToLog(`${now} - Ejecucion exitosa`);
  writeToLog(`\tTermina el proceso de obtencion de campos relacionados con el SKU`);
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
