const fs = require("fs");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const collectionName = process.argv[5] || "politica_inventarios_01_sem";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametroFolder = dbName
  .substring(dbName.lastIndexOf("_") + 1)
  .toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

function writeToLog(message) {
  try {
    fs.appendFileSync(logFile, message + "\n");
  } catch {
    /* si falla el log a archivo, no rompemos */
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function calcularDiasCobertura() {
  writeToLog(
    `\nPaso 17 - Transforamación de datos de salida a días de cobertura`
  );
  writeToLog(`\tColección base: ${collectionName}`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const baseCol = db.collection(collectionName);
    const docs = await baseCol
      .find()
      .sort({ Ubicacion: 1, Producto: 1 })
      .toArray();

    // Selección de colección de salida (como P17 pero con sufijo _sem)
    const targetCollectionName = collectionName.includes("montecarlo")
      ? "ui_pol_inv_dias_cobertura_montecarlo_sem"
      : "ui_pol_inv_dias_cobertura_sem";
    const outCol = db.collection(targetCollectionName);

    // Fórmula SEMANAL (mantener):
    // días = ceil( 7 * (X / Demanda_Promedio_Semanal) ), con -1 si Demanda_Promedio_Semanal == 0
    const outDocs = docs.map((inv) => {
      const dpSem = num(inv.Demanda_Promedio_Semanal); // normalizamos a número
      const denomCero = dpSem === 0;

      const dias = (x) => (denomCero ? -1 : Math.ceil(7 * (num(x) / dpSem)));

      return {
        Tipo_Calendario: "Sem",
        SKU: inv.SKU,
        Producto: inv.Producto,
        Desc_Producto: inv.Desc_Producto,
        Familia_Producto: inv.Familia_Producto,
        Categoria: inv.Categoria,
        Segmentacion_Producto: inv.Segmentacion_Producto,
        Presentacion: inv.Presentacion,
        Ubicacion: inv.Ubicacion,
        Desc_Ubicacion: inv.Desc_Ubicacion,
        SS: dias(inv.SS_Cantidad),
        Demanda_LT: dias(inv.Demanda_LT),
        MOQ: dias(inv.MOQ),
        ROQ: dias(inv.ROQ),
        ROP: dias(inv.ROP),
        META: dias(inv.META),
        Inventario_Promedio: dias(inv.Inventario_Promedio),
        Vida_Util_Dias: 0,
        Tolerancia_Vida_Util_Dias: 0,
        ROP_Alto: " ",
        SobreInventario_Dias: 0,
      };
    });

    await outCol.insertMany(outDocs);

    console.log(`Días de cobertura SEM guardados en ${targetCollectionName}.`);
    writeToLog(`\tColección final: ${targetCollectionName}`);
    writeToLog(`\tDocumentos insertados: ${outDocs.length}`);
    writeToLog(
      `\tTermina la Transforamación de datos de salida a días de cobertura`
    );
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) await client.close();
  }
}

calcularDiasCobertura();
