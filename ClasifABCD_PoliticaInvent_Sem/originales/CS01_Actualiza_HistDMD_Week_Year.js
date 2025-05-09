const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');


const { host, puerto} = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

//const dbName = 'btc_opti_OPTIWEEK01';
//const DBUser = 'dbOPTIWEEK01';
//const DBPassword = 'passDB123';

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 

//const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const historicoDemandaCollection = 'historico_demanda'; 


async function main() {
  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 01 - Actualizacion de los campos Week y Year para la agrupacion del Historico de la Demanda`);

  try {
    //const client = await MongoClient.connect(mongoURI, { useNewUrlParser: true });
    //const db = client.db(dbName);
    await client.connect();

    const database = client.db(`${dbName}`);
    const historicoDemandaCollection = database.collection('historico_demanda');
    const calendarCollection = database.collection('Calendar');

    const pipeline = [
      {
        $lookup: {
          from: 'Calendar',
          localField: 'Fecha',
          foreignField: 'Fecha',
          as: 'calendarData',
        },
      },
      {
        $unwind: '$calendarData',
      },
      {
        $set: {
          Week: '$calendarData.Week',
          Year: '$calendarData.Year',
          Week_Year: {         
            $concat: [
            { $toString: '$calendarData.Week' },
            '_',
            { $toString: '$calendarData.Year' },
          ],},
        },
      },
      {
        $unset: 'calendarData', // Elimina el campo calendarData si no lo necesitas
      },
      {
        $merge: {
          into: 'historico_demanda', // Nombre de la colección de destino (puede ser la misma)
          whenMatched: 'merge', // Opciones de actualización
          whenNotMatched: 'insert', // Opciones de inserción
        },
      },
    ];

    const result = await historicoDemandaCollection.aggregate(pipeline).toArray();



    writeToLog(`\tTermina la Actualizacion de los campos Week y Year para la agrupacion del Historico de la Demanda`);
  } catch (error) {
    console.error(`Ocurrió un error: ${error}`);
  } finally {
    await client.close();
  }
}

main().catch(console.error);


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

