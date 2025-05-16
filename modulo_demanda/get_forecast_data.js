const { MongoClient } = require('mongodb');
const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const path = require('path');

const appUser = process.argv[2];
const dbName = process.argv[3];

async function getForecastData() {
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
    const forecastCollection = db.collection('demand_forecast_actual'); // Colección de forecast

    // Obtener todos los datos de forecast
    const forecastData = await forecastCollection
      .find({})
      .project({ _id: 0, Fecha: 1, 'Demanda Predicha': 1, forecast_date: 1, Product: 1, Channel: 1, Loc: 1 })
      //.sort({ forecast_date: -1, Fecha: 1 }) // Ordenar primero por forecast_date descendente, luego por Fecha ascendente
      .toArray();

    if (forecastData.length === 0) {
      console.log('No se encontraron datos de forecast.');
      client.close();
      return;
    }

    await client.close();

    console.log(JSON.stringify(forecastData)); // Output final como JSON
  } catch (error) {
    console.error('Error al obtener los datos del forecast:', error);
    process.exit(1);
  }
}

getForecastData();

