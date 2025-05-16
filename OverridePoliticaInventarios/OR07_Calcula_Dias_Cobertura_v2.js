const fs = require('fs'); 
const MongoClient = require('mongodb').MongoClient;
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/Override_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

// Función principal para calcular días de cobertura
async function calcularDiasCobertura() {
  writeToLog(`\nPaso 07 - Transformación de datos de salida a días de cobertura`);

  try {
    const client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const finalCollection = db.collection('ui_pol_inv_dias_cobertura');
    await finalCollection.deleteMany({});

    const inventarios01Collection = db.collection('politica_inventarios_01');
    const inventarios01 = await inventarios01Collection.find().sort({ "Ubicacion": 1, "Producto": 1 }).toArray();

    // Calcular los valores y crear los documentos para la colección política_inventarios_dias_cobertura
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
      SS: inventario.Demanda_Promedio_Diaria === 0 ? -1 : Math.ceil((inventario.Override_SS_Cantidad || inventario.SS_Cantidad) / inventario.Demanda_Promedio_Diaria),
      Demanda_LT: inventario.Demanda_Promedio_Diaria === 0 ? -1 : Math.ceil(inventario.Demanda_LT / inventario.Demanda_Promedio_Diaria),
      MOQ: inventario.Demanda_Promedio_Diaria === 0 ? -1 : Math.ceil(inventario.MOQ / inventario.Demanda_Promedio_Diaria),
      ROQ: inventario.Demanda_Promedio_Diaria === 0 ? -1 : Math.ceil(inventario.ROQ / inventario.Demanda_Promedio_Diaria),
      ROP: inventario.Demanda_Promedio_Diaria === 0 ? -1 : Math.ceil((inventario.Override_ROP || inventario.ROP) / inventario.Demanda_Promedio_Diaria),
      META: inventario.Demanda_Promedio_Diaria === 0 ? -1 : Math.ceil(inventario.META / inventario.Demanda_Promedio_Diaria),
      Inventario_Promedio: inventario.Demanda_Promedio_Diaria === 0 ? -1 : Math.ceil(inventario.Inventario_Promedio / inventario.Demanda_Promedio_Diaria),
      Vida_Util_Dias: 0,
      Tolerancia_Vida_Util_Dias: 0,
      ROP_Alto: " ",
      SobreInventario_Dias: 0
    }));

    await finalCollection.insertMany(diasCobertura);

    writeToLog(`\tTermina la Transformación de datos de salida a días de cobertura`);
    client.close();
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
    client.close();
  } 
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Ejecutar la función principal
calcularDiasCobertura();
