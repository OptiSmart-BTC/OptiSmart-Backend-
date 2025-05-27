const fs = require("fs");
const { MongoClient } = require("mongodb");
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

async function copiarDatos() {
  writeToLog(`\nPaso 16 - Formateo de las Tablas Finales para mostrar en UI`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // 👇 Aquí está el fix importante:
    const finalCollectionName = collectionName.includes("montecarlo")
      ? "ui_politica_inventarios_montecarlo"
      : "ui_politica_inventarios";

    const finalCollection = db.collection(finalCollectionName);
    writeToLog(`\nColección base: ${collectionName}`);
    writeToLog(`\nColección final: ${finalCollectionName}`);

    await finalCollection.deleteMany({});

    const datos = await collection.find().toArray();

    const datosFormateados = datos.map((dato) => {
      return {
        ...dato,
        Valor_Z: formatearNumero(dato.Valor_Z),
        Demanda_Promedio_Diaria: formatearNumero(dato.Demanda_Promedio_Diaria),
        Variabilidad_Demanda_Cantidad: formatearNumero(
          dato.Variabilidad_Demanda_Cantidad
        ),
        DS_Demanda: formatearNumero(dato.DS_Demanda),
        Prom_LT: formatearNumero(dato.Prom_LT),
        DS_LT: formatearNumero(dato.DS_LT),
        SS_Cantidad: formatearNumero(dato.SS_Cantidad),
        Demanda_LT: formatearNumero2(dato.Demanda_LT),
        MOQ: formatearNumero2(dato.MOQ),
        ROQ: formatearNumero2(dato.ROQ),
        ROP: formatearNumero2(dato.ROP),
        META: formatearNumero(dato.META),
        Inventario_Promedio: formatearNumero2(dato.Inventario_Promedio),
        STAT_SS: formatearNumero2(dato.STAT_SS),
      };
    });

    await finalCollection.insertMany(datosFormateados);

    writeToLog(`\tTermina el Formateo de las Tablas Finales`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) await client.close();
  }
}

function formatearNumero(numero) {
  const n = Number(numero);
  if (!isNaN(n)) {
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }
  return 0; // fallback to 0 if truly invalid
}

function formatearNumero2(numero) {
  const n = Number(numero);
  if (!isNaN(n)) {
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return 0;
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

copiarDatos();
