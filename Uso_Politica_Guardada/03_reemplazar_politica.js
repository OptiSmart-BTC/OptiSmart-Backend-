const fs = require("fs");
const { MongoClient } = require("mongodb");
const moment = require("moment");
const conex = require("../Configuraciones/ConStrDB");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const usuario = process.argv[5] || "sistema";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const logFile = `../../${dbName.substring(dbName.lastIndexOf("_") + 1).toUpperCase()}/log/03_reemplazar_politica.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

async function reemplazarPolitica() {
  let client;

  try {
    writeToLog(`[${now}] Iniciando reemplazo de politica_inventarios_01 con la política filtrada`);

    const politica = JSON.parse(fs.readFileSync("./Uso_Politica_Guardada/politica_filtrada.json"));

    if (!politica || politica.length === 0) {
      throw new Error("La política filtrada está vacía o no fue generada correctamente.");
    }

    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const coleccionPolitica = db.collection("politica_inventarios_01");

    // 1. Eliminar todos los documentos actuales
    const deleteResult = await coleccionPolitica.deleteMany({});
    writeToLog(`Se eliminaron ${deleteResult.deletedCount} documentos anteriores.`);

    // 2. Insertar la nueva política completa
    const insertResult = await coleccionPolitica.insertMany(politica);
    const resumen = `
✅ Reemplazo completado:
- Documentos insertados: ${insertResult.insertedCount}
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

reemplazarPolitica();
