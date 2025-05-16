const fs = require('fs');
const { MongoClient } = require('mongodb');
<<<<<<< HEAD
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');
 
  // Configuración de conexión a la base de datos MongoDB
  //const uri = 'mongodb://127.0.0.1:27017'; // Cambia esto si tu MongoDB se encuentra en un servidor diferente
  //const dbName = 'btc_opti_a001';

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
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


async function crearTablaPoliticaInventarios() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 01 - Calculo del Inventario Disponible`);



=======
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
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

async function actualizarInventarioDisponible() {
  writeToLog(`\nPaso 01 - Actualizacion del Inventario Disponible (sin eliminar coleccion)`);
>>>>>>> origin/test
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const invDispoCollection = db.collection('inventario_disponible');
    const planRepoCollection = db.collection('plan_reposicion_01');

<<<<<<< HEAD
    // se limpia la tabla política_inventarios_01 antes de insertar nuevos datos
    await planRepoCollection.deleteMany({});

    // se leen los datos de la tabla demanda_abcd_01
    const datosinvDispo = await invDispoCollection.find().toArray();

    // se crea un nuevo objeto con los campos y lógica especificados para cada registro
    const planRepopipeline = datosinvDispo.map((dato) => {
      return {
        SKU: dato.SKU,
        Producto: dato.Producto,
        Desc_Producto: "0",
        Familia_Producto: "0",
        Categoria: "0",
        Segmentacion_Producto: "0",
        Presentacion: "0",
        Ubicacion: dato.Ubicacion,
        Desc_Ubicacion: "0",
        UOM_Base: "0",
        Inventario_Disponible: dato.Inventario_Disponible,
        Cantidad_Transito:0,
        Cantidad_Confirmada_Total: 0
      };
    });

    await planRepoCollection.insertMany(planRepopipeline);

    writeToLog(`\tTermina el Calculo del Inventario Disponible`);
  } catch (err) {
    writeToLog(`${now} - Error al crear la tabla plan_reposicion_01: ${err}`);
=======
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
>>>>>>> origin/test
  } finally {
    client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

<<<<<<< HEAD
// Llamar a la función para ejecutarla
crearTablaPoliticaInventarios();
=======
actualizarInventarioDisponible();
>>>>>>> origin/test
