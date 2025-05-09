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

async function calculateAndSetSSCantidad() {
  writeToLog(`\nPaso 10 - Calculo del Inventario de Seguridad`);

  let client;
  client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(`${dbName}`); 
    const col = db.collection('politica_inventarios_01_sem');

    const result = await col.aggregate([
      {
        $project: {
          SS_Cantidad: {
            $cond: {
              if: { $eq: ['$Override_SI_NO', 'SI'] },
              then: {
                $let: {
                  vars: {
                    sku: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$sku',
                            as: 'sku',
                            cond: {
                              $eq: ['$$sku.SKU', '$SKU']
                            }
                          }
                        },
                        0
                      ]
                    }
                  },
                  in: '$$sku.Override_Politica_Inventarios'
                }
              },
              else: {
                $let: {
                  vars: {
                    promLT: '$Prom_LT',
                    frecuencia: '$Frecuencia_Revision_dias',
                    dsDemanda: '$DS_Demanda',
                    demandaPromedioSemanal: '$Demanda_Promedio_Semanal',
                    dsLt: '$DS_LT',
                    valorZ: '$Valor_Z'
                  },
                  in: {
                    $multiply: [
                      '$$valorZ',
                      {
                        $sqrt: {
                          $add: [
                            {
                                  $multiply: [
                                    //{ $add: ['$$promLT', '$$frecuencia'] },
                                    { 
                                      $add: [
                                        { $divide: ['$$promLT', 7] },
                                        { $divide: ['$$frecuencia', 7] }
                                      ]
                                    },
                                    { $pow: ['$$dsDemanda', 2] }
                                  ]
                                },
                                {
                                    //(Demanda_Promedio_Diaria)^2*(DS_LT)^2
                                  $multiply: [
                                    { $pow: ['$$demandaPromedioSemanal', 2] },
                                    //{ $pow: ['$$dsLt', 2] }
                                    //{ $pow: [{ $divide: ['$$dsLt', 7] }, 2] }
                                    { 
                                      $pow: [
                                        { $divide: ['$$dsLt', 7] },
                                        2
                                      ]
                                    }
                                  ]
                                }
                          ]
                        }
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    ]).toArray();

    //console.log(result);

    // Actualizar los documentos con el resultado calculado
    for (const doc of result) {
      await col.updateOne(
        { _id: doc._id },
        { $set: { 'SS_Cantidad': doc.SS_Cantidad } }
      );
    }

    //console.log('Se ha actualizado el campo SS_Cantidad.');
    //writeToLog(`${now} - Ejecucion exitosa`);
    writeToLog(`\tTermina el Calculo del Inventario de Seguridad`);
  } catch (error) {
    //console.error('Ocurrió un error:', err);
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

calculateAndSetSSCantidad();
