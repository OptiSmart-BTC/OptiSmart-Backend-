const fs = require('fs');
const csv = require('csv-parser');
const { MongoClient } = require('mongodb');
const { parse } = require('date-fns');
const moment = require('moment-timezone');
const moment2 = require('moment');


 

const { host, puerto } = require('../Configuraciones/ConexionDB');
const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];
const mongoURI = `mongodb://${host}:${puerto}/${dbName}`;
//const mongoURI = `mongodb://BtcAdmin:BtcAdmin@${host}:${puerto}/${dbName}`;
//const mongoURI = `mongodb://admin:btc0pt1@127.0.0.1:27017/${dbName}?authSource=admin`;
const collectionName = 'historico_demanda'; // Cambia el nombre de la colección en la que deseas cargar los registros
const csvFilePath = `../../${parametroFolder}/csv/historico_demanda.csv`; // Cambia esta ruta según la ubicación de tu archivo CSV


/*
const mongoURI = 'mongodb://127.0.0.1:27017/btc_opti_a001'; // Cambia esta cadena de conexión según tu configuración
const collectionName = 'historico_demanda'; // Cambia el nombre de la colección en la que deseas cargar los registros
const csvFilePath = '..../A001/historico_demanda.csv'; // Cambia esta ruta según la ubicación de tu archivo CSV
*/

const now = moment2().format('YYYY-MM-DD HH:mm:ss');

const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`; // Cambia esta ruta según la ubicación de tu archivo CSV


async function insertCSVDataToMongoDB() {
  try {

    //writeToLog('------------------------------------------------------------------------------');
    //writeToLog(`${now} - >>>>> Carga del CSV de Historial de Demanda <<<<<`);
    //writeToLog(`\n`);
    writeToLog(`Paso 03 - Carga del CSV de la Historial de Demanda`);

    // Conexión a la base de datos
    const client = await MongoClient.connect(mongoURI, { useNewUrlParser: true });
    const db = client.db();

    // Leer el archivo CSV y insertar los registros en MongoDB
    const results = [];
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => {
        // Realizar la transformación de los tipos de datos aquí
        const fechaString = data.Fecha;
        const fechaConDesplazamiento = moment.utc(fechaString, 'DD/MM/YYYY').tz('America/Mexico_City');

 
        const transformedData = {
          SKU: `${String(data.Producto)}@${String(data.Ubicacion)}`,
          Ubicacion: String(data.Ubicacion),
          Producto: String(data.Producto), 
          //Fecha: parse(data.Fecha, 'dd/MM/yyyy', new Date()), 
          Fecha: fechaConDesplazamiento.toDate(),
          CantidadFacturada: Number(data.CantidadFacturada) 

        };

        results.push(transformedData);
      })
      .on('end', async () => {

        const collection = db.collection(collectionName);
        await collection.deleteMany({});
        await collection.insertMany(results);
        const numRegistrosCargados = results.length;

        //console.log('Inserción completada.');
        //writeToLog(`${now} - Inserción completada.`);

        // Registrar el número de registros cargados en el archivo de log
        fs.appendFileSync(logFile, `\tNúmero de registros cargados: ${numRegistrosCargados}\n`);
        //writeToLog(`${now} - Inserción completada.`);
        //writeToLog('------------------------------------------------------------------------------');

        //console.log('Inserción completada.');
        client.close();
      });
  } catch (error) {
    //console.error('Error:', error);
    writeToLog(`${now} - Error: ${error}`);
    //writeToLog('------------------------------------------------------------------------------');
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Llamar a la función para leer los registros del archivo CSV e insertarlos en MongoDB
insertCSVDataToMongoDB();
