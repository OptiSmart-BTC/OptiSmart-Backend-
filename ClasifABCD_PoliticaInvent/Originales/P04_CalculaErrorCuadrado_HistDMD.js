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
  //console.log("07_CalculaErrorCuadrado_HistDMD.js");
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 04 - Calcula Error Cuadrado en Cantidad del Historico de Demanda`);

  //const dbName = 'btc_opti_a001'; // Reemplaza con el nombre de tu base de datos
  //const url = 'mongodb://127.0.0.1:27017'; // Reemplaza con la URL de conexión a tu servidor de MongoDB
  //const url = `mongodb://${host}:${puerto}/${dbName}`;
  //const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

  // Conexión a la base de datos
  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db(dbName);

  //const database = client.db(`${dbName}`); 
  //const collection = database.collection('historico_demanda'); 

  const database = client.db(`${dbName}`); // Reemplaza 'nombre_de_tu_db' con el nombre de tu base de datos
  const historicoDemandaCollection = database.collection('historico_demanda');
  const politicaInventariosCollection = database.collection('politica_inventarios_01');

  const pipeline = [
    {
      $lookup: {
        from: 'politica_inventarios_01',
        let: {
          producto: '$Producto',
          ubicacion: '$Ubicacion' // Agregar el campo Ubicacion a let
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$Producto', '$$producto'] },
                  { $eq: ['$Ubicacion', '$$ubicacion'] } // Comprobar coincidencia de Ubicacion
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
                { $toDouble: '$Cantidad' },
                { $toDouble: '$politicaInventarios.Demanda_Promedio_Diaria' }
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


/*
  const resultado = await historicoDemandaCollection.aggregate([
    {
      $lookup: {
        from: 'politica_inventarios_01',
        localField: 'Producto',
        foreignField: 'Producto',
        as: 'politica_inventarios'
      }
    },
    {
      $unwind: '$politica_inventarios'
    },
    {
      $project: {
        Producto: '$Producto',
        Ubicacion: '$Ubicacion',
        Error_Cuadrado_Cantidad: {
          $pow: [
            {
          $subtract: [
            { $toDouble: '$Cantidad' },
            { $toDouble: '$politica_inventarios.Demanda_Promedio_Diaria' }
          ]},2]
        }
      }
    }
  ]).toArray();

  */
/*
  const pipeline = await historicoDemandaCollection.aggregate([
    {
      $lookup: {
        from: 'politica_inventarios_01',
        let: {
          producto: '$Producto',
          ubicacion: '$Ubicacion' // Agregar el campo Ubicacion a let
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$Producto', '$$producto'] },
                  { $eq: ['$Ubicacion', '$$ubicacion'] } // Comprobar coincidencia de Ubicacion
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
                { $toDouble: '$Cantidad' },
                { $toDouble: '$politicaInventarios.Demanda_Promedio_Diaria' }
              ]
            },
            2
          ]
        }
      }
    }
  ]).toArray();


  const joinedData = await db.collection('historico_demanda').aggregate(pipeline).toArray();

  const updatePromises = joinedData.map(async (item) => {
    await db.collection('historico_demanda').updateOne({ _id: item._id }, { $set: { Error_Cuadrado: item.Error_Cuadrado } });
  });

  await Promise.all(updatePromises);
*/
  /*
  for (const doc of resultado) {
    const formattedResult = JSON.stringify(doc, null, 2);
    writeToLog(formattedResult); // Registra cada documento usando writeToLog
  }
*/

  writeToLog(`\tTermina el Calculo del Error Cuadrado del Historico de Demanda`);
  // Cerrar la conexión a la base de datos
  client.close();
}


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}



// Ejecutar la función para calcular y actualizar el Error_Cuadrado
calculateAndUpdateErrorCuadrado();
