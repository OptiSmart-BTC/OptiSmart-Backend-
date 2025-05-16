const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

//const url = `mongodb://${host}:${puerto}/${dbName}`;
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


const collection1 = 'plan_reposicion_01_sem';
//const collection2 = 'politica_inventarios_01';

// Realizar la operación de join y actualización
async function actualizarDatos() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 06 - Calculo de la Cantidad a Reponer Semanal`);

  let client;
  try {

  client = await MongoClient.connect(mongoUri);
  //const client = await MongoClient.connect(url);
  const db = client.db(dbName);

  //const col1 = db.collection(collection1);
  const collection = db.collection('plan_reposicion_01_sem'); 


  const pipeline = [
    {
      $project: {
        SKU: 1,
        Producto: 1,
        Desc_Producto: 1,
        Familia_Producto: 1,
        Categoria: 1,
        Segmentacion_Producto: 1,
        Presentacion: 1,
        Ubicacion: 1,
        Desc_Ubicacion: 1,
        UOM_Base: 1,
        Inventario_Disponible: 1,
        Cantidad_Transito: 1,
        Cantidad_Confirmada_Total: 1,
        SS_Cantidad: 1,
        ROP: 1,
        META: 1,
        Requiere_Reposicion:1,
        Cantidad_Reponer: {
          $cond: {
            if: { $eq: ['$Requiere_Reposicion', 'Si'] },
            then: {
              $subtract: [
                {
                $subtract: [
                            {
                              $add: ['$META', '$Cantidad_Confirmada_Total'] 
                            },'$Inventario_Disponible'
              ]},'$Cantidad_Transito']   
            },
            else: 0,
          },
        },
      },
    },
    {
      $out: 'plan_reposicion_01_sem', // Nombre de la colección de salida
    }
  ];


  await collection.aggregate(pipeline).toArray();

  writeToLog(`\tTermina el Calculo del Inventario en Transito`);
  } catch (error) {
    // Manejar el error
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    // Cerrar la conexión a la base de datos
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
