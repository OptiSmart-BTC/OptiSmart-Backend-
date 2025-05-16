const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');


const { host, puerto} = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 

async function calculateAndUpdateErrorCuadrado() {
  //console.log("07_CalculaErrorCuadrado_HistDMD.js");
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 10 - Calcula Error Cuadrado Costos del Historico de Demanda por Semana`);

  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;

  // Conexión a la base de datos
  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db(dbName);

 const pipeline = [
  {
    $lookup: {
      from: 'sku',
      let: {
        producto: '$Producto',
        ubicacion: '$Ubicacion',
      },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$Producto', '$$producto'] },
                { $eq: ['$Ubicacion', '$$ubicacion'] },
              ],
            },
          },
        },
      ],
      as: 'skuData',
    },
  },
  {
    $lookup: {
      from: 'demanda_abcd_01_sem',
      let: {
        producto: '$Producto',
        ubicacion: '$Ubicacion',
      },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$Producto', '$$producto'] },
                { $eq: ['$Ubicacion', '$$ubicacion'] },
              ],
            },
          },
        },
      ],
      as: 'demandaData',
    },
  },
  {
    $project: {
      _id: 1,
      Cantidad_Sem: 1,
      skuData: 1,
      demandaData: 1,
    },
  },
  {
    $addFields: {
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
              {
                $multiply: ['$Cantidad_Sem', '$SKU_Costo_Unidad'],
              },
              '$Demanda_Promedio_Semanal_Costo',
            ],
          },
          2, // Elevar al cuadrado
        ],
      },
    },
  },
];

const joinedData = await db.collection('historico_demanda_sem').aggregate(pipeline).toArray();

  // Calcular el valor y actualizar el campo Error_Cuadrado
  const updatePromises = joinedData.map(async (item) => {

    await db.collection('historico_demanda_sem').updateOne({ _id: item._id }, { $set: { Error_Cuadrado_Sem: item.Error_Cuadrado } });
  });

  await Promise.all(updatePromises);


  writeToLog(`\tTermina el Calculo del Error Cuadrado del Historico de Demanda por Semana`);
  // Cerrar la conexión a la base de datos
  client.close();
}


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}



// Ejecutar la función para calcular y actualizar el Error_Cuadrado
calculateAndUpdateErrorCuadrado();
