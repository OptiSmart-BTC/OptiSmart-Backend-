const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

//const uri = `mongodb://${host}:${puerto}/${dbName}`;
//const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

//const uri = 'mongodb://127.0.0.1:27017';
 
async function calculateAndUpdateDemandaLT() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 11 - Calculo de la Cantidad de Demanda en el periodo de reposición`);

  let client;
  client = new MongoClient(mongoUri);
  //const client = new MongoClient(uri);

  try {
    await client.connect();
    const database = client.db(`${dbName}`);
    const collection = database.collection('politica_inventarios_01');

    const pipeline = [
      {
        $project: {
          Demanda_LT: {
            $multiply: [
              { $add: ['$Prom_LT', '$Frecuencia_Revision_dias'] },
              '$Demanda_Promedio_Diaria'
            ]
          }
        }
      }
    ];

    const result = await collection.aggregate(pipeline).toArray();
    for (const doc of result) {
      await collection.updateOne({ _id: doc._id }, { $set: { Demanda_LT: doc.Demanda_LT } });
    }

    //console.log('Demanda_LT actualizado correctamente.');
    //writeToLog(`${now} - Ejecucion exitosa`);
    writeToLog(`\tTermina el Calculo de la Cantidad de Demanda en el periodo de reposición`);
  } catch (error) {
    //console.error('Error al calcular y actualizar Demanda_LT:', error);
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

calculateAndUpdateDemandaLT();
