const { MongoClient } = require('mongodb');
const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const path = require('path');

const appUser = process.argv[2];
const dbName = process.argv[3];
const combination = process.argv[4];

async function getForecastData() {
  try {
    if (!appUser || !dbName || !combination) {
      console.error('Faltan parámetros appUser, dbName o combination.');
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
    const historicoCollection = db.collection(`historico_demanda_${appUser}`); // Colección de histórico

    // Separar la combinación en Product, Channel y Loc
    const [Producto, Canal, Ubicacion] = combination.split('-');

    // Query para obtener datos del histórico
    const historicoData = await historicoCollection
      .find({ Producto, Canal, Ubicacion })
      .project({ _id: 0, Fecha: 1, Cantidad: 1 }) // Seleccionar solo las columnas necesarias
      .sort({ Fecha: 1 }) // Ordenar por fecha
      .toArray();

    // Query para obtener datos del forecast
    const forecastData = await forecastCollection
      .find({ Producto, Canal, Ubicacion })
      .project({ _id: 0, Fecha: 1, 'Demanda Predicha': 1, forecast_date: 1 }) // Seleccionar solo las columnas necesarias
      .sort({ Fecha: 1 }) // Ordenar por fecha
      .toArray();

    if (forecastData.length === 0 && historicoData.length === 0) {
      console.log('No se encontraron datos históricos ni de forecast para esta combinación.');
      client.close();
      return;
    }

    // Unir datos históricos y de forecast
    const combinedData = [];

    historicoData.forEach((historico) => {
      combinedData.push({
        Fecha: historico.Fecha,
        DemandaReal: historico.Cantidad,
        DemandaPredicha: null, // En caso de que no haya forecast para esta fecha
      });
    });

    forecastData.forEach((forecast) => {
      const existingRecord = combinedData.find((record) => record.Fecha.toISOString() === forecast.Fecha.toISOString());

      if (existingRecord) {
        existingRecord.DemandaPredicha = forecast['Demanda Predicha'];
      } else {
        combinedData.push({
          Fecha: forecast.Fecha,
          DemandaReal: null, // En caso de que no haya datos históricos para esta fecha
          DemandaPredicha: forecast['Demanda Predicha'],
        });
      }
    });

    // Ordenar los datos combinados por fecha
    combinedData.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));

    await client.close();

    console.log(JSON.stringify(combinedData)); // Output final como JSON
  } catch (error) {
    console.error('Error al obtener los datos del forecast e histórico:', error);
    process.exit(1);
  }
}

getForecastData();
