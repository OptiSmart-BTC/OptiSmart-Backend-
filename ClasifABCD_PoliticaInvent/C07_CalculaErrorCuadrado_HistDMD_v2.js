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
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 

async function calculateAndUpdateErrorCuadrado() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 07 - Calcula Error Cuadrado Costos del Historico de Demanda`);


  //const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

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
      from: 'demanda_abcd_01',
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
      Cantidad: 1,
      skuData: 1,
      demandaData: 1,
    },
  },
  {
    $addFields: {
      SKU_Costo_Unidad: { $arrayElemAt: ['$skuData.Costo_Unidad', 0] },
      Demanda_Promedio_Diaria_Costo: { $arrayElemAt: ['$demandaData.Demanda_Promedio_Diaria_Costo', 0] },
    },
  },
  {
    $addFields: {
      Error_Cuadrado: {
        $pow: [
          {
            $subtract: [
              {
                $multiply: ['$Cantidad', '$SKU_Costo_Unidad'],
              },
              '$Demanda_Promedio_Diaria_Costo',
            ],
          },
          2, // Elevar al cuadrado
        ],
      },
    },
  },
];

const joinedData = await db.collection('historico_demanda').aggregate(pipeline).toArray();


  const updatePromises = joinedData.map(async (item) => {

    await db.collection('historico_demanda').updateOne({ _id: item._id }, { $set: { Error_Cuadrado: item.Error_Cuadrado } });
  });

  await Promise.all(updatePromises);

  writeToLog(`\tTermina el Calculo del Error Cuadrado del Historico de Demanda`);
  // Cerrar la conexión a la base de datos
  client.close();
}


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}



// Ejecutar la función para calcular y actualizar el Error_Cuadrado
calculateAndUpdateErrorCuadrado();
