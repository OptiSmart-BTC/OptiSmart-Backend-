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

async function calcularDiasCobertura() {
  writeToLog(
    `\nPaso 17 - Transforamación de datos de salida a días de cobertura`
  );

  try {
    const client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const inventarios01Collection = db.collection(collectionName);
    const inventarios01 = await inventarios01Collection
      .find()
      .sort({ Ubicacion: 1, Producto: 1 })
      .toArray();

    const diasCobertura = inventarios01.map((inventario) => ({
      Tipo_Calendario: "Dia",
      SKU: inventario.SKU,
      Producto: inventario.Producto,
      Desc_Producto: inventario.Desc_Producto,
      Familia_Producto: inventario.Familia_Producto,
      Categoria: inventario.Categoria,
      Segmentacion_Producto: inventario.Segmentacion_Producto,
      Presentacion: inventario.Presentacion,
      Ubicacion: inventario.Ubicacion,
      Desc_Ubicacion: inventario.Desc_Ubicacion,
      SS:
        inventario.Demanda_Promedio_Diaria === 0
          ? -1
          : Math.ceil(
              inventario.SS_Cantidad / inventario.Demanda_Promedio_Diaria
            ),
      Demanda_LT:
        inventario.Demanda_Promedio_Diaria === 0
          ? -1
          : Math.ceil(
              inventario.Demanda_LT / inventario.Demanda_Promedio_Diaria
            ),
      MOQ:
        inventario.Demanda_Promedio_Diaria === 0
          ? -1
          : Math.ceil(inventario.MOQ / inventario.Demanda_Promedio_Diaria),
      ROQ:
        inventario.Demanda_Promedio_Diaria === 0
          ? -1
          : Math.ceil(inventario.ROQ / inventario.Demanda_Promedio_Diaria),
      ROP:
        inventario.Demanda_Promedio_Diaria === 0
          ? -1
          : Math.ceil(inventario.ROP / inventario.Demanda_Promedio_Diaria),
      META:
        inventario.Demanda_Promedio_Diaria === 0
          ? -1
          : Math.ceil(inventario.META / inventario.Demanda_Promedio_Diaria),
      Inventario_Promedio:
        inventario.Demanda_Promedio_Diaria === 0
          ? -1
          : Math.ceil(
              inventario.Inventario_Promedio /
                inventario.Demanda_Promedio_Diaria
            ),
      Vida_Util_Dias: 0,
      Tolerancia_Vida_Util_Dias: 0,
      ROP_Alto: " ",
      SobreInventario_Dias: 0,
    }));

    const targetCollectionName = collectionName.includes("montecarlo")
      ? "ui_pol_inv_dias_cobertura_montecarlo"
      : "ui_pol_inv_dias_cobertura";
    const diasCoberturaCollection = db.collection(targetCollectionName);

    await diasCoberturaCollection.insertMany(diasCobertura);

    console.log(
      "Los datos de días de cobertura se han calculado y guardado correctamente."
    );
    writeToLog(
      `\tTermina la Transforamación de datos de salida a días de cobertura`
    );
    client.close();
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

calcularDiasCobertura();
