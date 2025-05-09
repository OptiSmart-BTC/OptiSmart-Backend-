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

//const uri = 'mongodb://127.0.0.1:27017'; // Cambia esto por la URL de conexión a tu base de datos MongoDB
//const dbName = 'btc_opti_a001'; // Cambia esto por el nombre de tu base de datos
const collectionName = 'politica_inventarios_01'; // Cambia esto por el nombre de tu colección

const client = new MongoClient(mongoUri);

async function updateInventarioPromedio() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 09.1 - Calculo el STAT_SS`);

  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collectionName);

    const result = await col.aggregate([
      {
        $project: {
          STAT_SS: {
            $add: [
              {
                $multiply: [
                  '$Valor_Z',
                  {
                    $sqrt: {
                      $add: [
                        {
                          $multiply: [
                            { $add: ['$Prom_LT', '$Frecuencia_Revision_dias'] },
                            { $pow: ['$DS_Demanda', 2] }
                          ]
                        },
                        {
                          $multiply: [
                            { $pow: ['$Demanda_Promedio_Diaria', 2] },
                            { $pow: ['$DS_LT', 2] }
                          ]
                        }
                      ]
                    }
                  }
                ]
              }
            ]
          }
        }
      }
    ]).toArray();
    

    /*
    const result = await col.aggregate([
      {
        $project: {
          ROQ: 1,
          SS_Cantidad: 1,
          Inventario_Promedio: { $add: [{ $divide: ['$ROQ', 2] }, '$SS_Cantidad'] }
        }
      }
    ]).toArray();
    */

    // Actualizar los documentos en la colección con los nuevos valores de STAT_SS
    await Promise.all(result.map(doc => col.updateOne({ _id: doc._id }, { $set: { STAT_SS: doc.STAT_SS } })));

    //console.log('Actualización exitosa');
    //writeToLog(`${now} - Ejecucion exitosa`);
    writeToLog(`\tTermina el Calculo del STAT_SS.`);
  } catch (error) {
    //console.error('Error al realizar la actualización:', error);
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

updateInventarioPromedio();
