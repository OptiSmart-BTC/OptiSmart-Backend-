const fs = require('fs'); 
const MongoClient = require('mongodb').MongoClient;
const conex= require('../../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto} = require('../../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

//const uri = `mongodb://${host}:${puerto}/${dbName}`;
//const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);


const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

// Configurar la conexión a MongoDB
//const uri = 'mongodb://127.0.0.1:27017'; // Cambia esta URL si tu servidor MongoDB está en otro lugar
//const dbName = 'btc_opti_a001';

async function calcularUOM() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 11 - Transforamación de datos de salida a UOM`);

  try {
    // Conectar a la base de datos
    const client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);


    const finalCollection = db.collection('ui_pol_inv_uom');
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
    const uomdata = joinResult.map((inventario) => {
      const unidadesempaque = inventario.skuData.Unidades_Empaque;
      return {
        Tipo_Calendario:"Dia",
        UOM: inventario.skuData.Unidad_Medida_UOM,
        SKU: inventario.SKU,
        Producto: inventario.Producto,
        Desc_Producto: inventario.Desc_Producto,
        Familia_Producto: inventario.Familia_Producto,
        Categoria: inventario.Categoria,
        Segmentacion_Producto: inventario.Segmentacion_Producto,
        Presentacion: inventario.Presentacion,
        Ubicacion: inventario.Ubicacion,
        Desc_Ubicacion: inventario.Desc_Ubicacion,
        SS: (inventario.SS_Cantidad * unidadesempaque),
        Demanda_LT: (inventario.Demanda_LT * unidadesempaque),
        MOQ: (inventario.MOQ * unidadesempaque),
        ROQ: (inventario.ROQ * unidadesempaque),
        ROP: (inventario.ROP * unidadesempaque),
        META: (inventario.META * unidadesempaque),
        Inventario_Promedio: (inventario.Inventario_Promedio * unidadesempaque)
      };
    });


    const uomCollection = db.collection('ui_pol_inv_uom');
    await uomCollection.insertMany(uomdata);

    //console.log('Los datos de pallets se han calculado y guardado correctamente.');

    //writeToLog(`${now} - Ejecucion exitosa`);
    writeToLog(`\tTermina la Transforamación de datos de salida a UOM`);
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
calcularUOM();
