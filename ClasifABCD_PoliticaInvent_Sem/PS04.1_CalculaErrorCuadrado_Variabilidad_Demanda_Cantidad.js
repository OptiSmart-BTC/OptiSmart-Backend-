/**
 * PS04.1_CalculaErrorCuadrado_y_Variabilidad.js
 *
 * Unifica:
 *  - Cálculo de Error_Cuadrado_Cantidad en historico_demanda_sem (como PS04)
 *  - Variabilidad_Demanda_Cantidad en politica_inventarios_01_sem (como PS05)
 *
 * Fórmulas:
 *   Error_Cuadrado_Cantidad = (Cantidad_Sem - Demanda_Promedio_Semanal)^2
 *   Variabilidad_Demanda_Cantidad = SUM(Error_Cuadrado_Cantidad) / N_semanas
 */

const fs = require("fs");
const { MongoClient } = require("mongodb");
const moment = require("moment");
const conex = require("../Configuraciones/ConStrDB");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;

function writeToLog(msg) {
  fs.appendFileSync(logFile, `${msg}\n`);
}

async function getHorizonte(db) {
  const p1 = await db.collection("parametros_usuario").findOne({ Tipo: "Horizontes", Num_Param: 1 });
  const p2 = await db.collection("parametros_usuario").findOne({ Tipo: "Horizontes", Num_Param: 2 });

  const dias = Number(p1?.Horizonte_Historico_dias) || 28; // default 4 semanas
  const fechaFin = p2?.Fecha_Fin_Horizonte ? new Date(p2.Fecha_Fin_Horizonte) : new Date();
  const fechaIni = new Date(fechaFin);
  fechaIni.setDate(fechaFin.getDate() - (dias - 1));

  const nSemanas = Math.max(1, Math.ceil(dias / 7));
  return { dias, nSemanas, fechaIni, fechaFin };
}

async function CalculaErrorCuadrado_y_Variabilidad() {
  writeToLog(`\nPaso 04.1 - Calcula Error Cuadrado y Variabilidad (SEMANAL)`);
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(dbName);

    const historicoCol = db.collection("historico_demanda_sem");
    const politicaCol = db.collection("politica_inventarios_01_sem");

    const { dias, nSemanas, fechaIni, fechaFin } = await getHorizonte(db);
    writeToLog(`\tHorizonte: ${dias} días | ${nSemanas} semanas | ${moment(fechaIni).format("YYYY-MM-DD")} → ${moment(fechaFin).format("YYYY-MM-DD")}`);

    // -----------------------------
    // 1) Calcular y escribir Error_Cuadrado_Cantidad en histórico (como PS04)
    // -----------------------------
    writeToLog(`\t[1/2] Actualizando Error_Cuadrado_Cantidad en historico_demanda_sem...`);

    // Traemos demanda promedio semanal por SKU desde politica_inventarios_01_sem
    const promedios = await politicaCol
      .find({}, { projection: { Producto: 1, Ubicacion: 1, Demanda_Promedio_Semanal: 1 } })
      .toArray();

    // Mapa rapido Producto|Ubicacion -> promedio semanal
    const promMap = new Map();
    for (const p of promedios) {
      const key = `${p.Producto}|${p.Ubicacion}`;
      promMap.set(key, Number(p.Demanda_Promedio_Semanal) || 0);
    }

    // Cursor de histórico dentro del horizonte
    const cursor = historicoCol.find(
      { Fecha: { $gte: fechaIni, $lte: fechaFin } },
      { projection: { Producto: 1, Ubicacion: 1, Cantidad_Sem: 1 } }
    );

    let updCount = 0;
    while (await cursor.hasNext()) {
      const h = await cursor.next();
      const key = `${h.Producto}|${h.Ubicacion}`;
      const promedio = promMap.get(key) ?? 0;
      const qty = Number(h.Cantidad_Sem) || 0;
      const error = Math.pow(qty - promedio, 2);

      const res = await historicoCol.updateOne(
        { _id: h._id },
        { $set: { Error_Cuadrado_Cantidad: +error.toFixed(10) } }
      );
      if (res.modifiedCount) updCount++;
    }
    writeToLog(`\t   → Error_Cuadrado_Cantidad actualizado en ${updCount} registros`);

    // -----------------------------
    // 2) Agregar por SKU y escribir Variabilidad_Demanda_Cantidad en política (como PS05)
    // -----------------------------
    writeToLog(`\t[2/2] Calculando Variabilidad_Demanda_Cantidad y escribiendo en politica_inventarios_01_sem...`);

    // Sumatoria de errores por SKU dentro del horizonte
    const agg = await historicoCol
      .aggregate([
        { $match: { Fecha: { $gte: fechaIni, $lte: fechaFin } } },
        {
          $group: {
            _id: { Producto: "$Producto", Ubicacion: "$Ubicacion" },
            ErrorTotal: { $sum: { $ifNull: ["$Error_Cuadrado_Cantidad", 0] } },
          }
        }
      ])
      .toArray();

    let polUpd = 0;
    for (const g of agg) {
      const variab = (Number(g.ErrorTotal) || 0) / nSemanas;

      const res = await politicaCol.updateOne(
        { Producto: g._id.Producto, Ubicacion: g._id.Ubicacion },
        {
          $set: {
            Variabilidad_Demanda_Cantidad: +variab.toFixed(10),
            Error_Cuadrado_Total_Cantidad: +(Number(g.ErrorTotal) || 0).toFixed(10)
          }
        }
      );
      if (res.modifiedCount) polUpd++;
    }
    writeToLog(`\t   → Variabilidad/Errores actualizados en ${polUpd} SKU-ubicación`);

    writeToLog(`\tTermina Paso 04.1 - OK`);
  } catch (err) {
    writeToLog(`${moment().format("YYYY-MM-DD HH:mm:ss")} - [ERROR] ${err.message}`);
  } finally {
    await client.close();
  }
}

CalculaErrorCuadrado_y_Variabilidad();