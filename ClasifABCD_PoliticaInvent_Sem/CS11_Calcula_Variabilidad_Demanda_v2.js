const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const historicoDemandaCollection = 'historico_demanda_sem'; 
const demandaAbcd01Collection = 'demanda_abcd_01_sem'; 

async function calcularPromedioErrorCuadrado() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 11 - Calculo de la Variabilidad de la Demanda por Semana`);

  try {
    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });
    const db = client.db(dbName);

    // Obtener rango de fechas y días promedio
    const resultado = await CalculaRangoFechas(dbName);
    const fechaInicioObj = new Date(resultado.fechaInicio);
    const fechaFinObj = new Date(resultado.fechaFin);
    const diasprom = new Number(resultado.diasprom);

    writeToLog(`\tRango de fechas: ${fechaInicioObj.toISOString().split('T')[0]} a ${fechaFinObj.toISOString().split('T')[0]}`);
    writeToLog(`\tDías promedio: ${diasprom}`);

    // Verificar que existan datos en la colección fuente
    const totalRegistros = await db.collection(historicoDemandaCollection).countDocuments();
    if (totalRegistros === 0) {
      writeToLog(`\tAdvertencia: No hay registros en ${historicoDemandaCollection}`);
      return;
    }

    writeToLog(`\tTotal de registros en ${historicoDemandaCollection}: ${totalRegistros}`);

    // Agregación para calcular la suma del error cuadrado por producto y ubicación
    const resultadosAgregados = await db.collection(historicoDemandaCollection).aggregate([
      // Opcional: filtrar por rango de fechas si es necesario
      /*{
        $match: {
          Fecha: {
            $gte: fechaInicioObj,
            $lte: fechaFinObj
          }
        }
      },*/
      {
        $group: {
          _id: {
            Producto: "$Producto", 
            Ubicacion: "$Ubicacion"
          },
          Demanda_Costo: { $sum: "$Error_Cuadrado_Sem" }
        }
      }, 
      {
        $addFields: {
          Producto: "$_id.Producto",
          Ubicacion: "$_id.Ubicacion"
        }
      }
    ]).toArray();

    writeToLog(`\tRegistros agrupados: ${resultadosAgregados.length}`);

    if (resultadosAgregados.length === 0) {
      writeToLog(`\tNo se encontraron datos para procesar`);
      return;
    }

    // Calcular la variabilidad dividiendo por el número de semanas
    const semanasPromedio = Math.ceil(diasprom / 7);
    writeToLog(`\tSemanas promedio calculadas: ${semanasPromedio}`);

    const resultadosDivididos = resultadosAgregados.map(resultado => ({
      Producto: resultado.Producto,
      Ubicacion: resultado.Ubicacion,
      Variabilidad_Demanda: resultado.Demanda_Costo / semanasPromedio,
    }));

    // Debug: mostrar algunos resultados
    if (resultadosDivididos.length > 0) {
      writeToLog(`\tEjemplo de cálculo - Primer registro:`);
      writeToLog(`\t  Producto: ${resultadosDivididos[0].Producto}`);
      writeToLog(`\t  Ubicación: ${resultadosDivididos[0].Ubicacion}`);
      writeToLog(`\t  Variabilidad: ${resultadosDivididos[0].Variabilidad_Demanda}`);
    }

    const demandaAbcd01Coll = db.collection(demandaAbcd01Collection); 

    // Actualizar registros existentes con la variabilidad calculada
    let registrosActualizados = 0;
    for (const resultado of resultadosDivididos) {
      const updateResult = await demandaAbcd01Coll.updateOne(
        { 
          Producto: resultado.Producto, 
          Ubicacion: resultado.Ubicacion 
        },
        { 
          $set: { 
            Variabilidad_Demanda: resultado.Variabilidad_Demanda 
          } 
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        registrosActualizados++;
      }
    }

    writeToLog(`\tRegistros actualizados con variabilidad: ${registrosActualizados}`);

    // Crear identificadores para comparación
    const productosUbicaciones = resultadosDivididos.map(resultado => 
      `${resultado.Producto}@${resultado.Ubicacion}`
    );

    // Buscar SKUs que no fueron encontrados en los cálculos y establecer variabilidad = 0
    const skusNoEncontrados = await demandaAbcd01Coll.find({
      $expr: {
        $not: {
          $in: [
            { $concat: ["$Producto", "@", "$Ubicacion"] },
            productosUbicaciones
          ]
        }
      }
    }).toArray();

    writeToLog(`\tSKUs sin datos de variabilidad: ${skusNoEncontrados.length}`);

    let registrosSinVariabilidad = 0;
    for (const resultado2 of skusNoEncontrados) {
      const updateResult = await demandaAbcd01Coll.updateOne(
        { 
          Producto: resultado2.Producto, 
          Ubicacion: resultado2.Ubicacion 
        },
        { 
          $set: { 
            Variabilidad_Demanda: 0 
          } 
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        registrosSinVariabilidad++;
      }
    }

    writeToLog(`\tRegistros establecidos con variabilidad = 0: ${registrosSinVariabilidad}`);
    writeToLog(`\tTermina el Calculo de la Variabilidad de la Demanda por Semana`);
    
    client.close();
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
    console.error('Error en calcularPromedioErrorCuadrado:', error);
  }
}

async function CalculaRangoFechas(dbName) {
  const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const database = client.db(dbName);
    const tabla = database.collection('parametros_usuario');

    // Obtener horizonte histórico en días
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
    if (resultados.length === 0) {
      throw new Error('No se encontró el parámetro Horizonte_Historico_dias');
    }
    
    const diasAtras = resultados[0].Horizonte_Historico_dias;

    // Obtener fecha fin del horizonte
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
    if (resultados2.length === 0) {
      throw new Error('No se encontró el parámetro Fecha_Fin_Horizonte');
    }
    
    const FechaFinHorizonte = resultados2[0].Fecha_Fin_Horizonte;

    // Calcular fechas
    const fechaInicio = new Date(FechaFinHorizonte);
    const fechaFin = new Date(FechaFinHorizonte);
    const diasprom = new Number(diasAtras);

    fechaInicio.setDate(fechaInicio.getDate() - (diasAtras - 1));

    return { fechaInicio, fechaFin, diasprom };
  } catch (error) {
    console.error('Error al consultar la tabla:', error);
    throw error;
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  fs.appendFileSync(logFile, `${timestamp} - ${message}\n`);
}

// Ejecutar la función principal
calcularPromedioErrorCuadrado();