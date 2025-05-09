const fs = require('fs'); 
const MongoClient = require('mongodb').MongoClient;
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto} = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

//const uri = `mongodb://${host}:${puerto}/${dbName}`;
//const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);


const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/Override_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

// Configurar la conexión a MongoDB
//const uri = 'mongodb://127.0.0.1:27017'; // Cambia esta URL si tu servidor MongoDB está en otro lugar
//const dbName = 'btc_opti_a001';

async function calcularCosto() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 10 - Transforamación de datos de salida a Costo`);

  try {
    // Conectar a la base de datos
    const client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const finalCollection = db.collection('politica_inventarios_costo');
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

    // Calcular los valores y crear los documentos para la colección política_inventarios_Costo
    const Costo = joinResult.map((inventario) => {
      const costounidad = inventario.skuData.Costo_Unidad;
      return {
        Tipo_Calendario:"Dia",
        SKU: inventario.SKU,
        Producto: inventario.Producto,
        Desc_Producto: inventario.Desc_Producto,
        Familia_Producto: inventario.Familia_Producto,
        Categoria: inventario.Categoria,
        Segmentacion_Producto: inventario.Segmentacion_Producto,
        Presentacion: inventario.Presentacion,
        Ubicacion: inventario.Ubicacion,
        Desc_Ubicacion: inventario.Desc_Ubicacion,
        SS: inventario.SS_Cantidad * costounidad,
        Demanda_LT: inventario.Demanda_LT * costounidad,
        MOQ: inventario.MOQ * costounidad,
        ROQ: inventario.ROQ * costounidad,
        ROP: inventario.ROP * costounidad,
        META: inventario.META * costounidad,
        Inventario_Promedio: inventario.Inventario_Promedio * costounidad
      };
    });

    // Insertar los documentos en la colección política_inventarios_Costo
    const CostoCollection = db.collection('politica_inventarios_costo');
    await CostoCollection.insertMany(Costo);

    //console.log('Los datos de Costo se han calculado y guardado correctamente.');

    //writeToLog(`${now} - Ejecucion exitosa`);
    writeToLog(`\tTermina la Transforamación de datos de salida a Costo`);
    client.close();
  } catch (error) {
    //console.error('Ocurrió un error:', error);
    writeToLog(`${now} - [ERROR] ${error.message}`);
    client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Ejecutar la función principal
calcularCosto();
