const fs = require("fs");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];
const collectionName =
  process.argv.slice(2)[3] || "politica_inventarios_01_sem";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

// Log semanal (igual estilo PS)
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

function writeToLog(message) {
  try {
    fs.appendFileSync(logFile, message + "\n");
  } catch (e) {
    console.error(`[LOG FALLÓ] ${message}`);
  }
}

const client = new MongoClient(mongoUri);

async function updateROQ() {
  writeToLog(`\nPaso 12 - Calculo de la Cantidad a reponer o ROQ`);
  writeToLog(`\tTarget collection: ${collectionName}`);

  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collectionName);

    const result = await col
      .aggregate([
        {
          $project: {
            _id: 1,
            Demanda_LT: { $ifNull: ["$Demanda_LT", 0] },
            MOQ: { $ifNull: ["$MOQ", 0] },
            ROQ: {
              $cond: [
                { $gt: ["$MOQ", 0] }, // si MOQ > 0
                {
                  $multiply: [
                    {
                      $ceil: {
                        $divide: [
                          { $toDouble: { $ifNull: ["$Demanda_LT", 0] } },
                          { $toDouble: { $ifNull: ["$MOQ", 0] } },
                        ],
                      },
                    },
                    { $toDouble: { $ifNull: ["$MOQ", 0] } },
                  ],
                },
                0, // si MOQ == 0, ROQ = 0
              ],
            },
          },
        },
      ])
      .toArray();

    await Promise.all(
      result.map((doc) =>
        col.updateOne({ _id: doc._id }, { $set: { ROQ: doc.ROQ } })
      )
    );

    writeToLog(`\tTermina el Calculo del ROQ`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

updateROQ();
