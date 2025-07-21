const fs = require("fs");
const { MongoClient } = require("mongodb");
const moment = require("moment");
const conex = require("../Configuraciones/ConStrDB");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const usuario = process.argv[5] || "sistema";
const comentario = process.argv[6] || "Sin comentario";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const logFile = `../../${dbName.substring(dbName.lastIndexOf("_") + 1).toUpperCase()}/log/04_guardar_nueva_version.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

async function guardarNuevaVersion() {
  let client;

  try {
    writeToLog(`[${now}] Iniciando respaldo de politica_inventarios_01 en ubis_saved`);

    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const coleccionActual = await db.collection("politica_inventarios_01").find().toArray();

    if (!coleccionActual || coleccionActual.length === 0) {
      throw new Error("politica_inventarios_01 está vacía, no se puede respaldar.");
    }

    const ubisSaved = db.collection("ubis_saved");

    const documento = {
      fecha_ejecucion: new Date(),
      usuario,
      comentario,
      politica: coleccionActual,
    };

    const resultado = await ubisSaved.insertOne(documento);

    const resumen = `
✅ Política guardada en ubis_saved:
- Documentos respaldados: ${coleccionActual.length}
- ID del respaldo: ${resultado.insertedId}
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

guardarNuevaVersion();
