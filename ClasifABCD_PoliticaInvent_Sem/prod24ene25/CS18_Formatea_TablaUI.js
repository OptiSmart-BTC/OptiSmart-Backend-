const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');


const { host, puerto} = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 



async function copiarDatos() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 18 - Formateo de las Tablas Finales para mostrar en UI`);

  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const collection = db.collection('demanda_abcd_01_sem');

    const finalCollection = db.collection('ui_sem_demanda_abcd');
    await finalCollection.deleteMany({});

    const datos = await collection.find().toArray();

    const datosFormateados = datos.map((dato) => {
      return {
        ...dato,
        Demanda_Costo: formatearNumero(dato.Demanda_Costo),
        Demanda_Promedio_Semanal_Costo: formatearNumero(dato.Demanda_Promedio_Semanal_Costo),
        Variabilidad_Demanda: formatearNumero(dato.Variabilidad_Demanda),
        DS_Demanda: formatearNumero(dato.DS_Demanda),
        Coeficiente_Variabilidad: formatearNumero(dato.Coeficiente_Variabilidad)
      };
    });


    await finalCollection.insertMany(datosFormateados);


    writeToLog(`\tTermina el Formateo de las Tablas Finales para mostrar en UI`);
  } catch (err) {

    writeToLog(`${now} - Error al copiar los datos: ${err}`);

  } finally {

    client.close();
  }
}


function formatearNumero(numero) {
  if (typeof numero === 'number') {
    return numero.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    });
  }
  return numero;
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}


copiarDatos();
