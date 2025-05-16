const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


const collection1 = 'ui_pol_inv_dias_cobertura';
const collection2 = 'sku';


async function actualizarDatos01() {

  writeToLog(`\nPaso 08 - Dias de Cobertura, Calculo de los campos:`);
  writeToLog(`\t-Vida Util en Dias`);
  writeToLog(`\t-ROP Alto`);
  writeToLog(`\t-Sobreinventario en Dias`);


  let client;
  try {

  client = await MongoClient.connect(mongoUri);

  const db = client.db(dbName);

  // Obtener la colección 1 (política_inventarios_01)
  const col1 = db.collection(collection1);

  // Obtener la colección 2 (sku)
  const col2 = db.collection(collection2);

  // Realizar el join y la actualización
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
        'Vida_Util_Dias': '$joinedData.Vida_Util_Dias',
        'Tolerancia_Vida_Util_Dias': '$joinedData.Tolerancia_Vida_Util_Dias',
          }
      }
  ]).toArray();

  console.log(result);
  // Actualizar los documentos en la colección 1
  
  for (const doc of result) {
    const Vida_Util_Dias = doc.Vida_Util_Dias;
    const Tolerancia_Vida_Util_Dias = doc.Tolerancia_Vida_Util_Dias;
    const ROP_Alto = Tolerancia_Vida_Util_Dias < doc.ROP ? 'SI' : 'NO';
    const SobreInventario_Dias = Math.max(0, doc.ROP - Tolerancia_Vida_Util_Dias);

    await col1.updateOne(
      { _id: doc._id },
      {
        $set: {
          Vida_Util_Dias: Math.ceil(Vida_Util_Dias),
          Tolerancia_Vida_Util_Dias: Math.ceil(Tolerancia_Vida_Util_Dias),
          ROP_Alto: ROP_Alto,
          SobreInventario_Dias: Math.ceil(SobreInventario_Dias)
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
actualizarDatos01().catch(console.error);


