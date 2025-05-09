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

  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 04 - Calcula Error Cuadrado en Cantidad del Historico de Demanda`);

  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;

  // Conexión a la base de datos
  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db(dbName);


  const database = client.db(`${dbName}`); 
  const historicoDemandaCollection = database.collection('historico_demanda_sem');
  const politicaInventariosCollection = database.collection('politica_inventarios_01_sem');

  const pipeline = [
    {
      $lookup: {
        from: 'politica_inventarios_01_sem',
        let: {
          producto: '$Producto',
          ubicacion: '$Ubicacion' 
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$Producto', '$$producto'] },
                  { $eq: ['$Ubicacion', '$$ubicacion'] } 
                ]
              }
            }
          }
        ],
        as: 'politicaInventarios'
      }
    },
    {
      $unwind: '$politicaInventarios'
    },
    {
      $project: {
        Error_Cuadrado_Cantidad: {
          $pow: [
            {
              $subtract: [
                { $toDouble: '$Cantidad_Sem' },
                { $toDouble: '$politicaInventarios.Demanda_Promedio_Semanal' }
              ]
            },
            2
          ]
        }
      }
    }
  ];
  
  const joinedData = await historicoDemandaCollection.aggregate(pipeline).toArray();
  
  const updatePromises = joinedData.map(async (item) => {
    await historicoDemandaCollection.updateOne({ _id: item._id }, { $set: { Error_Cuadrado_Cantidad: item.Error_Cuadrado_Cantidad } });
  });
  
  await Promise.all(updatePromises);


  writeToLog(`\tTermina el Calculo del Error Cuadrado del Historico de Demanda`);

  client.close();
}


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}



// Ejecutar la función para calcular y actualizar el Error_Cuadrado
calculateAndUpdateErrorCuadrado();
