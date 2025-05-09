const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');
 
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


const collection1 = 'politica_inventarios_01_sem';
const collection2 = 'parametros_usuario';


async function actualizarDatos() {

  writeToLog(`\nPaso 06 - Calculo del Nivel Servicio`);

  let client;
  try {

  client = await MongoClient.connect(mongoUri);
  const db = client.db(dbName);

  const col1 = db.collection(collection1);

  const col2 = db.collection(collection2);

  // Realizar el join y la actualización
  const result = await col1.aggregate([
    {
      $lookup: {
        from: collection2,
        localField: 'Clasificacion',
        foreignField: 'Clasificacion',
        as: 'joinedData'
      }
    },
    {
      $unwind: '$joinedData'
    },
    {
      $match: {
        'joinedData.Tipo': 'Nivel_Servicio'
      }
    },
    {
      $set: {
        'Nivel_Servicio': '$joinedData.NivelServicio',
        'Valor_Z': '$joinedData.ValorZ'
      }
    }
  ]).toArray();

  for (const doc of result) {
    await col1.updateOne(
      { _id: doc._id },
      {
        $set: {
          Nivel_Servicio: doc.Nivel_Servicio,
          Valor_Z: doc.Valor_Z
        }
      }
    );
  }


  writeToLog(`\tTermina el Calculo del Nivel Servicio`);
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
