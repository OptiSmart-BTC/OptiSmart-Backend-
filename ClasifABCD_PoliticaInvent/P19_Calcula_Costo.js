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

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

async function calcularCosto() {
  writeToLog(`\nPaso 19 - Transforamación de datos de salida a Costo`);
  writeToLog(`\tColección base: ${collectionName}`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
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

    const Costo = joinResult.map((inventario) => {
      const costounidad = Number(inventario.skuData.Costo_Unidad) || 0;
      const n = (v) => Number(v) || 0;
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
        SS: n(inventario.SS_Cantidad) * costounidad,
        Demanda_LT: n(inventario.Demanda_LT) * costounidad,
        MOQ: n(inventario.MOQ) * costounidad,
        ROQ: n(inventario.ROQ) * costounidad,
        ROP: n(inventario.ROP) * costounidad,
        META: n(inventario.META) * costounidad,
        Inventario_Promedio: n(inventario.Inventario_Promedio) * costounidad,
      };
    });

    const costoTargetCollectionName = collectionName.includes("montecarlo")
      ? "politica_inventarios_costo_montecarlo"
      : "politica_inventarios_costo";

    writeToLog(`\tColección destino: ${costoTargetCollectionName}`);
    const CostoCollection = db.collection(costoTargetCollectionName);
    await CostoCollection.insertMany(Costo);

    writeToLog(`\tTermina la Transforamación de datos de salida a Costo`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) await client.close();
  }
}

calcularCosto();
