const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion_Sem.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

async function actualizarInventarioDisponible() {
  writeToLog(`\nPaso 01 - Actualizacion del Inventario Disponible (sin eliminar coleccion)`);
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const invDispoCollection = db.collection('inventario_disponible');
    const planRepoCollection = db.collection('plan_reposicion_01_sem');

    const datosinvDispo = await invDispoCollection.find().toArray();

    const updates = datosinvDispo.map(dato => {
      return {
        updateOne: {
          filter: { SKU: dato.SKU, Ubicacion: dato.Ubicacion },
          update: {
            $set: {
              SKU: dato.SKU,
              Producto: dato.Producto,
              Ubicacion: dato.Ubicacion,
              Inventario_Disponible: dato.Inventario_Disponible
            },
            $setOnInsert: {
              Desc_Producto: "0",
              Familia_Producto: "0",
              Categoria: "0",
              Segmentacion_Producto: "0",
              Presentacion: "0",
              Desc_Ubicacion: "0",
              UOM_Base: "0",
              Cantidad_Transito: 0,
              Cantidad_Confirmada_Total: 0,
              "Cantidad_Demanda_Indirecta": 0
            }
          },
          upsert: true
        }
      };
    });

    if (updates.length > 0) {
      await planRepoCollection.bulkWrite(updates);
    }

    writeToLog(`\tInventario Disponible actualizado correctamente (${updates.length} registros)`);
  } catch (err) {
    writeToLog(`${now} - Error al actualizar inventario disponible: ${err}`);
  } finally {
    client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

actualizarInventarioDisponible();
