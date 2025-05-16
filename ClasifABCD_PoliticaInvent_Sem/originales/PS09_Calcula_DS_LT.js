const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


async function calculateDSLT() {
  writeToLog(`\nPaso 09 - Calculo de la Desviación Estandar del Lead Time`);

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const db = client.db(`${dbName}`);
    const col = db.collection('politica_inventarios_01_sem'); 


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


    for (const item of result) {
      await col.updateOne(
        { _id: item._id },
        { $set: { DS_LT: item.DS_LT } }
      );
    }
    

    writeToLog(`\tTermina el Calculo de la Desviación Estandar del Lead Time`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    client.close();
  }
}


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}


calculateDSLT();
