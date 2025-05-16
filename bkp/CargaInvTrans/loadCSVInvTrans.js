const fs = require('fs');
const csv = require('csv-parser');
const { MongoClient } = require('mongodb');
//const moment = require('moment');

const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaInvCSV.log`; 


const collectionName = 'inventario_transito'; // Cambia el nombre de la colección en la que deseas cargar los registros
const csvFilePath = `../../${parametroFolder}/csv/inventario_transito.csv`; // Cambia esta ruta según la ubicación de tu archivo CSV



async function insertCSVDataToMongoDB() {
  try {

    const passadminDeCripta = await getDecryptedPassadmin();
    const mongoURI = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;


    writeToLog(`\nPaso 03 - Carga del CSV de Inventario Disponible`);
   
    const client = await MongoClient.connect(mongoURI, { useNewUrlParser: true });

    const db = client.db();

    // Leer el archivo CSV y insertar los registros en MongoDB
    const results = [];
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => {
        const transformedData = {
          SKU: `${String(data.Producto)}@${String(data.Ubicacion)}`, 
          Producto: String(data.Producto), 
          Ubicacion: String(data.Ubicacion), 
          Cantidad_Transito: Number(data.Cantidad_Transito)
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

    writeToLog(`Error: ${error}`);

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



insertCSVDataToMongoDB();
