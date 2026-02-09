const fs = require("fs");
const MongoClient = require("mongodb").MongoClient;
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");

const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const collectionName = "politica_inventarios_01_sem";

const parametroFolder = dbName
  .substring(dbName.lastIndexOf("_") + 1)
  .toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

const client = new MongoClient(mongoUri);

async function updateROP() {
  writeToLog(`\nPaso 13 - Calculo del Punto de Reorden Semanal (ROP)`);

  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collectionName);

    const result = await col
      .aggregate([
        {
          $project: {
            SKU: 1,
            SS_Cantidad_Num: {
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
            Prom_LT: { $ifNull: ["$Prom_LT", 0] },
            Frecuencia_Revision_dias: {
              $ifNull: ["$Frecuencia_Revision_dias", 0],
            },
            Demanda_Promedio_Semanal: {
              $ifNull: ["$Demanda_Promedio_Semanal", 0],
            },
          },
        },
        {
          $addFields: {
            ROP: {
              $add: [
                "$SS_Cantidad_Num",
                {
                  $multiply: [
                    { $divide: ["$Demanda_Promedio_Semanal", 7] },
                    { $add: ["$Frecuencia_Revision_dias", "$Prom_LT"] },
                  ],
                },
              ],
            },
          },
        },
      ])
      .toArray();

    await Promise.all(
      result.map((doc) =>
        col.updateOne({ SKU: doc.SKU }, { $set: { ROP: doc.ROP } })
      )
    );

    writeToLog(`\tTermina el Calculo del ROP Semanal`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

updateROP();
