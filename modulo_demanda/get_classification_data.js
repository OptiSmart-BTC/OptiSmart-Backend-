// get_classification_data.js
const { MongoClient } = require('mongodb');
const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const path = require('path');

const appUser = process.argv[2];
const dbName = process.argv[3];

async function getClassificationData() {
  try {
    if (!appUser || !dbName) {
      console.error('Faltan parámetros appUser o dbName.');
      process.exit(1);
    }

    // Ruta para las credenciales del usuario
    const configPath = path.join(__dirname, `../../${appUser}/cfg/dbvars`);
    const { DBUser, DBPassword } = require(configPath);
    const decryptedPassword = await decryptData(DBPassword);

    // Configuración de la conexión a MongoDB
    const mongoURI = `mongodb://${DBUser}:${decryptedPassword}@${host}:${puerto}/?authSource=admin`;
    const client = new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();

    const db = client.db(`btc_opti_${dbName}`);

    // Colección de resultados de clasificación
    const classificationCollection = db.collection(`clasificacion_demanda_${appUser}`);
    // Colección de metadatos
    const metadataCollection = db.collection('clasificacion_demanda_metadata');

    // Obtener los datos de clasificación
    const classificationData = await classificationCollection.find({}).toArray();

    // Obtener el metadato más reciente (ordenando por process_date descendente)
    const metadataCursor = await metadataCollection.find({}).sort({ process_date: -1 }).limit(1).toArray();
    const metadata = metadataCursor.length > 0 ? metadataCursor[0] : {};

    await client.close();

    // Imprimir la salida en formato JSON
    console.log(JSON.stringify({
      classificationData,
      metadata
    }));
  } catch (error) {
    console.error('Error al obtener los datos de clasificación:', error);
    process.exit(1);
  }
}

getClassificationData();
