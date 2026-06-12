const fs = require("fs");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const collectionName = process.argv[5] || "politica_inventarios_01_sem";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametroFolder = dbName
  .substring(dbName.lastIndexOf("_") + 1)
  .toUpperCase();
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

async function updateMETA() {
  writeToLog(
    `\nPaso 14 - Calculo del Inventario objetivo al hacer pedido (META)`
  );
  writeToLog(`\tTarget collection: ${collectionName}`);

  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collectionName);

    // Igual que P14 en lo técnico: normalizamos SS_Cantidad a número.
    const result = await col
      .aggregate([
        {
          $project: {
            SKU: 1,
            ROQ: 1,
            SS_Cantidad: 1,
            BaseMETA: {
              $add: [
                { $ifNull: ["$ROQ", 0] },
                {
                  $cond: {
                    if: {
                      $or: [
                        { $eq: ["$SS_Cantidad", null] },
                        { $eq: ["$SS_Cantidad", ""] },
                      ],
                    },
                    then: 0,
                    else: { $toDouble: "$SS_Cantidad" },
                  },
                },
              ],
            },
          },
        },
        {
          $addFields: {
            META: "$BaseMETA",
          },
        },
      ])
      .toArray();

    await Promise.all(
      result.map((doc) =>
        col.updateOne({ SKU: doc.SKU }, { $set: { META: doc.META } })
      )
    );

    writeToLog(`\tTermina el Calculo de META`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

updateMETA();
