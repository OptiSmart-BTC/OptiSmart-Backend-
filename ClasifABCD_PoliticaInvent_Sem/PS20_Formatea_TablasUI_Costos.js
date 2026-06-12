const fs = require("fs");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const collectionName = process.argv[5] || "politica_inventarios_costo_sem";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametroFolder = dbName
  .substring(dbName.lastIndexOf("_") + 1)
  .toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

function writeToLog(message) {
  try {
    fs.appendFileSync(logFile, message + "\n");
  } catch {}
}

function formatCurrency(number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 4,
  }).format(number);
}

async function formatAndSaveData() {
  writeToLog(`\nPaso 20 - Formateo de la Tabla de Costos para mostrar en UI`);
  writeToLog(`\tColección base: ${collectionName}`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const source = db.collection(collectionName);

    const cursor = source.find();
    const formattedData = [];

    await cursor.forEach((document) => {
      formattedData.push({
        Tipo_Calendario: "Sem",
        SKU: document.SKU,
        Producto: document.Producto,
        Desc_Producto: document.Desc_Producto,
        Familia_Producto: document.Familia_Producto,
        Categoria: document.Categoria,
        Segmentacion_Producto: document.Segmentacion_Producto,
        Presentacion: document.Presentacion,
        Ubicacion: document.Ubicacion,
        Desc_Ubicacion: document.Desc_Ubicacion,
        SS: formatCurrency(document.SS),
        Demanda_LT: formatCurrency(document.Demanda_LT),
        MOQ: formatCurrency(document.MOQ),
        ROQ: formatCurrency(document.ROQ),
        ROP: formatCurrency(document.ROP),
        META: formatCurrency(document.META),
        Inventario_Promedio: formatCurrency(document.Inventario_Promedio),
      });
    });

    const targetName = collectionName.includes("montecarlo")
      ? "ui_pol_inv_costo_montecarlo_sem"
      : "ui_pol_inv_costo_sem";

    writeToLog(`\tColección destino: ${targetName}`);
    await db.collection(targetName).insertMany(formattedData);

    writeToLog(
      `\tTermina el Formateo de la Tabla de Costos para mostrar en UI`
    );
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) await client.close();
  }
}

formatAndSaveData();
