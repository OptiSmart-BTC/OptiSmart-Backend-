const fs = require('fs');
const { MongoClient } = require('mongodb');
<<<<<<< HEAD
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
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


const collection1 = 'plan_reposicion_01';
//const collection2 = 'politica_inventarios_01';

// Realizar la operación de join y actualización
async function actualizarDatos() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 06 - Calculo de la Cantidad a Reponer`);

  let client;
  try {

  client = await MongoClient.connect(mongoUri);
  //const client = await MongoClient.connect(url);
  const db = client.db(dbName);

  //const col1 = db.collection(collection1);
  const collection = db.collection('plan_reposicion_01'); // Reemplaza con el nombre de tu colección


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
      $out: 'plan_reposicion_01', // Nombre de la colección de salida
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
=======
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const nivelFiltrado = process.argv[5] ? parseInt(process.argv[5]) : null;

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

async function actualizarDatos() {
  writeToLog(`\nPaso 06 - Calculo de la Cantidad a Reponer (Nivel ${nivelFiltrado})`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const collection = db.collection('plan_reposicion_01');

    const documentos = await collection.find({ Nivel_OA: nivelFiltrado }).toArray();

    const updates = documentos.map(doc => {
      const requiereRepos = doc.Requiere_Reposicion === "Si";

      const inv = doc.Inventario_Disponible || 0;
      const trans = doc.Cantidad_Transito || 0;
      const confirmada = doc.Cantidad_Confirmada_Total || 0;
      const meta = doc.META || 0;
      const demandaInd = (nivelFiltrado >= 2) ? (doc["Cantidad Demanda Indirecta"] || 0) : 0;

      const calculo = requiereRepos
        ? Math.max(0, Math.round(meta + confirmada + demandaInd - inv - trans))
        : 0;

      // 🟡 Log de depuración
      if (requiereRepos) {
        console.log(`[DEPURACIÓN] SKU=${doc.SKU}, Nivel=${nivelFiltrado}, META=${meta}, Confirmada=${confirmada}, DemandaInd=${demandaInd}, Inv=${inv}, Trans=${trans} => Reponer=${calculo}`);
      }

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { Cantidad_Reponer: calculo } }
        }
      };
    });

    if (updates.length > 0) {
      await collection.bulkWrite(updates);
    }

    writeToLog(`\tTermina el Calculo de la Cantidad a Reponer (${updates.length} documentos actualizados)`);

  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) client.close();
>>>>>>> origin/test
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

<<<<<<< HEAD
// Llamar a la función para actualizar los datos
=======
>>>>>>> origin/test
actualizarDatos().catch(console.error);
