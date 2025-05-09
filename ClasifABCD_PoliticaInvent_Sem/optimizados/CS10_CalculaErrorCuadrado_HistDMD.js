const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 

async function calculateAndUpdateErrorCuadrado() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 10 - Calcula Error Cuadrado Costos del Historico de Demanda por Semana`);

  const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db(dbName);

  const pipeline = [
    {
      $lookup: {
        from: 'sku',
        let: { producto: '$Producto', ubicacion: '$Ubicacion' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$Producto', '$$producto'] }, { $eq: ['$Ubicacion', '$$ubicacion'] }] } } }
        ],
        as: 'skuData',
      },
    },
    {
      $lookup: {
        from: 'demanda_abcd_01_sem',
        let: { producto: '$Producto', ubicacion: '$Ubicacion' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$Producto', '$$producto'] }, { $eq: ['$Ubicacion', '$$ubicacion'] }] } } }
        ],
        as: 'demandaData',
      },
    },
    {
      $project: {
        _id: 1,
        Cantidad_Sem: 1,
        SKU_Costo_Unidad: { $arrayElemAt: ['$skuData.Costo_Unidad', 0] },
        Demanda_Promedio_Semanal_Costo: { $arrayElemAt: ['$demandaData.Demanda_Promedio_Semanal_Costo', 0] },
      },
    },
    {
      $addFields: {
        Error_Cuadrado: {
          $pow: [
            {
              $subtract: [
                { $multiply: ['$Cantidad_Sem', '$SKU_Costo_Unidad'] },
                '$Demanda_Promedio_Semanal_Costo',
              ],
            },
            2,
          ],
        },
      },
    },
  ];

  const joinedData = await db.collection('historico_demanda_sem').aggregate(pipeline).toArray();

  // Preparar operaciones bulk para actualización
  const bulkOps = joinedData.map(item => ({
    updateOne: {
      filter: { _id: item._id },
      update: { $set: { Error_Cuadrado_Sem: item.Error_Cuadrado } }
    }
  }));

  if (bulkOps.length > 0) {
    await db.collection('historico_demanda_sem').bulkWrite(bulkOps);
  }

  writeToLog(`\tTermina el Calculo del Error Cuadrado del Historico de Demanda por Semana`);
  
  // Cerrar la conexión a la base de datos
  await client.close();
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Ejecutar la función para calcular y actualizar el Error_Cuadrado
calculateAndUpdateErrorCuadrado().catch(err => console.error(err));
