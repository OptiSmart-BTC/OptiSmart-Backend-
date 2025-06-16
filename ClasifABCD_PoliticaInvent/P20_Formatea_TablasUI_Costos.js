const fs = require("fs");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");

const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];
const collectionName = process.argv.slice(2)[3] || "politica_inventarios_costo";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

const targetCollectionName = "ui_pol_inv_costo";

function formatCurrency(number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 4,
  }).format(number);
}

async function formatAndSaveData() {
  writeToLog(`\nPaso 20 - Formateo de la Tabla de Costos para mostrar en UI`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    const cursor = collection.find();

    const formattedData = [];

    await cursor.forEach((document) => {
      const formattedDocument = {
        Tipo_Calendario: "Dia",
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
      };

      formattedData.push(formattedDocument);
    });

    const collectionTargetName = collectionName.includes("montecarlo")
      ? "ui_pol_inv_costo_montecarlo"
      : "ui_pol_inv_costo";

    const targetCollection = db.collection(collectionTargetName);
    await targetCollection.insertMany(formattedData);

    writeToLog(
      `\tTermina el Formateo de la Tabla de Costos para mostrar en UI`
    );
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

formatAndSaveData();
