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

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

async function calcularPallets() {
  writeToLog(`\nPaso 18 - Transforamación de datos de salida a pallets`);

  try {
    const client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const inventarios01Collection = db.collection(collectionName);
    const skuCollection = db.collection("sku");

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
      const unidadesPallet = inventario.skuData.Unidades_Pallet || 1;
      return {
        Tipo_Calendario: "Dia",
        SKU: inventario.SKU,
        Producto: inventario.Producto,
        Desc_Producto: inventario.Desc_Producto,
        Familia_Producto: inventario.Familia_Producto,
        Categoria: inventario.Categoria,
        Segmentacion_Producto: inventario.Segmentacion_Producto,
        Presentacion: inventario.Presentacion,
        Ubicacion: inventario.Ubicacion,
        Desc_Ubicacion: inventario.Desc_Ubicacion,
        SS: Math.ceil(inventario.SS_Cantidad / unidadesPallet),
        Demanda_LT: Math.ceil(inventario.Demanda_LT / unidadesPallet),
        MOQ: Math.ceil(inventario.MOQ / unidadesPallet),
        ROQ: Math.ceil(inventario.ROQ / unidadesPallet),
        ROP: Math.ceil(inventario.ROP / unidadesPallet),
        META: Math.ceil(inventario.META / unidadesPallet),
        Inventario_Promedio: Math.ceil(
          inventario.Inventario_Promedio / unidadesPallet
        ),
      };
    });

    const palletsCollection = db.collection("ui_pol_inv_pallets");
    await palletsCollection.insertMany(pallets);

    writeToLog(`\tTermina la Transforamación de datos de salida a pallets`);
    client.close();
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

calcularPallets();
