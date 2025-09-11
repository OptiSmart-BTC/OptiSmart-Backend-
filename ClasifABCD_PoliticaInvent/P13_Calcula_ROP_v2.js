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

const now = moment().format("YYYY-MM-DD HH:mm:ss");

const client = new MongoClient(mongoUri);

async function updateROP() {
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
            Demanda_Promedio_Diaria: {
              $ifNull: ["$Demanda_Promedio_Diaria", 0],
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
                    "$Demanda_Promedio_Diaria",
                    { $add: ["$Prom_LT", "$Frecuencia_Revision_dias"] },
                  ],
                },
              ],
            },
          },
        },
      ])
      .toArray();

    // Debugging
    console.log("SKU\nROP Calculado\nSS\nDPD\nLT\nFreq_Rev");
    for (const doc of result) {
      console.log(
        `${doc.SKU}\t${doc.ROP}\t${doc.SS_Cantidad_Num}\t${doc.Demanda_Promedio_Diaria}\t${doc.Prom_LT}\t${doc.Frecuencia_Revision_dias}`
      );

      try {
        const updateResult = await col.updateOne(
          { SKU: doc.SKU },
          { $set: { ROP: doc.ROP } }
        );
        if (updateResult.modifiedCount === 0) {
          console.warn(`[WARNING] No se actualizó el SKU: ${doc.SKU}`);
        }
      } catch (err) {
        console.error(
          `[ERROR] Falló updateOne para SKU: ${doc.SKU} - ${err.message}`
        );
      }
    }
  } catch (error) {
    console.error("ERROR durante la ejecución:", error);
  } finally {
    await client.close();
  }
}

updateROP();
