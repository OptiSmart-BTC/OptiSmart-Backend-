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

// Función principal para calcular pallets
async function calcularPallets() {
  writeToLog(`\nPaso 09 - Transformación de datos de salida a pallets`);

  try {
    // Conectar a la base de datos
    const client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const finalCollection = db.collection('ui_pol_inv_pallets');
    await finalCollection.deleteMany({});

    const inventarios01Collection = db.collection('politica_inventarios_01');
    const skuCollection = db.collection('sku');
    
    // Realizar join entre política_inventarios_01 y sku utilizando el campo SKU
    const joinResult = await inventarios01Collection.aggregate([
      {
        $lookup: {
          from: 'sku',
          localField: 'SKU',
          foreignField: 'SKU',
          as: 'skuData'
        }
      },
      {
        $unwind: "$skuData"
      },
      {
        $sort: { "Ubicacion": 1, "Producto": 1 }
      }
    ]).toArray();

    // Calcular los valores y crear los documentos para la colección política_inventarios_pallets
    const pallets = joinResult.map((inventario) => {
      const unidadesPallet = inventario.skuData.Unidades_Pallet;

      // Validar Override_ROP y Override_SS_Cantidad
      const SS_Utilizado = inventario.Override_SS_Cantidad || inventario.SS_Cantidad;
      const ROP_Utilizado = inventario.Override_ROP || inventario.ROP;

      return {
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
        SS: Math.ceil(SS_Utilizado / unidadesPallet),
        Demanda_LT: Math.ceil(inventario.Demanda_LT / unidadesPallet),
        MOQ: Math.ceil(inventario.MOQ / unidadesPallet),
        ROQ: Math.ceil(inventario.ROQ / unidadesPallet),
        ROP: Math.ceil(ROP_Utilizado / unidadesPallet),
        META: Math.ceil(inventario.META / unidadesPallet),
        Inventario_Promedio: Math.ceil(inventario.Inventario_Promedio / unidadesPallet)
      };
    });

    // Insertar los documentos en la colección política_inventarios_pallets
    const palletsCollection = db.collection('ui_pol_inv_pallets');
    await palletsCollection.insertMany(pallets);

    writeToLog(`\tTermina la Transformación de datos de salida a pallets`);
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
calcularPallets();
