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
  } catch (e) {
    console.error(`[LOG FALLÓ] ${message}`);
  }
}

function fmt4(n) {
  const v = Number(n);
  if (!Number.isNaN(v)) {
    return v.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }
  return 0;
}
function fmt0(n) {
  const v = Number(n);
  if (!Number.isNaN(v)) {
    return v.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return 0;
}

async function copiarDatos() {
  writeToLog(`\nPaso 16 - Formateo de las Tablas Finales para mostrar en UI`);
  writeToLog(`\tColección base: ${collectionName}`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const base = db.collection(collectionName);

    // Igual criterio que P16, pero con sufijo _sem obligado para semanal
    const finalCollectionName = collectionName.includes("montecarlo")
      ? "ui_politica_inventarios_montecarlo_sem"
      : "ui_politica_inventarios_sem";

    writeToLog(`\tColección final: ${finalCollectionName}`);
    const finalCol = db.collection(finalCollectionName);
    await finalCol.deleteMany({});

    const datos = await base.find().toArray();

    // Campos SEM: Demanda_Promedio_Semanal, etc. (NO cambiar nombres de campo)
    const datosFormateados = datos.map((d) => ({
      ...d,
      Valor_Z: fmt4(d.Valor_Z),
      Demanda_Promedio_Semanal: fmt4(d.Demanda_Promedio_Semanal),
      Variabilidad_Demanda_Cantidad: fmt4(d.Variabilidad_Demanda_Cantidad),
      DS_Demanda: fmt4(d.DS_Demanda),
      Prom_LT: fmt4(d.Prom_LT),
      DS_LT: fmt4(d.DS_LT),
      SS_Cantidad: fmt4(d.SS_Cantidad),
      Demanda_LT: fmt0(d.Demanda_LT),
      MOQ: fmt0(d.MOQ),
      ROQ: fmt0(d.ROQ),
      ROP: fmt0(d.ROP),
      META: fmt4(d.META),
      Inventario_Promedio: fmt0(d.Inventario_Promedio),
      STAT_SS: fmt0(d.STAT_SS),
    }));

    await finalCol.insertMany(datosFormateados);
    writeToLog(`\tTermina el Formateo de las Tablas Finales`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) await client.close();
  }
}

copiarDatos();
