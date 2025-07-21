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
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;

const coleccionHistorico = "historico_ordenes_compra_sem";  // ← AJUSTA si usas otro nombre
const coleccionPolitica = "politica_inventarios_01_sem";

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

async function calcularDSLT_Semanal() {
  writeToLog(`\nPaso 09 (alt) - Calculo de DS_LT SEMANAL con math.js`);

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
      const dsDias = math.std(item.leadTimes);
      const dsSemanas = dsDias / 7;  // Transformación a semanas
      await db.collection(coleccionPolitica).updateOne(
        { Producto: item._id.Producto, Ubicacion: item._id.Ubicacion },
        { $set: { DS_LT: dsSemanas } }
      );
    }

    writeToLog(`\tTermina el Calculo de DS_LT SEMANAL`);
  } catch (error) {
    writeToLog(`${moment().format("YYYY-MM-DD HH:mm:ss")} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

calcularDSLT_Semanal();