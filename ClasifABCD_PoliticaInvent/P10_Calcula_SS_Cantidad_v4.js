const fs = require("fs");
const MongoClient = require("mongodb").MongoClient;
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];
const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

async function calculateAndSetSSCantidad() {
  writeToLog(`\nPaso 10 - Calculo del Inventario de Seguridad`);

  let client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(`${dbName}`);
    const col = db.collection("politica_inventarios_01");

    // =========================================================
    // [MC OVERRIDE] — Cargar SS de slow-movers desde resultados_simulaciones
    // =========================================================
    const rsimCol = db.collection("resultados_simulaciones");

    const simDocs = await rsimCol
      .find(
        { "Normal?": "No" },
        {
          projection: {
            _id: 0,
            SKU: 1,
            mejor: 1,
            SS_Opti: 1,
            SS_Semanal: 1,
            SS_Diario: 1,
            SS_Modelo: 1,
          },
        }
      )
      .toArray();

    const pickMonteSS = (d) => {
      const m = (d.mejor || "").toLowerCase();
      if (m === "dia") return d.SS_Diario;
      if (m === "sem") return d.SS_Semanal;
      if (m === "opti") return d.SS_Opti;
      if (m === "mod") return d.SS_Modelo;
      return null;
    };

    const mcSSMap = new Map();
    for (const d of simDocs) {
      const v = pickMonteSS(d);
      if (v != null) mcSSMap.set(d.SKU, v);
    }
    // =========================================================

    const result = await col.find().toArray();

    const processedResult = result.map((item) => {
      let resultado;

      if (
        item.Override_Max_Politica_Inventarios !== "" ||
        item.Override_Min_Politica_Inventarios !== ""
      ) {
        if (item.Tipo_Override === "SS") {
          if (item.Medida_Override === "Cantidad") {
            if (
              item.Override_Max_Politica_Inventarios !== "" &&
              item.Override_Max_Politica_Inventarios < item.STAT_SS
            ) {
              resultado = item.Override_Max_Politica_Inventarios;
            } else {
              if (item.Override_Min_Politica_Inventarios > item.STAT_SS) {
                resultado = item.Override_Min_Politica_Inventarios;
              } else {
                resultado = item.STAT_SS;
              }
            }
          } else {
            if (
              item.Override_Max_Politica_Inventarios !== "" &&
              item.Override_Max_Politica_Inventarios *
                item.Demanda_Promedio_Diaria <
                item.STAT_SS
            ) {
              resultado =
                item.Override_Max_Politica_Inventarios *
                item.Demanda_Promedio_Diaria;
            } else {
              if (
                item.Override_Min_Politica_Inventarios *
                  item.Demanda_Promedio_Diaria >
                item.STAT_SS
              ) {
                resultado =
                  item.Override_Min_Politica_Inventarios *
                  item.Demanda_Promedio_Diaria;
              } else {
                resultado = item.STAT_SS;
              }
            }
          }
        } else {
          const maxVal = Math.max(
            0,
            item.Medida_Override === "Cantidad"
              ? item.Override_Max_Politica_Inventarios !== "" &&
                item.Override_Max_Politica_Inventarios -
                  item.Prom_LT * item.Demanda_Promedio_Diaria <
                  item.STAT_SS
                ? item.Override_Max_Politica_Inventarios -
                  item.Prom_LT * item.Demanda_Promedio_Diaria
                : item.Override_Min_Politica_Inventarios -
                    item.Prom_LT * item.Demanda_Promedio_Diaria >
                  item.STAT_SS
                ? item.Override_Min_Politica_Inventarios -
                  item.Prom_LT * item.Demanda_Promedio_Diaria
                : item.STAT_SS
              : item.Override_Max_Politica_Inventarios !== "" &&
                item.Override_Max_Politica_Inventarios *
                  item.Demanda_Promedio_Diaria -
                  item.Prom_LT * item.Demanda_Promedio_Diaria <
                  item.STAT_SS
              ? item.Override_Max_Politica_Inventarios *
                  item.Demanda_Promedio_Diaria -
                item.Prom_LT * item.Demanda_Promedio_Diaria
              : item.Override_Min_Politica_Inventarios *
                  item.Demanda_Promedio_Diaria -
                  item.Prom_LT * item.Demanda_Promedio_Diaria >
                item.STAT_SS
              ? item.Override_Min_Politica_Inventarios *
                  item.Demanda_Promedio_Diaria -
                item.Prom_LT * item.Demanda_Promedio_Diaria
              : item.STAT_SS
          );
          resultado = maxVal;
        }
      } else {
        resultado = item.STAT_SS;
      }

      return {
        ...item,
        resultado,
      };
    });

    // =========================================================
    // LOOP FINAL — aplicar override de Montecarlo si existe
    // =========================================================
    for (const item of processedResult) {
      const mcSS = mcSSMap.get(item.SKU);
      const newSS = mcSS != null ? mcSS : item.resultado;

      await col.updateOne(
        { _id: item._id },
        {
          $set: {
            SS_Cantidad: newSS,
            ...(mcSS != null ? { FromMontecarlo: true } : {}),
          },
        }
      );
    }

    writeToLog(`\tTermina el Calculo del Inventario de Seguridad`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

calculateAndSetSSCantidad();
