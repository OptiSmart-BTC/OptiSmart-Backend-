const fs = require('fs');
const { MongoClient } = require('mongodb');
const moment = require('moment');

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto} = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`; 

const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);


//const DBUser = process.argv.slice(2)[1];
//const DBPassword = process.argv.slice(2)[2];

//const dbName = 'btc_opti_OPTIWEEK01';
//const DBUser = 'dbOPTIWEEK01';
//const DBPassword = 'passDB123';





// Define una función asincrónica para ejecutar el código
async function generateFechas() {
  writeToLog(`\nPaso 09 - Calcula rangos de fechas de la Historia`);

  const passadminDeCripta = await getDecryptedPassadmin();
  const mongoURI = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
  const client = new MongoClient(mongoURI);

  try {
    await client.connect();

    const db = client.db();
    
    const historiaCollection = db.collection('historico_demanda');



    const fileName = `../../${parametroFolder}/cfg/HistFechas.js`;
    // Verificar si el archivo ya existe y eliminarlo
    if (fs.existsSync(fileName)) {
        fs.unlinkSync(fileName);
        //console.log(`Archivo "${fileName}" existente eliminado.`);
      }

    // Encuentra la fecha máxima y mínima en la colección
    const result = await historiaCollection.aggregate([
      {
        $group: {
          _id: null,
          maxFecha: { $max: '$Fecha' },
          minFecha: { $min: '$Fecha' },
        },
      },
    ]).next();

    const maxFecha = result.maxFecha;
    const minFecha = result.minFecha;

    // Formatea las fechas al formato DD/MM/YYYY
    const maxFechaFormateada = formatDate(maxFecha);
    const minFechaFormateada = formatDate(minFecha);

    // Calcula el número de días entre las fechas
    const diffInMilliseconds = maxFecha - minFecha;
    const dias = diffInMilliseconds / (1000 * 60 * 60 * 24);
    const dias_correctos = dias + 1;

    // Genera el contenido del archivo Fechas_Hist.js
    const fileContent = `
const FechaMax = "${maxFechaFormateada}";
const FechaMin = "${minFechaFormateada}";
const Dias = "${dias_correctos}";

module.exports = {
    FechaMax,
    FechaMin,
    Dias
};`;

    // Crea el archivo Fechas_Hist.js con el contenido
    //fs.writeFileSync('Fechas_Hist.js', fileContent);
    await fs.promises.writeFile(fileName, fileContent);

    //console.log('Archivo "Fechas_Hist.js" creado con éxito.');
    writeToLog(`\tTermina la proceso de calculo de rangos de fechas dela Historia`);
  } finally {
    await client.close();
  }
}

// Llama a la función asincrónica para ejecutar el código
generateFechas().catch((error) => {
  console.error('Error:', error);
});


/*
(async () => {
  const client = new MongoClient(mongoURI);
  try {
    await client.connect();

    const db = client.db();
    const historiaCollection = db.collection('historico_demanda');

    const fileName = `../../${parametroFolder}/cfg/HistFechas.js`;
    // Verificar si el archivo ya existe y eliminarlo
    if (fs.existsSync(fileName)) {
        fs.unlinkSync(fileName);
        //console.log(`Archivo "${fileName}" existente eliminado.`);
      }

    // Encuentra la fecha máxima y mínima en la colección
    const result = await historiaCollection.aggregate([
      {
        $group: {
          _id: null,
          maxFecha: { $max: '$Fecha' },
          minFecha: { $min: '$Fecha' },
        },
      },
    ]).next();

    const maxFecha = result.maxFecha;
    const minFecha = result.minFecha;

    // Formatea las fechas al formato DD/MM/YYYY
    const maxFechaFormateada = formatDate(maxFecha);
    const minFechaFormateada = formatDate(minFecha);

    // Calcula el número de días entre las fechas
    const diffInMilliseconds = maxFecha - minFecha;
    const dias = diffInMilliseconds / (1000 * 60 * 60 * 24);
    const dias_correctos = dias + 1;

    // Genera el contenido del archivo Fechas_Hist.js
    const fileContent = `
const FechaMax = "${maxFechaFormateada}";
const FechaMin = "${minFechaFormateada}";
const Dias = "${dias_correctos}";

module.exports = {
    FechaMax,
    FechaMin,
    Dias
};`;

    // Crea el archivo Fechas_Hist.js con el contenido
    //fs.writeFileSync('Fechas_Hist.js', fileContent);
    await fs.promises.writeFile(fileName, fileContent);

    console.log('Archivo "Fechas_Hist.js" creado con éxito.');
  } finally {
    await client.close();
  }
})();
*/
function formatDate(date) {
  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  return `${day < 10 ? '0' : ''}${day}/${month < 10 ? '0' : ''}${month}/${year}`;
}

async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}




