const fs = require("fs");
const { MongoClient, ObjectId } = require("mongodb");
const moment = require("moment");
const conex = require("../Configuraciones/ConStrDB");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const idPolitica = process.argv[5]; // _id de ubis_saved a copiar
const usuario = process.argv[6] || "sistema";
const comentario = process.argv[7] || "Restauración completa sin cambios";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const logFile = `../../${dbName.substring(dbName.lastIndexOf("_") + 1).toUpperCase()}/log/01_restaurar_politica_completa.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

async function restaurarPolitica() {
  let client;

  try {
    writeToLog(`[${now}] Iniciando restauración completa de política`);

    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const ubisSaved = db.collection("ubis_saved");
    const politicaGuardada = await ubisSaved.findOne({ _id: new ObjectId(idPolitica) });

    if (!politicaGuardada || !politicaGuardada.politica) {
      throw new Error("No se encontró la política seleccionada en ubis_saved.");
    }

    const coleccionPolitica = db.collection("politica_inventarios_01");

    // 1. Borrar política actual
    const deleteResult = await coleccionPolitica.deleteMany({});
    writeToLog(`Se eliminaron ${deleteResult.deletedCount} documentos anteriores.`);

    // 2. Insertar la política completa desde ubis_saved
    const insertResult = await coleccionPolitica.insertMany(politicaGuardada.politica);
    writeToLog(`Insertados ${insertResult.insertedCount} documentos nuevos.`);

    // 3. Guardar como nueva versión de respaldo
    const respaldo = {
      fecha_ejecucion: new Date(),
      usuario,
      comentario: comentario + " (restauración completa)",
      politica: politicaGuardada.politica,
    };

    const resultBackup = await ubisSaved.insertOne(respaldo);

    const resumen = `
✅ Restauración completada:
- ID original: ${idPolitica}
- Documentos restaurados: ${insertResult.insertedCount}
- Nuevo respaldo guardado como ID: ${resultBackup.insertedId}
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

restaurarPolitica();
