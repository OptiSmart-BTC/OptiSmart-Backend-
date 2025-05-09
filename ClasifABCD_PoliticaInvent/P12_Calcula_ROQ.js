const fs = require("fs");
const MongoClient = require("mongodb").MongoClient;
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

const client = new MongoClient(mongoUri);

async function updateROQ() {
  writeToLog(`\nPaso 12 - Calculo de la Cantidad a reponer o ROQ`);

  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collectionName);

    const result = await col
      .aggregate([
        {
          $project: {
            Demanda_LT: 1,
            MOQ: 1,
            ROQ: {
              $multiply: [
                {
                  $ceil: {
                    $divide: ["$Demanda_LT", "$MOQ"],
                  },
                },
                "$MOQ",
              ],
            },
          },
        },
      ])
      .toArray();

    await Promise.all(
      result.map((doc) =>
        col.updateOne({ _id: doc._id }, { $set: { ROQ: doc.ROQ } })
      )
    );

    writeToLog(`\tTermina el Calculo del ROQ`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

updateROQ();
