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

async function updateROP() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 13 - Calculo del Punto de reorden que representa la demanda en el plazo de entrega o ROP`);

  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collectionName);
    
    const result = await col.aggregate([
      {
        $project: {
          SS_Cantidad: 1,
          Prom_LT: 1,
          Demanda_Promedio_Diaria: 1,
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
                  then: { $add: ['$SS_Cantidad', { $multiply: ['$Prom_LT', '$Demanda_Promedio_Diaria'] }] },
                  else: {
                    $cond: {
                      if: { $gt: ['$SS_Cantidad', 0] },
                      then: { $add: ['$SS_Cantidad', { $multiply: ['$Prom_LT', '$Demanda_Promedio_Diaria'] }] },
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
              else: { $add: ['$SS_Cantidad', { $multiply: ['$Prom_LT', '$Demanda_Promedio_Diaria'] }] }
            }
          }
        }
      }
    ]).toArray();
    

    // Actualizar los documentos en la colección con los nuevos valores de ROP
    await Promise.all(result.map(
      doc => col.updateOne({
         _id: doc._id 
        }, 
        { $set: {
           ROP: doc.ROP 
          } 
        }
        )
      ));

    //console.log('Actualización exitosa');
    //writeToLog(`${now} - Ejecucion exitosa`);
    writeToLog(`\tTermina el Calculo del ROP`);
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
 
updateROP();
