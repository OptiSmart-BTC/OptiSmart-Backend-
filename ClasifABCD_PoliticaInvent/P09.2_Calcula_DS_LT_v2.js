const path = require('path');
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