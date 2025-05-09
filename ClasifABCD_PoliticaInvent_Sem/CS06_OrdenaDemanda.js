const fs = require('fs');
const mongodb = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const MongoClient = mongodb.MongoClient;
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; // Cambia esta ruta según la ubicación de tu archivo CSV

async function ordenarRegistrosPorUbicacion() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 06 - Se Ordena la informacion de la Demanda por Semana`);

  //const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
  const client = new MongoClient(mongoUri);

  const registroPrevio = { Producto: 'Producto', Ubicacion: 'Ubicacion', Demanda_Costo: 0, Demanda_Porcentaje: 0, Demanda_Acumulada: 0 }; 

  try {
    await client.connect();
    const database = client.db(dbName);
    const tablaOrigen = database.collection('demanda_calculada_sem');
    const tablaDestino = database.collection('demanda_ordenada_desc_sem');

 
    const pipeline = [
      { $match: { Producto: { $ne: 'Producto' } } },
      { $sort: { Ubicacion: 1, Demanda_Porcentaje: -1 } }
    ];

    const registrosOrdenados = await tablaOrigen.aggregate(pipeline).toArray();

    registrosOrdenados.unshift(registroPrevio);

    await tablaDestino.insertMany(registrosOrdenados);

    writeToLog(`\tTermina el Ordenamiento la informacion de la Demanda por Semana`);
  } catch (error) {
    writeToLog(`${now} - Error al ordenar y transferir los registros: ${error}`);
    throw error;
  } finally {
    client.close();
  }
}


ordenarRegistrosPorUbicacion()
  .catch((error) => {
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    writeToLog(`${now} - Error al ejecutar ordenarRegistrosPorUbicacion: ${error}`);
  });

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}
