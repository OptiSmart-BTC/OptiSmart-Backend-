const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const conex= require('../../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../../Configuraciones/ConexionDB');

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

async function calculateAndSetSSCantidad() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 10 - Calculo del Inventario de Seguridad`);

  let client;
  client = new MongoClient(mongoUri);
  //const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(`${dbName}`); 
    const col = db.collection('politica_inventarios_01');


/*
    const result = await col.aggregate([
      {
        $project: {
          SS_Cantidad: {
            $cond: {
              if: {
                $or: [
                  { $ne: ['$Override_Max_Politica_Inventarios', ''] },
                  { $ne: ['$Override_Min_Politica_Inventarios', ''] }
                ]
              },
              then: {
                $cond: {
                  if: { $eq: ['$Tipo_Override', 'SS'] },
                  then: {
                    $cond: {
                      if: { $eq: ['$Medida_Override', 'Cantidad'] },
                      then: {
                        $cond: {
                          if: {
                            $and: [
                              { $ne: ['$Override_Max_Politica_Inventarios', ''] },
                              { $lt: ['$Override_Max_Politica_Inventarios', '$STAT_SS'] }
                            ]
                          },
                          then: '$Override_Max_Politica_Inventarios',
                          else: {
                            $cond: {
                              if: { $gt: ['$Override_Min_Politica_Inventarios', '$STAT_SS'] },
                              then: '$Override_Min_Politica_Inventarios',
                              else: '$STAT_SS'
                            }
                          }
                        }
                      },
                      else: {
                        $cond: {
                          if: {
                            $and: [
                              { $ne: ['$Override_Max_Politica_Inventarios', ''] },
                              { $lt: [{ $multiply: ['$Override_Max_Politica_Inventarios', '$Demanda_Promedio_Diaria'] }, '$STAT_SS'] }
                            ]
                          },
                          then: { $multiply: ['$Override_Max_Politica_Inventarios', '$Demanda_Promedio_Diaria'] },
                          else: {
                            $cond: {
                              if: { $gt: [{ $multiply: ['$Override_Min_Politica_Inventarios', '$Demanda_Promedio_Diaria'] }, '$STAT_SS'] },
                              then: { $multiply: ['$Override_Min_Politica_Inventarios', '$Demanda_Promedio_Diaria'] },
                              else: '$STAT_SS'
                            }
                          }
                        }
                      }
                    }
                  },
                  else: {
                    $max: [
                      0,
                      {
                        $cond: {
                          if: { $eq: ['$Medida_Override', 'Cantidad'] },
                          then: {
                            $cond: {
                              if: {
                                $and: [
                                  { $ne: ['$Override_Max_Politica_Inventarios', ''] },
                                  { $lt: [{ $subtract: ['$Override_Max_Politica_Inventarios', { $multiply: ['$Prom_LT', '$Demanda_Promedio_Diaria'] }] }, '$STAT_SS'] }
                                ]
                              },
                              then: { $subtract: ['$Override_Max_Politica_Inventarios', { $multiply: ['$Prom_LT', '$Demanda_Promedio_Diaria'] }] },
                              else: {
                                $cond: {
                                  if: { $gt: [{ $subtract: ['$Override_Min_Politica_Inventarios', { $multiply: ['$Prom_LT', '$Demanda_Promedio_Diaria'] }] }, '$STAT_SS'] },
                                  then: { $subtract: ['$Override_Min_Politica_Inventarios', { $multiply: ['$Prom_LT', '$Demanda_Promedio_Diaria'] }] },
                                  else: '$STAT_SS'
                                }
                              }
                            }
                          },
                          else: {
                            $cond: {
                              if: {
                                $and: [
                                  { $ne: ['$Override_Max_Politica_Inventarios', ''] },
                                  { $lt: [{ $subtract: [{ $multiply: ['$Override_Max_Politica_Inventarios', '$Demanda_Promedio_Diaria'] }, { $multiply: ['$Prom_LT', '$Demanda_Promedio_Diaria'] }] }, '$STAT_SS'] }
                                ]
                              },
                              then: { $subtract: [{ $multiply: ['$Override_Max_Politica_Inventarios', '$Demanda_Promedio_Diaria'] }, { $multiply: ['$Prom_LT', '$Demanda_Promedio_Diaria'] }] },
                              else: {
                                $cond: {
                                  if: { $gt: [{ $subtract: [{ $multiply: ['$Override_Min_Politica_Inventarios', '$Demanda_Promedio_Diaria'] }, { $multiply: ['$Prom_LT', '$Demanda_Promedio_Diaria'] }] }, '$STAT_SS'] },
                                  then: { $subtract: [{ $multiply: ['$Override_Min_Politica_Inventarios', '$Demanda_Promedio_Diaria'] }, { $multiply: ['$Prom_LT', '$Demanda_Promedio_Diaria'] }] },
                                  else: '$STAT_SS'
                                }
                              }
                            }
                          }
                        }
                      }
                    ]
                  }
                }
              },
              else: '$STAT_SS'
            }
          }
        }
      }
    ]).toArray();
    */

  const result1 = await col.aggregate([
      {
        $project: {
          SKU: 1,
          Valor_Z: 1,
          Prom_LT: 1,
          Frecuencia_Revision_dias: 1,
          DS_Demanda: 1,
          Demanda_Promedio_Diaria: 1,
          DS_LT: 1,
          Override_Max_Politica_Inventarios: 1,
          Override_Min_Politica_Inventarios: 1,
          Tipo_Override: 1,
          Medida_Override: 1,
          STAT_SS: 1
        }
      }
    ]).toArray();
    

 
    writeToLog(JSON.stringify(result1, null, 2));


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
