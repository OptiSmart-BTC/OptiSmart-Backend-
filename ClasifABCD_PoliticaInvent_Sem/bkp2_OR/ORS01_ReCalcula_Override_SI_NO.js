const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

//const url = `mongodb://${host}:${puerto}/${dbName}`;
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);


const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


//const url = 'mongodb://127.0.0.1:27017'; // Cambia la URL según tu configuración
//const dbName = 'btc_opti_a001'; // Cambia el nombre de la base de datos
const collection1 = 'politica_inventarios_01_sem';
const collection2 = 'sku';

// Realizar la operación de join y actualización
async function actualizarDatos() {
  writeToLog('\n');
  writeToLog(`Proceso de Override de Politica de Inventarios por Semana\n`);
  writeToLog(`Inicio de ejecucion: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n`);
  writeToLog(`\nPaso 01 - Valicacion Override SI o NO`);

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
              $in: [
                '$joinedData.Override_Politica_Inventarios',
                ["0", ' ', null, ""]
              ]
            },
            then: 'NO',
            else: 'SI'
          }  
          },
          'Override_Politica_Inventarios': '$joinedData.Override_Politica_Inventarios'
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
          Override_SI_NO: doc.Override_SI_NO,
          Override_Politica_Inventarios: doc.Override_Politica_Inventarios
        }
      }
    );
  }

  writeToLog(`\tTermina el proceso de Valicacion Override SI o NO`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
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
