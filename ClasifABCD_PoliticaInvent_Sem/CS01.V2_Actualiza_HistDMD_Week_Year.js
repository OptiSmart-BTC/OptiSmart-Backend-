const { MongoClient } = require('mongodb');
const fs = require('fs');
const moment = require('moment');

const conex = require('../Configuraciones/ConStrDB');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;
const log = (m) => fs.appendFileSync(logFile, m + '\n');

(async () => {
  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });

  log(`\nPaso 01 - Actualiza Week/Year usando calendario_historico`);
  try {
    await client.connect();
    const db = client.db(dbName);

    // Índices para join rápido por Fecha (idempotentes)
    await db.collection('historico_demanda').createIndex({ Fecha: 1 });
    await db.collection('calendario_historico').createIndex({ Fecha: 1 }, { unique: true, name: 'Fecha_1' });

    const pipeline = [
      // (Opcional) Si tu carga nueva trae un rango concreto, activa este match:
      // { $match: { Fecha: { $gte: nuevaFechaInicio, $lte: nuevaFechaFin } } },

      {
        $lookup: {
          from: 'calendario_historico',
          localField: 'Fecha',
          foreignField: 'Fecha',
          as: 'calendarData'
        }
      },
      { $unwind: '$calendarData' },
      {
        $set: {
          Week: '$calendarData.Week',
          Year: '$calendarData.Year',
          Week_Year: {
            $concat: [
              { $toString: '$calendarData.Week' },
              '_W',
              { $toString: '$calendarData.Year' }
            ]
          }
        }
      },
      { $unset: 'calendarData' },
      {
        $merge: {
          into: 'historico_demanda',
          whenMatched: 'merge',
          whenNotMatched: 'discard' // no insertamos filas “nuevas” desde el lookup
        }
      }
    ];

    // Ejecuta el pipeline en servidor (sin .toArray())
    await db.collection('historico_demanda').aggregate(pipeline, { allowDiskUse: true }).next();

    log(`\tTermina Paso 01 - Week/Year actualizados`);
  } catch (e) {
    log(`${moment().format('YYYY-MM-DD HH:mm:ss')} - Error: ${e}`);
    console.error(e);
    process.exit(1);
  } finally {
    await client.close();
  }
})();