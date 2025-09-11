const fs = require('fs');
const mongodb = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const MongoClient = mongodb.MongoClient;
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_sem.log`;

realizarAgregacion_Demanda_UOM();

async function realizarAgregacion_Demanda_UOM() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 04 - Calculo de la Demanda Costos por Semana`);

  const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

  const tablaOrigen = 'historico_demanda';

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(`${dbName}`);

    // 1) Horizonte
    const { fechaInicio, fechaFin } = await CalculaRangoFechas(dbName);
    const fechaInicioObj = new Date(fechaInicio);
    const fechaFinObj = new Date(fechaFin);

    // 2) ¿Hay docs en rango? (ya no cortamos si no hay; solo registramos)
    const documentosExistentes = await db.collection(tablaOrigen).countDocuments({
      Fecha: { $gte: fechaInicioObj, $lte: fechaFinObj }
    });
    if (documentosExistentes === 0) {
      writeToLog(`${now} - Aviso: No se encontraron documentos en el rango. Se continuará para ejecutar backfill por rango (Demanda_Costo = 0).`);
    }

    // 3) Agrupado en rango -> historico_agrupado_sem
    const pipelineAgrupado = [
      {
        $match: {
          Fecha: { $gte: fechaInicioObj, $lte: fechaFinObj }
        }
      },
      {
        $group: {
          _id: { Producto: "$Producto", Ubicacion: "$Ubicacion" },
          Cantidad: { $sum: "$Cantidad" },
          Productos: { $first: "$Producto" },
          Ubicaciones: { $first: "$Ubicacion" }
        }
      },
      { $out: "historico_agrupado_sem" }
    ];
    await db.collection(tablaOrigen).aggregate(pipelineAgrupado).toArray();

    // 4) Demanda_Costo con join a sku (solo lo que tuvo demanda en rango)
    const pipelineDemandaCalculada = [
      {
        $lookup: {
          from: "sku",
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
            { $project: { Costo_Unidad: 1 } }
          ],
          as: "skuData"
        }
      },
      { $unwind: "$skuData" }, // si no hay match en sku, se descarta
      {
        $addFields: {
          Demanda_Costo: { $multiply: ["$Cantidad", "$skuData.Costo_Unidad"] }
        }
      },
      {
        $project: {
          _id: 0,
          Producto: "$_id.Producto",
          Ubicacion: "$_id.Ubicacion",
          Demanda_Costo: 1
        }
      }
    ];

    const resultadoDemandaCalculada = await db.collection("historico_agrupado_sem").aggregate(pipelineDemandaCalculada).toArray();

    // Ordenar (solo estética)
    resultadoDemandaCalculada.sort((a, b) => {
      if (a.Ubicacion === b.Ubicacion) {
        return a.Demanda_Costo - b.Demanda_Costo;
      } else {
        return a.Ubicacion.localeCompare(b.Ubicacion);
      }
    });

    // 5) Insertar “en rango”
    const destino = db.collection("demanda_calculada_sem");
    if (resultadoDemandaCalculada.length > 0) {
      await destino.insertMany(resultadoDemandaCalculada);
    }

    // 6) BACKFILL POR RANGO:
    //    Agregar TODOS los SKUs de `sku` que NO aparecen en el agrupado-en-rango (historico_agrupado_sem),
    //    con Demanda_Costo = 0, para que no se “pierdan” en el pipeline.
    const skusFueraDeRango = await db.collection('sku').aggregate([
      {
        $lookup: {
          from: 'historico_agrupado_sem',
          let: { prod: '$Producto', ubi: '$Ubicacion' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id.Producto', '$$prod'] },
                    { $eq: ['$_id.Ubicacion', '$$ubi'] }
                  ]
                }
              }
            }
          ],
          as: 'inRange'
        }
      },
      // Mantén solo los que NO tienen registros en rango
      {
        $match: {
          $expr: { $eq: [{ $size: '$inRange' }, 0] }
        }
      },
      {
        $project: {
          _id: 0,
          Producto: 1,
          Ubicacion: 1,
          Demanda_Costo: { $literal: 0 }
        }
      }
    ]).toArray();

    if (skusFueraDeRango.length > 0) {
      await destino.insertMany(skusFueraDeRango);
    }

    writeToLog(`\tTermina el calculo de la Demanda en Costos por Semana`);
    writeToLog(`\tResumen: En-rango insertados = ${resultadoDemandaCalculada.length}; Fuera-de-rango (backfill) insertados = ${skusFueraDeRango.length}`);
  } catch (error) {
    writeToLog(`${now} - Error al realizar la operación de agregación: ${error}`);
  } finally {
    if (client) await client.close();
  }
}

async function CalculaRangoFechas(dbName) {
  const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const database = client.db(`${dbName}`);
    const tabla = database.collection('parametros_usuario');

    const res1 = await tabla.aggregate([
      { $match: { Tipo: "Horizontes", Num_Param: 1 } },
      { $project: { _id: 0, Horizonte_Historico_dias: '$Horizonte_Historico_dias' } }
    ]).toArray();

    const res2 = await tabla.aggregate([
      { $match: { Tipo: "Horizontes", Num_Param: 2 } },
      { $project: { _id: 0, Fecha_Fin_Horizonte: '$Fecha_Fin_Horizonte' } }
    ]).toArray();

    const diasAtras = Number(res1.map(r => r.Horizonte_Historico_dias).join(', '));
    const fechaFinTexto = res2.map(r => r.Fecha_Fin_Horizonte).join(', ');

    const fechaInicio = new Date(fechaFinTexto);
    const fechaFin = new Date(fechaFinTexto);
    fechaInicio.setDate(fechaInicio.getDate() - (diasAtras - 1));

    return { fechaInicio, fechaFin };
  } catch (error) {
    console.error('Error al consultar la tabla:', error);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

module.exports = { realizarAgregacion_Demanda_UOM };
