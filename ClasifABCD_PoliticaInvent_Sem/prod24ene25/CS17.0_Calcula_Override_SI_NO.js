const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

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


const collection1 = 'demanda_abcd_01_sem';
const collection2 = 'sku';

// Realizar la operación de join y actualización
async function actualizarDatos() {

  writeToLog(`\nPaso 17.0 - Obtencion del Override SI o NO con el SKU`);


  let client;
  try {

  client = await MongoClient.connect(mongoUri);

  const db = client.db(dbName);


  const col1 = db.collection(collection1);

  const col2 = db.collection(collection2);

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
          'Override_SI_NO': {
          $cond: {
            if: {
              $eq: [
                '$joinedData.OverrideClasificacionABCD',"-"
              ]
            },
            then: 'NO',
            else: 'SI'
          }  
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
          Clasificacion_ABCD: "",
          Override_SI_NO: doc.Override_SI_NO
        }
      }
    );
  }

  writeToLog(`\tTermina Obtencion del Override SI o NO con el SKU`);
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
