const fs = require("fs");
const MongoClient = require("mongodb").MongoClient;
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];
const collectionName =
  process.argv.slice(2)[3] || "politica_inventarios_01_sem";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

async function calculateAndUpdateDemandaLT() {
  writeToLog(
    `\nPaso 11 - Calculo de la Cantidad de Demanda en el periodo de reposición`
  );
  writeToLog(`\tTarget collection: ${collectionName}`);

  let client;
  client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const database = client.db(`${dbName}`);
    const collection = database.collection(collectionName); // <— usar parámetro

    const pipeline = [
      {
        $project: {
          _id: 1,
          Demanda_LT: {
            $multiply: [
              {
                $add: [
                  { $divide: ["$Prom_LT", 7] },
                  { $divide: ["$Frecuencia_Revision_dias", 7] },
                ],
              },
              "$Demanda_Promedio_Semanal",
            ],
          },
        },
      },
    ];

    const result = await collection.aggregate(pipeline).toArray();

    let updated = 0;
    for (const doc of result) {
      const r = await collection.updateOne(
        { _id: doc._id },
        { $set: { Demanda_LT: doc.Demanda_LT } }
      );
      if (r.modifiedCount > 0) updated++;
    }

    writeToLog(
      `\tDocumentos procesados: ${result.length}; actualizados: ${updated}`
    );
    writeToLog(
      `\tTermina el Calculo de la Cantidad de Demanda en el periodo de reposición`
    );
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) await client.close();
  }
}

function writeToLog(message) {
  try {
    fs.appendFileSync(logFile, message + "\n");
  } catch (e) {
    console.error(`[LOG FALLÓ] ${message}`);
  }
}

calculateAndUpdateDemandaLT();