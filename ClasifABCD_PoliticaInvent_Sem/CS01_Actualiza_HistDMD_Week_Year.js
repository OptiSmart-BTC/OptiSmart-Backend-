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

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const historicoDemandaCollection = 'historico_demanda'; 

async function main() {
  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 01 - Actualizacion de los campos Week y Year para la agrupacion del Historico de la Demanda`);

  try {
    await client.connect();

    const database = client.db(dbName);
    const historicoDemandaCollection = database.collection('historico_demanda');
    const calendarCollection = database.collection('Calendar');

    // Verificar que existan registros en ambas colecciones
    const demandaCount = await historicoDemandaCollection.countDocuments();
    const calendarCount = await calendarCollection.countDocuments();
    
    writeToLog(`\tRegistros en historico_demanda: ${demandaCount}`);
    writeToLog(`\tRegistros en Calendar: ${calendarCount}`);

    if (demandaCount === 0) {
      writeToLog(`\tAdvertencia: No hay registros en historico_demanda para procesar`);
      return;
    }

    if (calendarCount === 0) {
      writeToLog(`\tError: No hay registros en Calendar para hacer el lookup`);
      return;
    }

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
        $unwind: {
          path: '$calendarData',
          preserveNullAndEmptyArrays: false // Solo procesa registros que tengan match con Calendar
        }
      },
      {
        $set: {
          Week: '$calendarData.Week',
          Year: '$calendarData.Year',
          Week_Year: {         
            $concat: [
              { $toString: '$calendarData.Week' },
              '_W',
              { $toString: '$calendarData.Year' },
            ]
          }
        }
      },
      {
        $unset: 'calendarData' // Elimina el campo calendarData temporal
      },
      {
        $merge: {
          into: 'historico_demanda', // Actualiza la misma colección
          whenMatched: 'merge', // Actualiza campos existentes
          whenNotMatched: 'insert' // Inserta si no existe (aunque no debería pasar)
        }
      }
    ];

    // Ejecutar el pipeline de agregación
    const result = await historicoDemandaCollection.aggregate(pipeline).toArray();
    
    // Verificar cuántos registros fueron actualizados
    const updatedCount = await historicoDemandaCollection.countDocuments({
      Week: { $exists: true },
      Year: { $exists: true },
      Week_Year: { $exists: true }
    });

    writeToLog(`\tRegistros actualizados con campos Week/Year: ${updatedCount}`);
    writeToLog(`\tTermina la Actualizacion de los campos Week y Year para la agrupacion del Historico de la Demanda`);
    
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
    console.error(`Ocurrió un error: ${error}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  fs.appendFileSync(logFile, `${timestamp} - ${message}\n`);
}

// Ejecutar la función principal
main().catch(console.error);