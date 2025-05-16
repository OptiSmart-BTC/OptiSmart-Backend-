const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


const collection1 = 'politica_inventarios_01_sem';
const collection2 = 'sku';

// Realizar la operación de join y actualización
async function actualizarDatos() {
  writeToLog(`\nPaso 07 - Obtencion de campos relacionados con el SKU`);
  writeToLog(`\t-Lead Time Abasto`);
  writeToLog(`\t-Fill Rate`);
  writeToLog(`\t-Frecuencia Revision en dias`);
  writeToLog(`\t-Override SI o NO`);
  writeToLog(`\t-MOQ\n`);

  let client;
  try {

  client = await MongoClient.connect(mongoUri);
  const db = client.db(dbName);

  const col1 = db.collection(collection1);
  const col2 = db.collection(collection2);

  const result = await col1.aggregate([
    {
      $lookup: {
        from: collection2,
        localField: 'SKU',
        foreignField: 'SKU',
        as: 'joinedData'
      }
    },
    {
      $unwind: '$joinedData'
    },
    {
      $set: {
        'Lead_Time_Abasto': '$joinedData.LeadTime_Abasto_Dias',
        'Fill_Rate': '$joinedData.Fill_Rate',
        'Frecuencia_Revision_dias': '$joinedData.Frecuencia_Revision_Dias',
        'Override_SI_NO': {
          $cond: {
            if: {
              $in: [
                '$joinedData.Override_Politica_Inventarios',
                ["0", ' ', null, ""]
              ]
            },
            then: 'NO',
            else: 'SI'
          }  
          },
        'MOQ': '$joinedData.MOQ'
      }
    }
  ]).toArray();

  
  for (const doc of result) {
    await col1.updateOne(
      { _id: doc._id },
      {
        $set: {
          Lead_Time_Abasto: doc.Lead_Time_Abasto,
          Fill_Rate: doc.Fill_Rate,
          Frecuencia_Revision_dias: doc.Frecuencia_Revision_dias,
          Override_SI_NO: doc.Override_SI_NO,
          MOQ: doc.MOQ
        }
      }
    );
  }

  writeToLog(`\tTermina el proceso de obtencion de campos relacionados con el SKU`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) {
      client.close();
    }
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Llamar a la función para actualizar los datos
actualizarDatos().catch(console.error);
