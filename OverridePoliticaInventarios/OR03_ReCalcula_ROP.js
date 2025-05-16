const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
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
const logFile = `../../${parametroFolder}/log/Override_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

async function calculateAndSetSSCantidad() {
  writeToLog(`\nPaso 03 - Re-Calculo del ROP`);

  let client;
  client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(dbName); 
    const col = db.collection('politica_inventarios_01');

    const result = await col.aggregate([
      {
        $project: {
          Override_SS_Cantidad: 1,
          SS_Cantidad: 1, // Incluimos SS_Cantidad para las validaciones
          Override_ROP: 1, // Incluimos Override_ROP para las validaciones
          ROP: 1, // Incluimos ROP para las validaciones
          Prom_LT: 1,
          Demanda_Promedio_Diaria: 1,
          Tipo_Override: 1,
          Medida_Override: 1,
          Override_Min_Politica_Inventarios: 1,
          Override_Max_Politica_Inventarios: 1,
          ROP_Final: { // Cálculo del ROP Final
            $cond: {
              if: { $or: [{ $ne: ['$Override_Min_Politica_Inventarios', ''] }, { $ne: ['$Override_Max_Politica_Inventarios', ''] }] },
              then: {
                $cond: {
                  if: { $eq: ['$Tipo_Override', 'SS'] },
                  then: { 
                    $add: [
                      { $ifNull: ['$Override_SS_Cantidad', '$SS_Cantidad'] }, 
                      { $multiply: ['$Prom_LT', '$Demanda_Promedio_Diaria'] }
                    ]
                  },
                  else: {
                    $cond: {
                      if: { $gt: ['$Override_ROP', 0] },
                      then: { 
                        $add: [
                          { $ifNull: ['$Override_ROP', '$ROP'] }, 
                          { $multiply: ['$Prom_LT', '$Demanda_Promedio_Diaria'] }
                        ]
                      },
                      else: {
                        $cond: {
                          if: { $eq: ['$Medida_Override', 'Cantidad'] },
                          then: '$Override_Max_Politica_Inventarios',
                          else: { $multiply: ['$Override_Max_Politica_Inventarios', '$Demanda_Promedio_Diaria'] }
                        }
                      }
                    }
                  }
                }
              },
              else: { 
                $add: [
                  { $ifNull: ['$Override_SS_Cantidad', '$SS_Cantidad'] }, 
                  { $multiply: ['$Prom_LT', '$Demanda_Promedio_Diaria'] }
                ] 
              }
            }
          }
        }
      }
    ]).toArray();
    
    for (const doc of result) {
      await col.updateOne(
        { _id: doc._id },
        { $set: { 'ROP_Final': doc.ROP_Final } } // Actualizamos el nuevo ROP_Final
      );
    }

    writeToLog(`\tTermina el Re-Calculo del ROP`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

calculateAndSetSSCantidad();
