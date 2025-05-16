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
  writeToLog(`\nPaso 04 - Calcula Error Cuadrado en Cantidad del Historico de Demanda`);

  const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db(dbName);

  const historicoDemandaCollection = db.collection('historico_demanda_sem');

  // Pipeline optimizado
  const pipeline = [
    {
      $lookup: {
        from: 'politica_inventarios_01_sem',
        let: { producto: '$Producto', ubicacion: '$Ubicacion' },
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
        as: 'politicaInventarios',
      },
    },
    {
      $unwind: {
        path: '$politicaInventarios',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        Error_Cuadrado_Cantidad: {
          $cond: {
            if: { $and: ['$Cantidad_Sem', '$politicaInventarios.Demanda_Promedio_Semanal'] },
            then: {
              $pow: [
                {
                  $subtract: [
                    { $toDouble: '$Cantidad_Sem' },
                    { $toDouble: '$politicaInventarios.Demanda_Promedio_Semanal' },
                  ],
                },
                2,
              ],
            },
            else: null,
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        Error_Cuadrado_Cantidad: 1,
      },
    },
  ];

  // Procesar los datos en lotes para evitar problemas de memoria
  const batchSize = 1000; // Tamaño del lote
  let cursor = historicoDemandaCollection.aggregate(pipeline);

  while (await cursor.hasNext()) {
    const batch = [];
    for (let i = 0; i < batchSize && await cursor.hasNext(); i++) {
      batch.push(await cursor.next());
    }

    // Generar las operaciones bulk
    const bulkOps = batch.map((item) => ({
      updateOne: {
        filter: { _id: item._id },
        update: { $set: { Error_Cuadrado_Cantidad: item.Error_Cuadrado_Cantidad } },
      },
    }));

    // Ejecutar las actualizaciones en lote
    if (bulkOps.length > 0) {
      await historicoDemandaCollection.bulkWrite(bulkOps);
    }
  }

  writeToLog(`\tTermina el Calculo del Error Cuadrado del Historico de Demanda`);
  
  client.close();
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Ejecutar la función para calcular y actualizar el Error Cuadrado
calculateAndUpdateErrorCuadrado().catch((err) => console.error(err));
