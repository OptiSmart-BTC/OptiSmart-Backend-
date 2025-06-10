const { MongoClient } = require('mongodb');
const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const path = require('path');

const appUser = process.argv[2];
const DBName = process.argv[3];

async function getCombinations() {
  try {
    const configPath = path.join(__dirname, `../../${appUser}/cfg/dbvars`);
    const { DBUser, DBPassword } = require(configPath);
    const decryptedPassword = await decryptData(DBPassword);

    const mongoURI = `mongodb://${DBUser}:${decryptedPassword}@${host}:${puerto}/?authSource=admin`;
    const client = new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();

    const db = client.db(`btc_opti_${DBName}`);
    const collection = db.collection('demand_forecast_actual'); // Se usa demand_forecast_actual

    // Obtener combinaciones únicas concatenando Producto, Canal y Ubicación
    const results = await collection.aggregate([
      {
        $project: {
          combination: { $concat: ["$Producto", "-", "$Canal", "-", "$Ubicacion"] }
        }
      },
      {
        $group: {
          _id: null,
          combinations: { $addToSet: "$combination" }
        }
      },
      {
        $project: {
          _id: 0,
          combinations: 1
        }
      }
    ]).toArray();

    const combinations = results.length > 0 ? results[0].combinations : [];
    await client.close();

    console.log(JSON.stringify(combinations)); // Enviar combinaciones al stdout
  } catch (error) {
    console.error('Error al obtener combinaciones:', error);
    process.exit(1);
  }
}

getCombinations();
