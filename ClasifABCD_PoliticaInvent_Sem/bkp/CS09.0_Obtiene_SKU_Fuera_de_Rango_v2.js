const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto} = require('../../Configuraciones/ConexionDB');
const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 

async function main() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 09.0 - Se obtienen los SKU que tienen Override, Tienen Historia pero no estan ene el rango de fechas`);

  //const uri = 'mongodb://AccUserS003:5h2IWoLkVUyB@127.0.0.1:27017/?authSource=admin'; // Cambia esto por tu URI de conexión
  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
  const client = new MongoClient(mongoUri);


  try {
    await client.connect();
    const database = client.db(dbName); // Cambia esto por el nombre de tu base de datos
    //const database = client.db('btc_opti_ACCELERIUM5'); // Cambia esto por el nombre de tu base de datos
    //const db = client.db(dbName);
    const skuCollection = database.collection('sku');
    const historiaCollection = database.collection('historico_demanda');
    const clasificacionCollection = database.collection('demanda_abcd_01_sem');

    const skus = await skuCollection.find().toArray();

    for (const sku of skus) {
      const { SKU,Producto, Ubicacion, Override_Min_Politica_Inventarios, Override_Max_Politica_Inventarios } = sku;

      if ((Override_Min_Politica_Inventarios !== null && Override_Min_Politica_Inventarios !== '') || (Override_Max_Politica_Inventarios !== null && Override_Max_Politica_Inventarios !== '')) {
        const historia = await historiaCollection.findOne({ SKU });

        if (historia) {
          const clasificacion = await clasificacionCollection.findOne({ SKU });

          if (!clasificacion) {
            const nuevoClasificacion = {
              Tipo_Calendario:"Sem",
              SKU,
              Producto,
              Desc_Producto:"",
              Familia_Producto:"",
              Categoria:"",	
              Segmentacion_Producto:"",
              Presentacion:"",
              Ubicacion,
              Desc_Ubicacion:"",
              Demanda_Costo: 0,
              Demanda_Promedio_Semanal_Costo: 0,
              Clasificacion_Demanda: ""
            };

            await clasificacionCollection.insertOne(nuevoClasificacion);

            //console.log(`Insertado SKU: ${SKU} en CLASIFICACION`);
            writeToLog(`\tTermina el Proceso`);
          } else {
            //console.log(`SKU: ${SKU} ya existe en CLASIFICACION, no se hace nada.`);
          }
        }
      }
    }
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}



main().catch(console.error);
