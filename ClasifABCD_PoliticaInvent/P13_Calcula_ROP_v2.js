const path = require('path');
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

const now = moment().format("YYYY-MM-DD HH:mm:ss");

const client = new MongoClient(mongoUri);

async function updateROP() {
  writeToLog(`\nPaso 13 - Calculo del Punto de Reorden (ROP)`);

  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collectionName);

    const result = await col
      .aggregate([
        {
          $project: {
            SKU: 1,
            SS_Cantidad_Num: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ["$SS_Cantidad", null] },
                    { $eq: ["$SS_Cantidad", ""] },
                  ],
                },
                then: 0,
                else: { $toDouble: "$SS_Cantidad" },
              },
            },
            Prom_LT: 1,
            Demanda_Promedio_Diaria: 1,
            Tipo_Override: 1,
            Medida_Override: 1,
            Override_Min_Politica_Inventarios: 1,
            Override_Max_Politica_Inventarios: 1,
            BaseROP: {
              $add: [
                {
                  $cond: {
                    if: {
                      $or: [
                        { $eq: ["$SS_Cantidad", null] },
                        { $eq: ["$SS_Cantidad", ""] },
                      ],
                    },
                    then: 0,
                    else: { $toDouble: "$SS_Cantidad" },
                  },
                },
                {
                  $multiply: [
                    { $ifNull: ["$Prom_LT", 0] },
                    { $ifNull: ["$Demanda_Promedio_Diaria", 0] },
                  ],
                },
              ],
            },
          },
        },
        {
          $addFields: {
            ROP: {
              $cond: {
                if: {
                  $or: [
                    { $ne: ["$Override_Min_Politica_Inventarios", ""] },
                    { $ne: ["$Override_Max_Politica_Inventarios", ""] },
                  ],
                },
                then: {
                  $cond: {
                    if: { $eq: ["$Tipo_Override", "SS"] },
                    then: "$BaseROP",
                    else: {
                      $cond: {
                        if: { $gt: ["$SS_Cantidad_Num", 0] },
                        then: "$BaseROP",
                        else: {
                          $cond: {
                            if: { $eq: ["$Medida_Override", "Cantidad"] },
                            then: "$Override_Max_Politica_Inventarios",
                            else: {
                              $multiply: [
                                "$Override_Max_Politica_Inventarios",
                                { $ifNull: ["$Demanda_Promedio_Diaria", 0] },
                              ],
                            },
                          },
                        },
                      },
                    },
                  },
                },
                else: "$BaseROP",
              },
            },
          },
        },
      ])
      .toArray();

    

    await Promise.all(
      result.map((doc) =>
        col.updateOne({ SKU: doc.SKU }, { $set: { ROP: doc.ROP } })
      )
    );

    writeToLog(`\tTermina el Calculo del ROP`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
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

updateROP();
