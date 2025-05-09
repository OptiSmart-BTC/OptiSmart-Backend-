const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

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
  //writeToLog('------------------------------------------------------------------------------');
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
    
    const result = await db.collection('powerbi_plan_reposicion_01').aggregate([
      {
        $project: {
          _id: 1,
          // Fórmulas para Costo_A, Costo_B, Costo_C y Costo_D
          Costo_A: { $cond: [{ $eq: ["$Clasificacion", "A"] }, { $ifNull: ["$Costo_Inv", 0] }, 0] },
          Costo_B: { $cond: [{ $eq: ["$Clasificacion", "B"] }, { $ifNull: ["$Costo_Inv", 0] }, 0] },
          Costo_C: { $cond: [{ $eq: ["$Clasificacion", "C"] }, { $ifNull: ["$Costo_Inv", 0] }, 0] },
          Costo_D: { $cond: [{ $eq: ["$Clasificacion", "D"] }, { $ifNull: ["$Costo_Inv", 0] }, 0] },
    
          // Fórmula para Demanda_Diaria
          Demanda_Diaria: {
            $cond: [
              { $or: [{ $eq: ["$Demanda_Promedio_Diaria", "SIN DEMANDA"] }, { $eq: ["$Demanda_Promedio_Diaria", null] }] },
              0,
              "$Demanda_Promedio_Diaria"
            ]
          },
          
    
          // Fórmula para Rotacion_Anual_Dias
          Rotacion_Anual_Dias: {
            $cond: [
              { $ne: ["$Inventario_Promedio", 0] },
              { $divide: [{ $multiply: ["$Demanda_Diaria", 365] }, "$Inventario_Promedio"] },
              0
            ]
          },
    
          // Fórmula para Dias_Cobertura
          Dias_Cobertura: {
            $cond: [
              {
                $and: [
                  { $ne: ["$Demanda_Promedio_Diaria", "SIN DEMANDA"] },
                  { $ne: ["$Demanda_Promedio_Diaria", 0] }
                ]
              },
              { $divide: ["$Inventario_Disponible", "$Demanda_Promedio_Diaria"] },
              0
            ]
          },
          
    
          // Fórmula para Tipo_Caso
          Tipo_Caso: {
            $cond: [
              { $gt: ["$Costo_UP", 0] }, "Arriba de Rango",
              {
                $cond: [
                  { $gt: ["$Costo_Down", 0] }, "Abajo de Rango",
                  {
                    $cond: [
                      { $lte: ["$Inventario_Disponible", 0] }, "Faltante",
                      { $cond: [{ $gt: ["$Costo_OK", 0] }, "OK", "OK"] }
                    ]
                  }
                ]
              }
            ]
          },
    
          // Fórmula para Intervalos_Dias_Cobertura
          Intervalos_Dias_Cobertura: {
            $cond: [
              { $lte: ["$Dias_Cobertura", 30] }, "0-30",
              { $cond: [{ $lte: ["$Dias_Cobertura", 180] }, "30-180", "180+"] }
            ]
          },
    
          // Fórmula para Cero_Inv2
          Cero_Inv2: { $cond: [{ $eq: ["$CERO_INV", 0] }, 1, 0] }
        }
      }
    ]).toArray();
    
    // Actualizar cada documento con los valores calculados
    await Promise.all(result.map(doc => 
      db.collection('powerbi_plan_reposicion_01').updateOne(
        { _id: doc._id },
        { $set: {
            Costo_A: doc.Costo_A,
            Costo_B: doc.Costo_B,
            Costo_C: doc.Costo_C,
            Costo_D: doc.Costo_D,
            Demanda_Diaria: doc.Demanda_Diaria,
            Rotacion_Anual_Dias: doc.Rotacion_Anual_Dias,
            Dias_Cobertura: doc.Dias_Cobertura,
            Tipo_Caso: doc.Tipo_Caso,
            Intervalos_Dias_Cobertura: doc.Intervalos_Dias_Cobertura,
            Cero_Inv2: doc.Cero_Inv2
          }
        }
      )
    ));

    writeToLog(`\tTermina el Calculo de los Campos`);
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
