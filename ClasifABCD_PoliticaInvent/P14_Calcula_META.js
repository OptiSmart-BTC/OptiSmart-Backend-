const fs = require("fs");
const MongoClient = require("mongodb").MongoClient;
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");

const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];
const collectionName = process.argv.slice(2)[3] || "politica_inventarios_01";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const logFile = `C:/OptiBack/ClasifABCD_PoliticaInvent/log/P14DEBUG`;
const debugLogFile = `C:/OptiBack/ClasifABCD_PoliticaInvent/log/P14DEBUG`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

const client = new MongoClient(mongoUri);

async function updateMETA() {
  writeToLog(`\nPaso 14 - Calculo de la META`);

  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collectionName);

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

    result.forEach((doc) => {
      fs.appendFileSync(
        debugLogFile,
        `[SKU: ${doc.SKU}] ROQ: ${doc.ROQ}, SS_Cantidad: ${doc.SS_Cantidad}, BaseMETA: ${doc.BaseMETA}, META: ${doc.META}\n`
      );
    });

    await Promise.all(
      result.map((doc) =>
        col.updateOne({ SKU: doc.SKU }, { $set: { META: doc.META } })
      )
    );

    writeToLog(`\tTermina el Calculo de la META`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

updateMETA();
