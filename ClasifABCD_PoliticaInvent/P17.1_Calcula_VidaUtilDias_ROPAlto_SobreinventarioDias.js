const path = require('path');
const fs = require("fs");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");

const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];
const collection1 = process.argv.slice(2)[3] || "ui_pol_inv_dias_cobertura";
const collection2 = "sku";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

async function actualizarDatos01() {
  writeToLog(`\nPaso 17.1 - Dias de Cobertura, Calculo de los campos:`);
  writeToLog(`\t-Vida Util en Dias`);
  writeToLog(`\t-ROP Alto`);
  writeToLog(`\t-Sobreinventario en Dias`);

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
      const Vida_Util_Dias = doc.Vida_Util_Dias;
      const Tolerancia_Vida_Util_Dias = doc.Tolerancia_Vida_Util_Dias;
      const ROP_Alto = Tolerancia_Vida_Util_Dias < doc.ROP ? "SI" : "NO";
      const SobreInventario_Dias = Math.max(
        0,
        doc.ROP - Tolerancia_Vida_Util_Dias
      );

      await col1.updateOne(
        { _id: doc._id },
        {
          $set: {
            Vida_Util_Dias: Math.ceil(Vida_Util_Dias),
            Tolerancia_Vida_Util_Dias: Math.ceil(Tolerancia_Vida_Util_Dias),
            ROP_Alto: ROP_Alto,
            SobreInventario_Dias: Math.ceil(SobreInventario_Dias),
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

function writeToLog(message) {
  const moment = require('moment');
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  const logMessage = `[${timestamp}] ${message}`;
  
  try {
    // Lógica mejorada para determinar el directorio de log
    let parametroFolder;
    try {
      if (typeof dbName !== 'undefined' && dbName) {
        const partes = dbName.split("_");
        let parte = partes[partes.length - 1];
        
        // Si la última parte parece un timestamp (12+ dígitos), usar la anterior
        if (/^\d{12,}$/.test(parte)) {
          parte = partes[partes.length - 2];
        }
        
        parametroFolder = parte.toUpperCase();
      } else {
        parametroFolder = 'DEFAULT';
      }
    } catch (error) {
      parametroFolder = 'DEFAULT';
    }
    
    const logFile = path.resolve(__dirname, `../../${parametroFolder}/log/ClasABCD_PolInvent.log`);
    const logDir = path.dirname(logFile);
    
    // Crear directorio si no existe
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Escribir al archivo de log
    fs.appendFileSync(logFile, logMessage + '\n');
  } catch (err) {
    // Fallback: escribir en directorio actual si hay problemas
    try {
      const fallbackLogFile = path.join(__dirname, `${path.basename(__filename, '.js')}_fallback.log`);
      fs.appendFileSync(fallbackLogFile, logMessage + '\n');
      console.error(`Log escrito en fallback: ${fallbackLogFile}`);
    } catch (fallbackErr) {
      // Si todo falla, solo mostrar en consola
      console.error(`Error escribiendo log: ${err.message}`);
      console.log(logMessage);
    }
  }
}

actualizarDatos01().catch(console.error);
