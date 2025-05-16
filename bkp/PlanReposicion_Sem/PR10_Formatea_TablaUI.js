const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto} = require('../Configuraciones/ConexionDB');

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


async function copiarDatos() {

  writeToLog(`\nPaso 10 - Formateo de la Tabla Semanal Final para mostrar en UI`);

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const collection = db.collection('plan_reposicion_01_sem');

    const finalCollection = db.collection('ui_sem_plan_reposicion');
    await finalCollection.deleteMany({});


    const datos = await collection.find().toArray();


    const datosFormateados = datos.map((dato) => {
      return {
        ...dato,
        SS_Cantidad: formatearNumero(dato.SS_Cantidad),
        ROP: formatearNumero(dato.ROP),
        META: formatearNumero2(dato.META),
        Cantidad_Reponer: formatearNumero(dato.Cantidad_Reponer)
      };
    });


    await finalCollection.insertMany(datosFormateados);
    writeToLog(`\tTermina el Formateo de las Tablas Finales`);
  } catch (error) {
    //console.error('Error al copiar los datos:', error);
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    // Cerrar la conexión a la base de datos
    client.close();
  }
}

// Función para formatear un número y separar los millares por coma y redondear decimales a 4 dígitos
function formatearNumero(numero) {
  if (typeof numero === 'number') {
    return numero.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    });
  }
  return numero;
}



function formatearNumero2(numero) {
    if (typeof numero === 'number') {
      return numero.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
    }
    return numero;
  }

  function writeToLog(message) {
    fs.appendFileSync(logFile, message + '\n');
  }
  
// Llamar a la función para ejecutarla
copiarDatos();
