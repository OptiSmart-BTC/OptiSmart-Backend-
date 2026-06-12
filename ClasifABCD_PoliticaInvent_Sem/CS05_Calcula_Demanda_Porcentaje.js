const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');
 
const { host, puerto } = require('../Configuraciones/ConexionDB');
const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 



async function calcularDemandaPorcentaje() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 05 - Calculo del Porcentaje de la Demanda por Semana`);
  //const mongoURI = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
  const collectionName = 'demanda_calculada_sem';
  let client;

  try {
    client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });
    const db = client.db(dbName);
    await db.collection(collectionName).aggregate([
      {
        $setWindowFields: {
          partitionBy: "$Ubicacion",
          output: {
            Suma_Demanda_Ubicacion: {
              $sum: "$Demanda_Costo",
              window: { documents: ["unbounded", "unbounded"] }
            }
          }
        }
      },
      {
        $set: {
          Demanda_Porcentaje: {
            $cond: [
              { $ne: ["$Suma_Demanda_Ubicacion", 0] },
              {
                $multiply: [
                  { $divide: ["$Demanda_Costo", "$Suma_Demanda_Ubicacion"] },
                  100
                ]
              },
              0
            ]
          }
        }
      },
      { $unset: "Suma_Demanda_Ubicacion" },
      {
        $merge: {
          into: collectionName,
          on: "_id",
          whenMatched: "replace",
          whenNotMatched: "discard"
        }
      }
    ], { allowDiskUse: true }).toArray();

    writeToLog(`\tTermina el Calculo del Porcentaje de la Demanda por Semana`);
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
    process.exitCode = 1;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

calcularDemandaPorcentaje();
