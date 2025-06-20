const fs = require('fs');
const csv = require('csv-parser');
const { MongoClient } = require('mongodb');
const path = require('path');
const moment = require('moment-timezone');

// Obtener los argumentos pasados por el comando
const csvFilePath = process.argv[2];  // La ruta del archivo CSV
const dbName = `btc_opti_${process.argv[3]}`;  // El nombre de la base de datos
const user = process.argv[4];  // El usuario que ejecuta la operación
const selectedCollection = process.argv[5]; // El nombre de la colección según la selección del usuario

// Variables de configuración para conectarse a MongoDB
const { decryptData } = require('../DeCriptaPassAppDb');
const { host, puerto } = require('../../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../../${user}/cfg/dbvars`);
const logFile = path.join(__dirname, `../../../${user}/log/LogdeCargaCSV.log`);

// Crear el nombre de la colección específica para el usuario
const collectionName = `${selectedCollection}_${user}`;

// Función principal para insertar los datos del CSV en MongoDB
async function insertCSVDataToMongoDB() {
  try {
    const passadminDeCripta = await getDecryptedPassadmin();
    const mongoURI = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
    const client = await MongoClient.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = client.db();

    const results = [];
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => {
        let transformedData;

        switch (selectedCollection) {
          case 'historico_demanda':
            transformedData = {
              Product: String(data['Product']),
              Channel: String(data['Channel']),
              Loc: String(data['Loc']),
              Fecha: moment.utc(data['Fecha'], 'DD/MM/YYYY').startOf('day').toDate(),
              Cantidad: Number(data['Cantidad'].replace(/,/g, '')),
            };
            break;
          case 'Listado_productos':
            transformedData = {
              Product: String(data['DmdUnit']),
              Desc: String(data['Desc']),
            };
            break;
          case 'Listado_canales':
            transformedData = {
              Channel: String(data['DmdGroup']),
              Desc: String(data['Desc']),
            };
            break;
          case 'Listado_ubicaciones':
            transformedData = {
              Loc: String(data['Loc']),
              Desc: String(data['Desc']),
            };
            break;
          default:
            console.error('Colección no válida seleccionada');
            client.close();
            return;
        }

        results.push(transformedData);
      })
      .on('end', async () => {
        const collection = db.collection(collectionName);
        await collection.deleteMany({});
        await collection.insertMany(results);
        const numRegistrosCargados = results.length;

        fs.appendFileSync(logFile, `Número de registros cargados en ${collectionName}: ${numRegistrosCargados}\n`);
        console.log(`CSV cargado exitosamente en la colección ${collectionName} con ${numRegistrosCargados} registros.`);
        client.close();
      });
  } catch (error) {
    fs.appendFileSync(logFile, `Error al cargar el CSV en ${collectionName}: ${error}\n`);
    console.error(`Error al cargar el CSV en ${collectionName}:`, error);
  }
}

// Función para desencriptar el password de la base de datos
async function getDecryptedPassadmin() {
  try {
    return await decryptData(DBPassword);
  } catch (error) {
    console.error('Error al desencriptar el password:', error);
    throw error;
  }
}

// Ejecutar la función de carga de datos
insertCSVDataToMongoDB();
