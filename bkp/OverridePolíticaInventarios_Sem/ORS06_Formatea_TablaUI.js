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
const logFile = `../../${parametroFolder}/log/Override_PolInvent_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

  // Configuración de conexión a la base de datos MongoDB
  //const uri = 'mongodb://127.0.0.1:27017'; // Cambia esto si tu MongoDB se encuentra en un servidor diferente
  //const dbName = 'btc_opti_a001';

async function copiarDatos() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 06 - Formateo de las Tablas Finales para mostrar en UI`);

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const collection = db.collection('politica_inventarios_01_sem');

    const finalCollection = db.collection('ui_sem_politica_inventarios');
    await finalCollection.deleteMany({});


    const datos = await collection.find().toArray();


    const datosFormateados = datos.map((dato) => {
      return {
        ...dato,
        Valor_Z: formatearNumero(dato.Valor_Z),
        Demanda_Promedio_Semanal: formatearNumero(dato.Demanda_Promedio_Semanal),
        Variabilidad_Demanda_Cantidad: formatearNumero(dato.Variabilidad_Demanda_Cantidad),
        DS_Demanda: formatearNumero(dato.DS_Demanda),
        Prom_LT: formatearNumero(dato.Prom_LT),
        DS_LT: formatearNumero(dato.DS_LT),
        SS_Cantidad: formatearNumero(dato.SS_Cantidad),
        Demanda_LT: formatearNumero2(dato.Demanda_LT),
        MOQ: formatearNumero2(dato.MOQ),
        ROQ: formatearNumero2(dato.ROQ),
        ROP: formatearNumero2(dato.ROP),
        META: formatearNumero2(dato.META),
        Inventario_Promedio: formatearNumero2(dato.Inventario_Promedio),
        STAT_SS: formatearNumero2(dato.STAT_SS)
      };
    });


    await finalCollection.insertMany(datosFormateados);

    writeToLog(`\tTermina el Formateo de las Tablas Finales`);
  } catch (error) {

    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {

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
