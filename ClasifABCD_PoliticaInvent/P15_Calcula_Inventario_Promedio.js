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

const logFile = `C:/OptiBack/ClasifABCD_PoliticaInvent/log/P15DEBUG`;
const debugLogFile = `C:/OptiBack/ClasifABCD_PoliticaInvent/log/P15DEBUG`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

const client = new MongoClient(mongoUri);

async function updateInventarioPromedio() {
  writeToLog(`\nPaso 15 - Calculo del Inventario Promedio`);

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
            BaseInventarioPromedio: {
              $add: [
                { $divide: [{ $ifNull: ["$ROQ", 0] }, 2] },
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
            Inventario_Promedio: "$BaseInventarioPromedio",
          },
        },
      ])
      .toArray();

    result.forEach((doc) => {
      fs.appendFileSync(
        debugLogFile,
        `[SKU: ${doc.SKU}] ROQ: ${doc.ROQ}, SS_Cantidad: ${doc.SS_Cantidad}, BaseInvProm: ${doc.BaseInventarioPromedio}, Inventario_Promedio: ${doc.Inventario_Promedio}\n`
      );
    });

    await Promise.all(
      result.map((doc) =>
        col.updateOne(
          { SKU: doc.SKU },
          { $set: { Inventario_Promedio: doc.Inventario_Promedio } }
        )
      )
    );

    writeToLog(`\tTermina el Calculo del Inventario Promedio`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

updateInventarioPromedio();
