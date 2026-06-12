const fs = require("fs");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const collection1 = process.argv[5] || "ui_pol_inv_dias_cobertura_sem";
const collection2 = "sku";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parametroFolder = dbName
  .substring(dbName.lastIndexOf("_") + 1)
  .toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

function writeToLog(message) {
  try {
    fs.appendFileSync(logFile, message + "\n");
  } catch {
    /* si falla el log a archivo, al menos no romper */
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function ceilNum(v) {
  return Math.ceil(num(v));
}

async function actualizarDatos01() {
  writeToLog(`\nPaso 17.1 - Dias de Cobertura, Calculo de los campos:`);
  writeToLog(`\tColección base: ${collection1}`);
  writeToLog(`\t- Vida Util en Dias`);
  writeToLog(`\t- ROP Alto`);
  writeToLog(`\t- Sobreinventario en Dias`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const col1 = db.collection(collection1);
    const col2 = db.collection(collection2);

    const result = await col1
      .aggregate([
        {
          $lookup: {
            from: collection2,
            localField: "SKU",
            foreignField: "SKU",
            as: "joinedData",
          },
        },
        { $unwind: "$joinedData" },
        {
          $set: {
            Vida_Util_Dias: "$joinedData.Vida_Util_Dias",
            Tolerancia_Vida_Util_Dias: "$joinedData.Tolerancia_Vida_Util_Dias",
          },
        },
      ])
      .toArray();

    for (const doc of result) {
      const vida = num(doc.Vida_Util_Dias);
      const tol = num(doc.Tolerancia_Vida_Util_Dias);
      const rop = num(doc.ROP);

      const ROP_Alto = tol < rop ? "SI" : "NO";
      const SobreInventario_Dias = Math.max(0, rop - tol);

      await col1.updateOne(
        { _id: doc._id },
        {
          $set: {
            Vida_Util_Dias: ceilNum(vida),
            Tolerancia_Vida_Util_Dias: ceilNum(tol),
            ROP_Alto,
            SobreInventario_Dias: ceilNum(SobreInventario_Dias),
          },
        }
      );
    }

    writeToLog(
      `\tTermina el proceso de obtencion de campos relacionados con el SKU`
    );
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) {
      client.close();
    }
  }
}

actualizarDatos01().catch(console.error);
