const fs = require("fs");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");
const math = require("mathjs");

const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`;

const coleccionHistorico = "historico_ordenes_compra";  // <- AJUSTAR si tienes otro nombre
const coleccionPolitica = "politica_inventarios_01";

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

async function calcularDSLT() {
  writeToLog(`\nPaso 09 (alt) - Calculo del DS_LT con math.js`);

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);

    const data = await db.collection(coleccionHistorico).aggregate([
      {
        $match: {
          LeadTime_Dias: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: { Producto: "$Producto", Ubicacion: "$Ubicacion" },
          leadTimes: { $push: "$LeadTime_Dias" }
        }
      }
    ]).toArray();

    for (const item of data) {
      const ds_lt = math.std(item.leadTimes);
      await db.collection(coleccionPolitica).updateOne(
        { Producto: item._id.Producto, Ubicacion: item._id.Ubicacion },
        { $set: { DS_LT: ds_lt } }
      );
    }

    writeToLog(`\tTermina el Calculo del DS_LT`);
  } catch (error) {
    writeToLog(`${moment().format("YYYY-MM-DD HH:mm:ss")} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

calcularDSLT();