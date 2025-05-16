const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const conex= require('../../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);


const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PowerBI_PlanReposicion.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collectionName = 'powerbi_plan_reposicion_01'; 

const client = new MongoClient(mongoUri);

async function updateCosto_Inv() {
  writeToLog(`\nPaso 02 - Calculo de los campos:`);
  writeToLog(`\t- Costo_A`);
  writeToLog(`\t- Costo_B`);
  writeToLog(`\t- Costo_C`); 
  writeToLog(`\t- Costo_D`);
  writeToLog(`\t- Demanda_Diaria`); 
  writeToLog(`\t- Rotacion_Anual_Dias`); 
  writeToLog(`\t- Dias_Cobertura`);
  writeToLog(`\t- Tipo_Caso`);
  writeToLog(`\t- Intervalos_Dias_Cobertura`);
  writeToLog(`\t- Cero_Inv2`);

  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collectionName);
    
    const result = await col.aggregate([
      {
        $project: {
          Costo_A: { $cond: [{ $eq: ["$Clasificacion", "A"] }, { $ifNull: ["$Costo_Inv", 0] }, 0] },
          //CERO_INV: '$Inventario_Disponible'  // Agregando el campo CERO_INV
        }
      }
    ]).toArray();
    

    await Promise.all(result.map(doc => 
      col.updateOne(
        { _id: doc._id }, 
        { 
          $set: { 
            Costo_A: doc.Costo_A,
            //CERO_INV: doc.CERO_INV  // Agregando el campo CERO_INV
          } 
        }
      )
    ));
    

    writeToLog(`\tTermina el Calculo de los Campos Adicionales`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

updateCosto_Inv();
