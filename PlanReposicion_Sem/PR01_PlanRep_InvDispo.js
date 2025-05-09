const fs = require('fs');
const { MongoClient } = require('mongodb');
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
const logFile = `../../${parametroFolder}/log/PlanReposicion_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


async function crearTablaPoliticaInventarios() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 01 - Calculo del Inventario Disponible`);



  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const invDispoCollection = db.collection('inventario_disponible');
    const planRepoCollection = db.collection('plan_reposicion_01_sem');

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
    writeToLog(`${now} - Error al crear la tabla plan_reposicion_01_sem: ${err}`);
  } finally {
    client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Llamar a la función para ejecutarla
crearTablaPoliticaInventarios();
