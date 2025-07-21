const fs = require("fs");
const { MongoClient, ObjectId } = require("mongodb");
const moment = require("moment");
const conex = require("../Configuraciones/ConStrDB");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const idPolitica = process.argv[5]; // _id de ubis_saved
const usuario = process.argv[6] || "sistema";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const logFile = `../../${dbName.substring(dbName.lastIndexOf("_") + 1).toUpperCase()}/log/01_comparar_skus_con_politica.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

async function compararClaves() {
  let client;

  try {
    writeToLog(`[${now}] Iniciando comparación de SKUs actuales vs política ${idPolitica}`);
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const skuCollection = db.collection("sku");
    const ubisSaved = db.collection("ubis_saved");

    // 1. Obtener claves actuales desde la colección sku
    const skusActuales = await skuCollection
      .find({}, { projection: { SKU: 1, Ubicacion: 1 } })
      .toArray();

    const clavesActuales = new Set(
      skusActuales.map((s) => `${s.SKU}_${s.Ubicacion}`)
    );

    // 2. Obtener política guardada
    const politicaGuardada = await ubisSaved.findOne({ _id: new ObjectId(idPolitica) });

    if (!politicaGuardada || !politicaGuardada.politica) {
      throw new Error("No se encontró la política seleccionada en ubis_saved.");
    }

    const clavesPolitica = new Set(
      politicaGuardada.politica.map((p) => `${p.SKU}_${p.Ubicacion}`)
    );

    // 3. Comparación
    const comunes = [...clavesActuales].filter((k) => clavesPolitica.has(k));
    const soloEnSku = [...clavesActuales].filter((k) => !clavesPolitica.has(k));
    const soloEnPolitica = [...clavesPolitica].filter((k) => !clavesActuales.has(k));

    // 4. Guardar comparación en JSON
    fs.writeFileSync("./Uso_Politica_Guardada/comunes.json", JSON.stringify(comunes, null, 2));
    fs.writeFileSync("./Uso_Politica_Guardada/solo_en_sku.json", JSON.stringify(soloEnSku, null, 2));
    fs.writeFileSync("./Uso_Politica_Guardada/solo_en_politica.json", JSON.stringify(soloEnPolitica, null, 2));

    const resumen = `
✅ Comparación completada:
- Claves comunes: ${comunes.length}
- Solo en colección sku: ${soloEnSku.length}
- Solo en política guardada: ${soloEnPolitica.length}
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

compararClaves();
