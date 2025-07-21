const fs = require("fs");
const { MongoClient, ObjectId } = require("mongodb");
const moment = require("moment");
const conex = require("../Configuraciones/ConStrDB");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const idPolitica = process.argv[5];
const usuario = process.argv[6] || "sistema";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const logFile = `../../${dbName.substring(dbName.lastIndexOf("_") + 1).toUpperCase()}/log/02_filtrar_politica_por_skus.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

async function filtrarPolitica() {
  let client;

  try {
    writeToLog(`[${now}] Iniciando filtrado de política según SKUs actuales`);
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const skuCollection = db.collection("sku");
    const ubisSaved = db.collection("ubis_saved");

    // 1. Obtener claves SKU_Ubicacion actuales
    const skusActuales = await skuCollection.find({}, { projection: { SKU: 1, Ubicacion: 1 } }).toArray();
    const clavesActuales = new Set(skusActuales.map(s => `${s.SKU}_${s.Ubicacion}`));

    // 2. Cargar la política guardada seleccionada
    const politicaGuardada = await ubisSaved.findOne({ _id: new ObjectId(idPolitica) });

    if (!politicaGuardada || !politicaGuardada.politica) {
      throw new Error("No se encontró la política seleccionada en ubis_saved.");
    }

    const politicaOriginal = politicaGuardada.politica;

    // 3. Filtrar solo los SKUs que existen actualmente
    const politicaFiltrada = politicaOriginal.filter(doc => {
      return clavesActuales.has(`${doc.SKU}_${doc.Ubicacion}`);
    });

    // 4. Guardar como archivo
    fs.writeFileSync("./Uso_Politica_Guardada/politica_filtrada.json", JSON.stringify(politicaFiltrada, null, 2));

    const resumen = `
✅ Filtrado completado:
- Registros originales: ${politicaOriginal.length}
- Registros actuales válidos: ${politicaFiltrada.length}
(Guardados en politica_filtrada.json)
`;

    console.log(resumen);
    writeToLog(resumen);

  } catch (err) {
    const errorLog = `[${now}] [ERROR] ${err.message}`;
    console.error(errorLog);
    writeToLog(errorLog);
  } finally {
    if (client) await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

filtrarPolitica();
