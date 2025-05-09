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

  //const uri = 'mongodb://127.0.0.1:27017'; // Reemplaza con tu URI de conexión a MongoDB

async function calculateDSLT() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 09 - Calculo de la Desviación Estandar del Lead Time`);

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    //const db = client.db('btc_opti_a001'); // Reemplaza 'nombre_basededatos' con el nombre de tu base de datos
    const db = client.db(`${dbName}`);
    const col = db.collection('politica_inventarios_01'); // Reemplaza 'btc_opti_a001.política_inventarios_01' con el nombre de tu colección


    const result = await col.aggregate([
        {
          $project: {
            DS_LT: {
             $sqrt: {
                $add: [
                  {
                    $multiply: [
                      {
                        $pow: [
                          {
                            $subtract: ['$Prom_LT', '$Lead_Time_Abasto']
                          },
                          2
                        ]
                      },'$Fill_Rate'
                      //{ $divide: ['$Fill_Rate', 100] },                      
                      ]
                  },
                  {
                    $multiply: [
                      {
                        $pow: [
                          {
                            $subtract: [
                              '$Prom_LT',
                              {
                                $add: ['$Lead_Time_Abasto', '$Frecuencia_Revision_dias']
                              }
                            ]
                          },
                          2
                        ]
                      },
                      {
                        $subtract: [
                          1,'$Fill_Rate'
                          //{ $divide: ['$Fill_Rate', 100] }
                          /*{
                            $divide: [
                              {
                                $multiply: [
                                  { $divide: ['$Fill_Rate', 100] },
                                  {
                                    $subtract: [1, { $divide: ['$Fill_Rate', 100] }]
                                  }
                                ]
                              },
                              100
                            ]
                          }*/
                        ]
                      }
                    ]
                  }
                ]
            }
          }
        }
        }
      ]).toArray();

    //console.log(result);
    
    // Actualizar el campo DS_LT en la base de datos
    for (const item of result) {
      await col.updateOne(
        { _id: item._id },
        { $set: { DS_LT: item.DS_LT } }
      );
    }
    
    //console.log('Actualización completada.');
    //writeToLog(`${now} - Ejecucion exitosa`);
    writeToLog(`\tTermina el Calculo de la Desviación Estandar del Lead Time`);
  } catch (error) {
    //console.error('Error al calcular y actualizar DS_LT:', error);
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    client.close();
  }
}


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}


calculateDSLT();
