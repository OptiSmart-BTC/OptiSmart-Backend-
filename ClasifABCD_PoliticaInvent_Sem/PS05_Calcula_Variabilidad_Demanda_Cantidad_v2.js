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

const { FechaInicio, SemanaInicio, AñoInicio, FechaFin, SemanaFin, AñoFin, DiasAVG } = require(`../../${parametroFolder}/cfg/FechaParam`);

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const historicoDemandaCollection = 'historico_demanda_sem'; 
const demandaAbcd01Collection = 'politica_inventarios_01_sem'; 

async function calcularPromedioErrorCuadrado() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 05 - Calculo de la Variabilidad de la Demanda en Cantidad`);

  try {
    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });
    const db = client.db(dbName);

    // Obtener parámetros de fechas
    const resultado = await CalculaRangoFechas(dbName);
    const fechaInicioObj = new Date(resultado.fechaInicio);
    const fechaFinObj = new Date(resultado.fechaFin);
    const diasprom = new Number(resultado.diasprom);

    // Convertir parámetros de semana a números
    const yearStart = parseInt(AñoInicio, 10);
    const weekStart = parseInt(SemanaInicio, 10);
    const yearEnd = parseInt(AñoFin, 10);
    const weekEnd = parseInt(SemanaFin, 10);

    writeToLog(`\tParámetros de filtrado:`);
    writeToLog(`\t  Año: ${yearStart} a ${yearEnd}`);
    writeToLog(`\t  Semana: ${weekStart} a ${weekEnd}`);
    writeToLog(`\t  Días promedio: ${diasprom}`);
    writeToLog(`\t  Semanas calculadas: ${Math.ceil(diasprom / 7)}`);

    // Verificar que existan datos en la colección fuente
    const totalRegistros = await db.collection(historicoDemandaCollection).countDocuments();
    if (totalRegistros === 0) {
      writeToLog(`\tAdvertencia: No hay registros en ${historicoDemandaCollection}`);
      return;
    }

    writeToLog(`\tTotal de registros en ${historicoDemandaCollection}: ${totalRegistros}`);

    // Filtro mejorado para considerar cambio de año
    const filtroSemanas = {
      $match: {
        $or: [
          { Year: yearStart, Week: { $gte: weekStart } },  // Últimas semanas del año anterior
          { Year: yearEnd, Week: { $lte: weekEnd } }       // Primeras semanas del nuevo año
        ]
      }
    };

    // Agregación para calcular variabilidad por producto y ubicación
    const resultadosAgregados = await db.collection(historicoDemandaCollection).aggregate([
      filtroSemanas,
      {
        $group: {
          _id: {
            Producto: "$Producto",
            Ubicacion: "$Ubicacion"
          },
          Demanda_Cantidad: { $sum: "$Error_Cuadrado_Cantidad" }
        }
      },
      {
        $addFields: {
          Producto: "$_id.Producto",
          Ubicacion: "$_id.Ubicacion"
        }
      },
      {
        $project: {
          _id: 0,
          Producto: 1,
          Ubicacion: 1,
          Demanda_Cantidad: 1
        }
      }
    ]).toArray();

    writeToLog(`\tRegistros encontrados con filtro de semanas: ${resultadosAgregados.length}`);

    if (resultadosAgregados.length === 0) {
      writeToLog(`\tAdvertencia: No se encontraron datos con los filtros aplicados`);
      writeToLog(`\tVerifica que existan registros en el rango de semanas especificado`);
      return;
    }

    // Calcular variabilidad dividiendo por número de semanas
    const semanasCalculadas = Math.ceil(diasprom / 7);
    const resultadosDivididos = resultadosAgregados.map(resultado => {
      const variabilidad = resultado.Demanda_Cantidad / semanasCalculadas;
      
      return {
        Producto: resultado.Producto,
        Ubicacion: resultado.Ubicacion,
        Variabilidad_Demanda_Cantidad: variabilidad
      };
    });

    // Debug: mostrar algunos ejemplos
    if (resultadosDivididos.length > 0) {
      writeToLog(`\tEjemplo de cálculo - Primer registro:`);
      writeToLog(`\t  Producto: ${resultadosDivididos[0].Producto}`);
      writeToLog(`\t  Ubicación: ${resultadosDivididos[0].Ubicacion}`);
      writeToLog(`\t  Demanda_Cantidad: ${resultadosAgregados[0].Demanda_Cantidad}`);
      writeToLog(`\t  Variabilidad calculada: ${resultadosDivididos[0].Variabilidad_Demanda_Cantidad}`);
    }

    // Actualizar registros con variabilidad de demanda en cantidad
    const politicaCollection = db.collection(demandaAbcd01Collection);
    let registrosActualizadosVariabilidad = 0;
    
    for (const resultado of resultadosDivididos) {
      const updateResult = await politicaCollection.updateOne(
        { 
          Producto: resultado.Producto, 
          Ubicacion: resultado.Ubicacion 
        },
        { 
          $set: { 
            Variabilidad_Demanda_Cantidad: resultado.Variabilidad_Demanda_Cantidad 
          } 
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        registrosActualizadosVariabilidad++;
      }
    }

    writeToLog(`\tRegistros actualizados con Variabilidad_Demanda_Cantidad: ${registrosActualizadosVariabilidad}`);

    // Calcular DS_Demanda (desviación estándar) como raíz cuadrada de la variabilidad
    writeToLog(`\tCalculando DS_Demanda (desviación estándar)...`);
    
    const registrosParaDS = await politicaCollection.find({
      Variabilidad_Demanda_Cantidad: { $exists: true, $ne: null }
    }).toArray();

    writeToLog(`\tRegistros con variabilidad para calcular DS: ${registrosParaDS.length}`);

    let registrosActualizadosDS = 0;
    const updatePromises = registrosParaDS.map(async (registro) => {
      const variabilidadDemandaCantidad = registro.Variabilidad_Demanda_Cantidad || 0;
      const dsDemanda = Math.sqrt(Math.abs(variabilidadDemandaCantidad)); // Usar valor absoluto para evitar NaN

      const updateResult = await politicaCollection.updateOne(
        { _id: registro._id },
        { $set: { DS_Demanda: dsDemanda } }
      );

      if (updateResult.modifiedCount > 0) {
        registrosActualizadosDS++;
      }
    });

    await Promise.all(updatePromises);
    writeToLog(`\tRegistros actualizados con DS_Demanda: ${registrosActualizadosDS}`);

    writeToLog(`\tTermina el Calculo de la Variabilidad de la Demanda en Cantidad`);
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