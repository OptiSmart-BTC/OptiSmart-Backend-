const fs = require("fs");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");
const { host, puerto } = require("../Configuraciones/ConexionDB");
const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const uiCollectionName = process.argv[5] || "ui_politica_inventarios_sem";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

// Log semanal
const parametroFolder = dbName
  .substring(dbName.lastIndexOf("_") + 1)
  .toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

function writeToLog(msg) {
  try {
    fs.appendFileSync(logFile, msg + "\n");
  } catch {}
}

const isMontecarlo = uiCollectionName.includes("montecarlo");
const allPolInvCollectionName = isMontecarlo
  ? "ui_all_pol_inv_montecarlo_sem"
  : "ui_all_pol_inv_sem";

async function crearTablaPoliticaInventarios() {
  writeToLog(`\nPaso 21 - Unión de Tablas (SEM)`);
  writeToLog(`\tUI base: ${uiCollectionName}`);
  writeToLog(`\tUI destino: ${allPolInvCollectionName}`);

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);

    const baseCollection = db.collection(uiCollectionName);
    const targetCollection = db.collection(allPolInvCollectionName);

    await Promise.all([
      targetCollection.createIndex({ SKU: 1 }, { name: "SKU_1" }),
      db.collection("ui_pol_inv_dias_cobertura_sem").createIndex(
        { SKU: 1 },
        { name: "SKU_1" }
      ),
      db.collection("ui_pol_inv_pallets_sem").createIndex(
        { SKU: 1 },
        { name: "SKU_1" }
      ),
      db.collection("ui_pol_inv_costo_sem").createIndex(
        { SKU: 1 },
        { name: "SKU_1" }
      ),
      db.collection("ui_pol_inv_uom_sem").createIndex(
        { SKU: 1 },
        { name: "SKU_1" }
      ),
    ]);

    // iniciar desde cero
    await targetCollection.deleteMany({});

    // base -> target
    const baseDocs = await baseCollection.find().toArray();
    const formattedDocs = baseDocs.map((doc) => ({
      ...doc,
      SS_Cantidad: doc.SS_Cantidad ?? 0,
      DC_SS: 0,
      DC_Demanda_LT: 0,
      DC_MOQ: 0,
      DC_ROQ: 0,
      DC_ROP: 0,
      DC_META: 0,
      DC_Inventario_Promedio: 0,
      DC_Vida_Util_Dias: 0,
      DC_Tolerancia_Vida_Util_Dias: 0,
      DC_ROP_Alto: "NO",
      DC_SobreInventario_Dias: 0,
      P_SS: 0,
      P_Demanda_LT: 0,
      P_MOQ: 0,
      P_ROQ: 0,
      P_ROP: 0,
      P_META: 0,
      P_Inventario_Promedio: 0,
      C_SS: 0,
      C_Demanda_LT: 0,
      C_MOQ: 0,
      C_ROQ: 0,
      C_ROP: 0,
      C_META: 0,
      C_Inventario_Promedio: 0,
      U_SS: 0,
      U_Demanda_LT: 0,
      U_MOQ: 0,
      U_ROQ: 0,
      U_ROP: 0,
      U_META: 0,
      U_Inventario_Promedio: 0,
    }));
    if (formattedDocs.length) {
      await targetCollection.insertMany(formattedDocs);
    }

    // fuentes a unir (todas en versión _sem)
    const mergeSources = [
      {
        collection: isMontecarlo
          ? "ui_pol_inv_dias_cobertura_montecarlo_sem"
          : "ui_pol_inv_dias_cobertura_sem",
        prefix: "DC",
        extras: [
          "Vida_Util_Dias",
          "Tolerancia_Vida_Util_Dias",
          "ROP_Alto",
          "SobreInventario_Dias",
        ],
      },
      {
        collection: isMontecarlo
          ? "ui_pol_inv_pallets_montecarlo_sem"
          : "ui_pol_inv_pallets_sem",
        prefix: "P",
      },
      {
        collection: isMontecarlo
          ? "ui_pol_inv_costo_montecarlo_sem"
          : "ui_pol_inv_costo_sem",
        prefix: "C",
      },
      {
        collection: isMontecarlo
          ? "ui_pol_inv_uom_montecarlo_sem"
          : "ui_pol_inv_uom_sem",
        prefix: "U",
      },
    ];

    for (const { collection, prefix, extras = [] } of mergeSources) {
      const results = await targetCollection
        .aggregate([
          {
            $lookup: {
              from: collection,
              localField: "SKU",
              foreignField: "SKU",
              as: "joined",
            },
          },
          { $unwind: "$joined" },
          {
            $set: Object.assign(
              {
                [`${prefix}_SS`]: "$joined.SS",
                [`${prefix}_Demanda_LT`]: "$joined.Demanda_LT",
                [`${prefix}_MOQ`]: "$joined.MOQ",
                [`${prefix}_ROQ`]: "$joined.ROQ",
                [`${prefix}_ROP`]: "$joined.ROP",
                [`${prefix}_META`]: "$joined.META",
                [`${prefix}_Inventario_Promedio`]:
                  "$joined.Inventario_Promedio",
              },
              extras.length > 0
                ? {
                    [`${prefix}_Vida_Util_Dias`]: "$joined.Vida_Util_Dias",
                    [`${prefix}_Tolerancia_Vida_Util_Dias`]:
                      "$joined.Tolerancia_Vida_Util_Dias",
                    [`${prefix}_ROP_Alto`]: "$joined.ROP_Alto",
                    [`${prefix}_SobreInventario_Dias`]:
                      "$joined.SobreInventario_Dias",
                  }
                : {}
            ),
          },
        ])
        .toArray();

      for (const doc of results) {
        await targetCollection.updateOne(
          { SKU: doc.SKU },
          {
            $set: Object.assign(
              {
                [`${prefix}_SS`]: doc[`${prefix}_SS`] ?? 0,
                [`${prefix}_Demanda_LT`]: doc[`${prefix}_Demanda_LT`] ?? 0,
                [`${prefix}_MOQ`]: doc[`${prefix}_MOQ`] ?? 0,
                [`${prefix}_ROQ`]: doc[`${prefix}_ROQ`] ?? 0,
                [`${prefix}_ROP`]: doc[`${prefix}_ROP`] ?? 0,
                [`${prefix}_META`]: doc[`${prefix}_META`] ?? 0,
                [`${prefix}_Inventario_Promedio`]:
                  doc[`${prefix}_Inventario_Promedio`] ?? 0,
              },
              extras.length > 0
                ? {
                    [`${prefix}_Vida_Util_Dias`]:
                      doc[`${prefix}_Vida_Util_Dias`] ?? 0,
                    [`${prefix}_Tolerancia_Vida_Util_Dias`]:
                      doc[`${prefix}_Tolerancia_Vida_Util_Dias`] ?? 0,
                    [`${prefix}_ROP_Alto`]: doc[`${prefix}_ROP_Alto`] ?? "NO",
                    [`${prefix}_SobreInventario_Dias`]:
                      doc[`${prefix}_SobreInventario_Dias`] ?? 0,
                  }
                : {}
            ),
          }
        );
      }
    }

    writeToLog(`\tUnión completada (${formattedDocs.length} SKUs base).`);
  } catch (err) {
    writeToLog(`${now} - Error en PS21: ${err}`);
  } finally {
    try {
      await client.close();
    } catch {}
  }
}

crearTablaPoliticaInventarios();
