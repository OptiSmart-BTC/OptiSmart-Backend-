const fs = require("fs");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const collectionName = process.argv[5] || "politica_inventarios_01";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametroFolder = dbName
  .substring(dbName.lastIndexOf("_") + 1)
  .toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

function writeToLog(message) {
  try {
    fs.appendFileSync(logFile, message + "\n");
  } catch {}
}
const n = (v) => Number(v) || 0;

async function calcularUOM() {
  writeToLog(`\nPaso 19.1 - Transforamación de datos de salida a UOM`);
  writeToLog(`\tColección base: ${collectionName}`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const baseCol = db.collection(collectionName);

    const join = await baseCol
      .aggregate([
        {
          $lookup: {
            from: "sku",
            localField: "SKU",
            foreignField: "SKU",
            as: "skuData",
          },
        },
        { $unwind: "$skuData" },
        { $sort: { Ubicacion: 1, Producto: 1 } },
      ])
      .toArray();

    const uomdata = join.map((inv) => {
      const unidadesEmpaque = n(inv.skuData.Unidades_Empaque) || 1;
      return {
        Tipo_Calendario: "Dia",
        UOM: inv.skuData.Unidad_Medida_UOM,
        SKU: inv.SKU,
        Producto: inv.Producto,
        Desc_Producto: inv.Desc_Producto,
        Familia_Producto: inv.Familia_Producto,
        Categoria: inv.Categoria,
        Segmentacion_Producto: inv.Segmentacion_Producto,
        Presentacion: inv.Presentacion,
        Ubicacion: inv.Ubicacion,
        Desc_Ubicacion: inv.Desc_Ubicacion,
        SS: n(inv.SS_Cantidad) * unidadesEmpaque,
        Demanda_LT: n(inv.Demanda_LT) * unidadesEmpaque,
        MOQ: n(inv.MOQ) * unidadesEmpaque,
        ROQ: n(inv.ROQ) * unidadesEmpaque,
        ROP: n(inv.ROP) * unidadesEmpaque,
        META: n(inv.META) * unidadesEmpaque,
        Inventario_Promedio: n(inv.Inventario_Promedio) * unidadesEmpaque,
      };
    });

    const outName = collectionName.includes("montecarlo")
      ? "ui_pol_inv_uom_montecarlo"
      : "ui_pol_inv_uom";

    writeToLog(`\tColección destino: ${outName}`);
    await db.collection(outName).insertMany(uomdata);

    writeToLog(`\tTermina la Transforamación de datos de salida a UOM`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) await client.close();
  }
}

calcularUOM();
