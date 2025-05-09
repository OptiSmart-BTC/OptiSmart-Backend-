const fs = require('fs');
const mongodb = require('mongodb');
const conex= require('../../Configuraciones/ConStrDB');
const MongoClient = mongodb.MongoClient;
const moment = require('moment');

const { host, puerto } = require('../../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_sem.log`; // Cambia esta ruta según la ubicación de tu archivo CSV

realizarAgregacion_Demanda_UOM();

async function realizarAgregacion_Demanda_UOM() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 04 - Calculo de la Demanda Costos por Semana`);


  //const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

  const tablaOrigen = 'historico_demanda'; // Nombre de la tabla de origen
  //const campoAgrupamiento1 = 'Producto'; // Campo utilizado para el agrupamiento
  //const campoAgrupamiento2 = 'Ubicacion'; // Campo utilizado para el agrupamiento
  //const campoSuma = 'CantidadFacturada'; // Campo numérico que se sumará
  //const tablaDestino = 'demanda_calculada'; // Nombre de la tabla de destino para insertar los resultados

  let client;
 
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(`${dbName}`);

    const resultado = await CalculaRangoFechas(dbName);
    const fechaInicioObj = new Date(resultado.fechaInicio);
    const fechaFinObj = new Date(resultado.fechaFin);





    
    const documentosExistentes = await db.collection(tablaOrigen).countDocuments({
      Fecha: {
        $gte: fechaInicioObj,
        $lte: fechaFinObj
      }
    });

    if (documentosExistentes === 0) {
      writeToLog(`${now} - No se encontraron documentos que coincidan con el filtro de fecha.`);
      return;
    }


    
    const pipelineAgrupado = [
       {
         $match: {
           Fecha: {
             $gte: fechaInicioObj,
             $lte: fechaFinObj
           }
         }
       },
       {
         $group: {
           _id: {
             Producto: "$Producto",
             Ubicacion: "$Ubicacion",
           },
           Cantidad: { $sum: "$Cantidad" },
           Productos: { $first: "$Producto" },
           Ubicaciones: { $first: "$Ubicacion" },
         },
       },
       {
         $out: "historico_agrupado_sem", // Nombre de la colección para el resultado agrupado
       },
     ];
     
     await db.collection("historico_demanda").aggregate(pipelineAgrupado).toArray();
     //console.log("Agrupación completada. Resultado guardado en la colección 'historico_agrupado'");
     
     const pipelineDemandaCalculada = [
       {
         $lookup: {
           from: "sku", // Nombre de la colección SKU
           let: { producto: "$_id.Producto", ubicacion: "$_id.Ubicacion" },
           pipeline: [
             {
               $match: {
                 $expr: {
                   $and: [
                     { $eq: ["$Producto", "$$producto"] },
                     { $eq: ["$Ubicacion", "$$ubicacion"] }
                   ]
                 }
               }
             },
             {
               $project: {
                 Costo_Unidad: 1
               }
             }
           ],
           as: "skuData"
         },
       },
       {
         $unwind: "$skuData",
       },
       {
         $addFields: {
           Demanda_Costo: { $multiply: ["$Cantidad", "$skuData.Costo_Unidad"] },
         },
       },
       {
         $project: {
           _id: 0,
           Producto: "$_id.Producto",
           Ubicacion: "$_id.Ubicacion",
           Demanda_Costo: 1,
         },
       },
     ];
     
     const resultadoDemandaCalculada = await db.collection("historico_agrupado_sem").aggregate(pipelineDemandaCalculada).toArray();
     
     // Ordenar resultados
     resultadoDemandaCalculada.sort((a, b) => {
       if (a.Ubicacion === b.Ubicacion) {
         return a.Demanda_Costo - b.Demanda_Costo;
       } else {
         return a.Ubicacion.localeCompare(b.Ubicacion);
       }
     });
     
     // Insertar los resultados en la colección "demanda_calculada"
     await db.collection("demanda_calculada_sem").insertMany(resultadoDemandaCalculada);
     

   
    writeToLog(`\tTermina el calculo de la Demanda en Costos por Semana`);
  } catch (error) {
    writeToLog(`${now} - Error al realizar la operación de agregación: ${error}`);
  } finally {
    if (client) {
      client.close();
    }
  }
}

async function CalculaRangoFechas(dbName) {
  //const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const database = client.db(`${dbName}`);
    const tabla = database.collection('parametros_usuario');

    const pipeline = [
      {
        $match: {
          Tipo: "Horizontes",
          Num_Param: 1
        }
      },
      {
        $project: {
          _id: 0,
          Horizonte_Historico_dias: '$Horizonte_Historico_dias'
        }
      }
    ];

    const resultados = await tabla.aggregate(pipeline).toArray();
    const valores = resultados.map(resultado => resultado.Horizonte_Historico_dias);
    const diasAtras = valores.join(', ');

    const pipeline2 = [
      {
        $match: {
          Tipo: "Horizontes",
          Num_Param: 2
        }
      },
      {
        $project: {
          _id: 0,
          Fecha_Fin_Horizonte: '$Fecha_Fin_Horizonte'
        }
      }
    ];

    const resultados2 = await tabla.aggregate(pipeline2).toArray();
    const valores2 = resultados2.map(resultado2 => resultado2.Fecha_Fin_Horizonte);
    const FechaFinHorizonte = valores2.join(', ');

    const fechaInicio = new Date(FechaFinHorizonte);
    const fechaFin = new Date(FechaFinHorizonte);

    fechaInicio.setDate(fechaInicio.getDate() - (diasAtras - 1));

    return { fechaInicio, fechaFin };
  } catch (error) {
    console.error('Error al consultar la tabla:', error);
  } finally {
    client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

module.exports = {
  realizarAgregacion_Demanda_UOM
};
