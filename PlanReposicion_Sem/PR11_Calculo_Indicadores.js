const fs = require('fs');
const moment = require('moment');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parte = dbName.substring(dbName.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion_Sem.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

async function calcularIndicadores() {
  writeToLog(`\nPaso 11 - Cálculo de Indicadores Finales`);

  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const plan = db.collection('plan_reposicion_01_sem');
    const indicadores = db.collection('indicadores');

    const fecha = moment().format('YYYY-MM-DD HH:mm:ss');

    const [
      faltantes,
      arribaDeSS,
      excedentes,
      valorEstimadoPedido,
      skuActivos,
      clasifA,
      clasifB,
      clasifC,
      clasifD,
      totalSKUs
    ] = await Promise.all([
      plan.countDocuments({ Inventario_Disponible: 0, Requiere_Reposicion: "Si" }),
      plan.countDocuments({ Inventario_Disponible: { $gt: "$SS_Cantidad" }, Segmentacion_Producto: "CB" }),
      plan.countDocuments({ Inventario_Disponible: { $gt: "$META" }, Segmentacion_Producto: "CB" }),
      plan.aggregate([
        { $match: { Requiere_Reposicion: "Si" } },
        { $group: { _id: null, total: { $sum: "$Plan_Reposicion_Costo" } } }
      ]).toArray(),
      plan.countDocuments({ Segmentacion_Producto: { $in: ["CB", "BTO"] } }),
      plan.countDocuments({ Clasificacion: "A", Segmentacion_Producto: "CB" }),
      plan.countDocuments({ Clasificacion: "B", Segmentacion_Producto: "CB" }),
      plan.countDocuments({ Clasificacion: "C", Segmentacion_Producto: "CB" }),
      plan.countDocuments({ Clasificacion: "D", Segmentacion_Producto: "CB" }),
      plan.countDocuments({ Segmentacion_Producto: { $in: ["CB", "BTO"] } }),
    ]);

    const totalValor = valorEstimadoPedido.length > 0 ? valorEstimadoPedido[0].total : 0;

    const resultado = {
      fecha_ejecucion: fecha,
      faltantes,
      arriba_de_ss: arribaDeSS,
      excedentes,
      valor_estimado_pedido: totalValor,
      sku_activos_cb_bto: skuActivos,
      clasificacion_abcd: {
        A: clasifA,
        B: clasifB,
        C: clasifC,
        D: clasifD
      },
      numero_skus_cb_bto: totalSKUs
    };

    await indicadores.insertOne(resultado);
    writeToLog(`\tIndicadores insertados correctamente en la colección "indicadores"`);

  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) client.close();
  }
}

function writeToLog(msg) {
  fs.appendFileSync(logFile, msg + '\n');
}

calcularIndicadores().catch(console.error);
