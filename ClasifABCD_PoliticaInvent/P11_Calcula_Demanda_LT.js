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

async function calculateAndUpdateDemandaLT() {
  writeToLog(
    `\nPaso 11 - Calculo de la Cantidad de Demanda en el periodo de reposición`
  );

  let client;
  client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const database = client.db(`${dbName}`);
    const collection = database.collection(collectionName);

    const pipeline = [
      {
        $project: {
          Demanda_LT: {
            $multiply: [
              { $add: ["$Prom_LT", "$Frecuencia_Revision_dias"] },
              "$Demanda_Promedio_Diaria",
            ],
          },
        },
      },
    ];

    const result = await collection.aggregate(pipeline).toArray();
    for (const doc of result) {
      await collection.updateOne(
        { _id: doc._id },
        { $set: { Demanda_LT: doc.Demanda_LT } }
      );
    }

    writeToLog(
      `\tTermina el Calculo de la Cantidad de Demanda en el periodo de reposición`
    );
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

calculateAndUpdateDemandaLT();
