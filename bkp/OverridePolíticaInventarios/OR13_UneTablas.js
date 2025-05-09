const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');
 
  // Configuración de conexión a la base de datos MongoDB
  //const uri = 'mongodb://127.0.0.1:27017'; // Cambia esto si tu MongoDB se encuentra en un servidor diferente
  //const dbName = 'btc_opti_a001';

const { host, puerto } = require('../Configuraciones/ConexionDB');

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


async function crearTablaPoliticaInventarios() {
  writeToLog(`\nPaso 13 - Union de Tablas`);
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();

    const db = client.db(dbName);
    const Collection1 = db.collection('ui_politica_inventarios');
    const Collection2 = db.collection('ui_all_pol_inv');
    await Collection2.deleteMany({});
    const datosDemanda = await Collection1.find().toArray();
    const politicaInventarios = datosDemanda.map((dato) => {
      return {
        Tipo_Calendario: dato.Tipo_Calendario,
        SKU: dato.SKU,
        Producto: dato.Producto,
        Desc_Producto: dato.Desc_Producto,
        Familia_Producto: dato.Familia_Producto,
        Categoria: dato.Categoria,
        Segmentacion_Producto: dato.Segmentacion_Producto,
        Presentacion: dato.Presentacion,
        Ubicacion: dato.Ubicacion,
        Desc_Ubicacion: dato.Desc_Ubicacion,
        Clasificacion: dato.Clasificacion,
        Nivel_Servicio: dato.Nivel_Servicio,
        Valor_Z: dato.Valor_Z,
        UOM: dato.UOM,
        UOM_Base: dato.UOM_Base,
        Unidades_Empaque: dato.Unidades_Empaque,
        Demanda_Promedio_Diaria: dato.Demanda_Promedio_Diaria,
        Lead_Time_Abasto: dato.Lead_Time_Abasto,
        Variabilidad_Demanda_Cantidad: dato.Variabilidad_Demanda_Cantidad,
        DS_Demanda: dato.DS_Demanda,
        Fill_Rate: dato.Fill_Rate,
        Frecuencia_Revision_dias: dato.Frecuencia_Revision_dias,
        Prom_LT: dato.Prom_LT,
        DS_LT: dato.DS_LT,
        Override_SI_NO: dato.Override_SI_NO,
        Override_Politica_Inventarios: dato.Override_Politica_Inventarios,
        SS_Cantidad: dato.SS_Cantidad,
        Demanda_LT: dato.Demanda_LT,
        MOQ: dato.MOQ,
        ROQ: dato.ROQ,
        ROP: dato.ROP,
        META: dato.META,
        Inventario_Promedio: dato.Inventario_Promedio,
        Medida_Override: dato.Medida_Override,
        Tipo_Override: dato.Tipo_Override,
        STAT_SS: dato.STAT_SS,
        DC_SS: 0,
        DC_Demanda_LT: 0,
        DC_MOQ: 0,
        DC_ROQ: 0,
        DC_ROP: 0,
        DC_META: 0,
        DC_Inventario_Promedio: 0,
        DC_Vida_Util_Dias: 0,
        DC_Tolerancia_Vida_Util_Dias: 0,
        DC_ROP_Alto: 0,
        DC_SobreInventario_Dias: 0,
        P_SS: 0,
        P_Demanda_LT: 0,
        P_MOQ: 0,
        P_ROQ: 0,
        P_ROP: 0,
        P_META: 0,
        P_Inventario_Promedio: 0,
        C_SS: 0,
        C_Demanda_LT: 0,
        C_MOQ: 0,
        C_ROQ: 0,
        C_ROP: 0,
        C_META: 0,
        C_Inventario_Promedio: 0,
        U_SS: 0,
        U_Demanda_LT: 0,
        U_MOQ: 0,
        U_ROQ: 0,
        U_ROP: 0,
        U_META: 0,
        U_Inventario_Promedio: 0
      };
    });

    await Collection2.insertMany(politicaInventarios);
//---------------------------------------------------------

  const collection1 = 'ui_all_pol_inv';
  const collection2 = 'ui_pol_inv_dias_cobertura';
  const col1 = db.collection(collection1);
  const col2 = db.collection(collection2);

  const result = await col1.aggregate([
    {
      $lookup: {
        from: collection2,
        localField: 'SKU',
        foreignField: 'SKU',
        as: 'joinedData'
      }
    },
    {
      $unwind: '$joinedData'
    },
    {
      $set: {
        'SS': '$joinedData.SS',
        'Demanda_LT': '$joinedData.Demanda_LT',
        'MOQ': '$joinedData.MOQ',
        'ROQ': '$joinedData.ROQ',
        'ROP': '$joinedData.ROP',
        'META': '$joinedData.META',
        'Inventario_Promedio': '$joinedData.Inventario_Promedio',
        'Vida_Util_Dias': '$joinedData.Vida_Util_Dias',
        'Tolerancia_Vida_Util_Dias': '$joinedData.Tolerancia_Vida_Util_Dias',
        'ROP_Alto': '$joinedData.ROP_Alto',
        'SobreInventario_Dias': '$joinedData.SobreInventario_Dias'
        }
    }
  ]).toArray();
 

  for (const doc of result) {
  
    await col1.updateOne(
      { _id: doc._id },
      {
        $set: {
          DC_SS:  doc.SS,
          DC_Demanda_LT:  doc.Demanda_LT,
          DC_MOQ:  doc.MOQ,
          DC_ROQ:  doc.ROQ,
          DC_ROP:  doc.ROP,
          DC_META:  doc.META,
          DC_Inventario_Promedio:  doc.Inventario_Promedio,
          DC_Vida_Util_Dias:  doc.Vida_Util_Dias,
          DC_Tolerancia_Vida_Util_Dias:  doc.Tolerancia_Vida_Util_Dias,
          DC_ROP_Alto:  doc.ROP_Alto,
          DC_SobreInventario_Dias:  doc.SobreInventario_Dias
        }
      }
    );
  }
  



  //---------------------------------------------------------

  const collection3 = 'ui_all_pol_inv';
  const collection4 = 'ui_pol_inv_pallets';
  const col3 = db.collection(collection3);
  const col4 = db.collection(collection4);

  const result1 = await col3.aggregate([
    {
      $lookup: {
        from: collection4,
        localField: 'SKU',
        foreignField: 'SKU',
        as: 'joinedData'
      }
    },
    {
      $unwind: '$joinedData'
    },
    {
      $set: {
        'SS': '$joinedData.SS',
        'Demanda_LT': '$joinedData.Demanda_LT',
        'MOQ': '$joinedData.MOQ',
        'ROQ': '$joinedData.ROQ',
        'ROP': '$joinedData.ROP',
        'META': '$joinedData.META',
        'Inventario_Promedio': '$joinedData.Inventario_Promedio',
        }
    }
  ]).toArray();
 

  for (const doc of result1) {
  
    await col3.updateOne(
      { _id: doc._id },
      {
        $set: {
          P_SS:  doc.SS,
          P_Demanda_LT:  doc.Demanda_LT,
          P_MOQ:  doc.MOQ,
          P_ROQ:  doc.ROQ,
          P_ROP:  doc.ROP,
          P_META:  doc.META,
          P_Inventario_Promedio:  doc.Inventario_Promedio
        }
      }
    );
  }
  



    //---------------------------------------------------------

    const collection5 = 'ui_all_pol_inv';
    const collection6 = 'ui_pol_inv_costo';
    const col5 = db.collection(collection5);
    const col6 = db.collection(collection6);
  
    const result2 = await col5.aggregate([
      {
        $lookup: {
          from: collection6,
          localField: 'SKU',
          foreignField: 'SKU',
          as: 'joinedData'
        }
      },
      {
        $unwind: '$joinedData'
      },
      {
        $set: {
          'SS': '$joinedData.SS',
          'Demanda_LT': '$joinedData.Demanda_LT',
          'MOQ': '$joinedData.MOQ',
          'ROQ': '$joinedData.ROQ',
          'ROP': '$joinedData.ROP',
          'META': '$joinedData.META',
          'Inventario_Promedio': '$joinedData.Inventario_Promedio',
          }
      }
    ]).toArray();
   
  
    for (const doc of result2) {
    
      await col5.updateOne(
        { _id: doc._id },
        {
          $set: {
            C_SS:  doc.SS,
            C_Demanda_LT:  doc.Demanda_LT,
            C_MOQ:  doc.MOQ,
            C_ROQ:  doc.ROQ,
            C_ROP:  doc.ROP,
            C_META:  doc.META,
            C_Inventario_Promedio:  doc.Inventario_Promedio
          }
        }
      );
    }
    
  

//---------------------------------------------------------

const collection7 = 'ui_all_pol_inv';
const collection8 = 'ui_pol_inv_uom';
const col7 = db.collection(collection7);
const col8 = db.collection(collection8);

const result3 = await col7.aggregate([
  {
    $lookup: {
      from: collection8,
      localField: 'SKU',
      foreignField: 'SKU',
      as: 'joinedData'
    }
  },
  {
    $unwind: '$joinedData'
  },
  {
    $set: {
      'SS': '$joinedData.SS',
      'Demanda_LT': '$joinedData.Demanda_LT',
      'MOQ': '$joinedData.MOQ',
      'ROQ': '$joinedData.ROQ',
      'ROP': '$joinedData.ROP',
      'META': '$joinedData.META',
      'Inventario_Promedio': '$joinedData.Inventario_Promedio',
      }
  }
]).toArray();


for (const doc of result3) {

  await col7.updateOne(
    { _id: doc._id },
    {
      $set: {
        U_SS:  doc.SS,
        U_Demanda_LT:  doc.Demanda_LT,
        U_MOQ:  doc.MOQ,
        U_ROQ:  doc.ROQ,
        U_ROP:  doc.ROP,
        U_META:  doc.META,
        U_Inventario_Promedio:  doc.Inventario_Promedio
      }
    }
  );
}




    writeToLog(`\tTermina la Union de la Tablas de Politicas de Inventario`);
  } catch (err) {
    writeToLog(`${now} - Error al crear la tabla: ${err}`);
  } finally {
    client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

crearTablaPoliticaInventarios();
