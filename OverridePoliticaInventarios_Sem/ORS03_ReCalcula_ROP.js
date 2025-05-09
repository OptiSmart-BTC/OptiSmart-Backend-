const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/Override_PolInvent_Sem.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

async function calculateAndSetSSCantidad() {
  writeToLog(`\nPaso 01 - Validación Override SI o NO`);

  let client;
  client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(`${dbName}`);
    const col = db.collection('politica_inventarios_01_sem');

    // Validaciones para Override
    const validationResult = await col.aggregate([
      {
        $project: {
          _id: 1,
          Override_SI_NO: {
            $cond: {
              if: { $ne: [{ $ifNull: ['$Override_SS_Cantidad', '$SS_Cantidad'] }, '$STAT_SS'] },
              then: 'SI',
              else: 'NO'
            }
          },
          Override_ROP_SI_NO: {
            $cond: {
              if: { $ne: [{ $ifNull: ['$Override_ROP', '$ROP'] }, '$STAT_ROP'] },
              then: 'SI',
              else: 'NO'
            }
          }
        }
      }
    ]).toArray();

    for (const doc of validationResult) {
      await col.updateOne(
        { _id: doc._id },
        {
          $set: {
            Override_SI_NO: doc.Override_SI_NO,
            Override_ROP_SI_NO: doc.Override_ROP_SI_NO
          }
        }
      );
    }
    writeToLog(`\tValidación Override SI o NO completada`);

    // Re-cálculo del ROP
    writeToLog(`\nPaso 03 - Re-Cálculo del ROP`);

    const result = await col.aggregate([
      {
        $project: {
          Override_SS_Cantidad: 1,
          Prom_LT: 1,
          Demanda_Promedio_Semanal: 1,
          Tipo_Override: 1,
          Medida_Override: 1,
          Override_Min_Politica_Inventarios: 1,
          Override_Max_Politica_Inventarios: 1,
          ROP: {
            $cond: {
              if: { $or: [{ $ne: ['$Override_Min_Politica_Inventarios', ''] }, { $ne: ['$Override_Max_Politica_Inventarios', ''] }] },
              then: {
                $cond: {
                  if: { $eq: ['$Tipo_Override', 'SS'] },
                  then: { $add: ['$Override_SS_Cantidad', { $multiply: ['$Prom_LT', { $divide: ['$Demanda_Promedio_Semanal', 7] }] }] },
                  else: {
                    $cond: {
                      if: { $gt: ['$Override_SS_Cantidad', 0] },
                      then: { $add: ['$Override_SS_Cantidad', { $multiply: ['$Prom_LT', { $divide: ['$Demanda_Promedio_Semanal', 7] }] }] },
                      else: {
                        $cond: {
                          if: { $eq: ['$Medida_Override', 'Cantidad'] },
                          then: '$Override_Max_Politica_Inventarios',
                          else: { $multiply: ['$Override_Max_Politica_Inventarios', { $divide: ['$Demanda_Promedio_Semanal', 7] }] }
                        }
                      }
                    }
                  }
                }
              },
              else: { $add: ['$Override_SS_Cantidad', { $multiply: ['$Prom_LT', { $divide: ['$Demanda_Promedio_Semanal', 7] }] }] }
            }
          }
        }
      }
    ]).toArray();

    for (const doc of result) {
      await col.updateOne(
        { _id: doc._id },
        { $set: { 'ROP': doc.ROP } }
      );
    }
    writeToLog(`\tTermina el Re-Cálculo del ROP`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Ejecutar la función
calculateAndSetSSCantidad();
