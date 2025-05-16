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
 
const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
//const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/dbvars`);
const csvFilePath = `../../${parametroFolder}/csv/in/historico_demanda.csv`; 
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`;




async function insertCSVDataToMongoDB() {
  try {
    writeToLog(`Paso 04 - Carga del CSV de la Historial de Demanda`);

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
          Fecha: fechaConDesplazamiento.toDate(),
          Cantidad: Number(data.Cantidad)
          //SKU_Costo_Unidad: 0

        };

        results.push(transformedData);
      })
      .on('end', async () => {

        const collection = db.collection(collectionName);
        await collection.deleteMany({});
        await collection.insertMany(results);
        const numRegistrosCargados = results.length;


        fs.appendFileSync(logFile, `\tNúmero de registros cargados: ${numRegistrosCargados}\n`);
        client.close();
      });
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}



async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}


insertCSVDataToMongoDB();
