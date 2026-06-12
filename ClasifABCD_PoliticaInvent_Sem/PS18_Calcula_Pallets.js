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

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

async function calcularPallets() {
  writeToLog(`\nPaso 18 - Transforamación de datos de salida a pallets`);
  writeToLog(`\tColección base: ${collectionName}`);

  try {
    const client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const inventarios01Collection = db.collection(collectionName);

    const joinResult = await inventarios01Collection
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

    const pallets = joinResult.map((inventario) => {
      const unidadesPallet = Number(inventario.skuData.Unidades_Pallet) || 1;
      return {
        Tipo_Calendario: "Sem",
        SKU: inventario.SKU,
        Producto: inventario.Producto,
        Desc_Producto: inventario.Desc_Producto,
        Familia_Producto: inventario.Familia_Producto,
        Categoria: inventario.Categoria,
        Segmentacion_Producto: inventario.Segmentacion_Producto,
        Presentacion: inventario.Presentacion,
        Ubicacion: inventario.Ubicacion,
        Desc_Ubicacion: inventario.Desc_Ubicacion,
        SS: Math.ceil((Number(inventario.SS_Cantidad) || 0) / unidadesPallet),
        Demanda_LT: Math.ceil(
          (Number(inventario.Demanda_LT) || 0) / unidadesPallet
        ),
        MOQ: Math.ceil((Number(inventario.MOQ) || 0) / unidadesPallet),
        ROQ: Math.ceil((Number(inventario.ROQ) || 0) / unidadesPallet),
        ROP: Math.ceil((Number(inventario.ROP) || 0) / unidadesPallet),
        META: Math.ceil((Number(inventario.META) || 0) / unidadesPallet),
        Inventario_Promedio: Math.ceil(
          (Number(inventario.Inventario_Promedio) || 0) / unidadesPallet
        ),
      };
    });

    const outName = collectionName.includes("montecarlo")
      ? "ui_pol_inv_pallets_montecarlo_sem"
      : "ui_pol_inv_pallets_sem";

    writeToLog(`\tColección salida: ${outName}`);
    const palletsCollection = db.collection(outName);
    await palletsCollection.insertMany(pallets);

    writeToLog(`\tTermina la Transforamación de datos de salida a pallets`);
    client.close();
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  }
}

calcularPallets();
