const fs = require('fs');
const csv = require('csv-parser');
const { MongoClient } = require('mongodb');
const { parse } = require('date-fns');
const moment = require('moment-timezone');
const moment2 = require('moment');
const now = moment2().format('YYYY-MM-DD HH:mm:ss');
const collectionName = 'historico_demanda'; 

const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];
 
const { decryptData } = require('../DeCriptaPassAppDb');
const { host, puerto } = require('../../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);
const csvFilePath = `../../${parametroFolder}/csv/historico_demanda.csv`; 
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`;




async function insertCSVDataToMongoDB() {
  try {
    writeToLog(`Paso 03 - Carga del CSV de la Historial de Demanda`);

    const passadminDeCripta = await getDecryptedPassadmin();
    const mongoURI = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
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


// Obtener el valor desencriptado de passadmin
async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}



// Llamar a la función para leer los registros del archivo CSV e insertarlos en MongoDB
insertCSVDataToMongoDB();
