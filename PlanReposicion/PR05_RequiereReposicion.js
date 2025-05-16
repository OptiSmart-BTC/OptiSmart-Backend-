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
  writeToLog(`\nPaso 05 - Evaluacion de Requerimiento de Reposicion`);

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
        Requiere_Reposicion: {
          $cond: {
            if: {
              $gt: [
                '$ROP',
                {
                  $subtract: [
                    { $add: ['$Inventario_Disponible', '$Cantidad_Transito'] },
                    '$Cantidad_Confirmada_Total',
                  ],
                },
              ],
            },
            then: 'Si',
            else: 'No',
          },
        },
      },
    },
    {
      $out: 'plan_reposicion_01', // Nombre de la colección de salida
    },
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
const parte = dbName.substring(dbName.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection1 = 'plan_reposicion_01';

async function actualizarDatos() {
  writeToLog(`\nPaso 05 - Evaluación de Requiere_Reposicion (Nivel ${nivelFiltrado})`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const col = db.collection(collection1);

    const filtro = nivelFiltrado !== null ? { Nivel_OA: nivelFiltrado } : {};
    const docs = await col.find(filtro).toArray();

    const updates = [];
    let omitidos = 0;

    for (const doc of docs) {
      const inv = doc.Inventario_Disponible || 0;
      const trans = doc.Cantidad_Transito || 0;
      const conf = doc.Cantidad_Confirmada_Total || 0;
      const demandaInd = doc.Cantidad_Demanda_Indirecta ?? doc["Cantidad Demanda Indirecta"] ?? 0;
      const rop = doc.ROP || 0;

      if (typeof doc.Nivel_OA !== 'number') {
        writeToLog(`⚠️ Documento omitido por Nivel_OA inválido (SKU=${doc.SKU}): Nivel_OA = ${doc.Nivel_OA}`);
        omitidos++;
        continue;
      }

      const comparador = doc.Nivel_OA >= 2
        ? inv + trans - conf - demandaInd
        : inv + trans - conf;

      const requiere = rop > comparador ? "Si" : "No";

      updates.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { Requiere_Reposicion: requiere } }
        }
      });
    }

    if (updates.length > 0) {
      await col.bulkWrite(updates);
    }

    writeToLog(`\t✔ Requiere_Reposicion actualizado en ${updates.length} documentos`);
    if (omitidos > 0) writeToLog(`\t⚠️ ${omitidos} documentos fueron omitidos por Nivel_OA inválido.`);

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
