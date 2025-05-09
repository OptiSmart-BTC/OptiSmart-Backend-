const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');


const { host, puerto} = require('../Configuraciones/ConexionDB');



const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 

const { FechaInicio, SemanaInicio, AñoInicio, FechaFin, SemanaFin, AñoFin, DiasAVG} = require(`../../${parametroFolder}/cfg/FechaParam`);

const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const mongoURI = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const historicoDemandaCollection = 'historico_demanda_sem'; 
const demandaAbcd01Collection = 'politica_inventarios_01_sem'; 

async function calcularPromedioErrorCuadrado() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 05 - Calculo de la Variabilidad de la Demanda en Cantidad`);

  try {
    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });
    const db = client.db(dbName);

    const resultado = await CalculaRangoFechas(dbName);
    const fechaInicioObj = new Date(resultado.fechaInicio);
    const fechaFinObj = new Date(resultado.fechaFin);
    const diasprom = new Number(resultado.diasprom);

    const yearStart = parseInt(AñoInicio, 10);
    const weekStart = parseInt(SemanaInicio, 10);
    const yearEnd = parseInt(AñoFin, 10);
    const weekEnd = parseInt(SemanaFin, 10);
 
    writeToLog (` ${yearEnd} ${yearStart} ${weekEnd} ${weekStart}`);

    console.log("Ejecutando agregación en la colección:", historicoDemandaCollection);
console.log("Parámetros de filtrado - Año:", yearStart, "a", yearEnd, "Semana:", weekStart, "a", weekEnd);

// 📌 Nuevo filtro para considerar cambio de año
const filtroSemanas = {
  $match: {
    $or: [
      { Year: yearStart, Week: { $gte: weekStart } },  // Últimas semanas del año anterior
      { Year: yearEnd, Week: { $lte: weekEnd } }       // Primeras semanas del nuevo año
    ]
  }
};

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

// 📌 LOG: Mostrar los resultados de la agregación
console.log("Resultados de la agregación:");
console.table(resultadosAgregados);

// 📌 Validación: Si no hay datos, avisar y salir
if (resultadosAgregados.length === 0) {
  console.warn("⚠️ No se encontraron datos con los filtros aplicados. Verifica que existan registros en la BD.");
}

// 📌 LOG: Verificar si `diasprom` es correcto antes de dividir
console.log("Valor de diasprom:", diasprom);
console.log("Cálculo de semanas (Math.ceil(diasprom / 7)):", Math.ceil(diasprom / 7));

const resultadosDivididos = resultadosAgregados.map(resultado => {
  const variabilidad = resultado.Demanda_Cantidad / (Math.ceil(diasprom / 7));
  
  // 📌 LOG: Mostrar el cálculo para cada resultado
  console.log(`Producto: ${resultado.Producto}, Ubicación: ${resultado.Ubicacion}`);
  console.log(`Demanda_Cantidad: ${resultado.Demanda_Cantidad}`);
  console.log(`Variabilidad_Demanda_Cantidad calculada: ${variabilidad}`);

  return {
    Producto: resultado.Producto,
    Ubicacion: resultado.Ubicacion,
    Variabilidad_Demanda_Cantidad: variabilidad
  };
});

// 📌 LOG: Mostrar todos los resultados finales después de la división
console.log("Resultados finales con Variabilidad_Demanda_Cantidad:");
console.table(resultadosDivididos);
 


   

    
    const demandaAbcd01Collection = db.collection('politica_inventarios_01_sem');
    
    for (const resultado of resultadosDivididos) {
      await demandaAbcd01Collection.updateOne(
        { Producto: resultado.Producto, Ubicacion: resultado.Ubicacion },
        { $set: { Variabilidad_Demanda_Cantidad: resultado.Variabilidad_Demanda_Cantidad } }
      );
    }
    
    const politicaInventariosCollection = db.collection('politica_inventarios_01_sem');

    const resul = await politicaInventariosCollection.find({}).toArray();

    const updatePromises = resul.map(async (resultado) => {
      const variabilidadDemandaCantidad = resultado.Variabilidad_Demanda_Cantidad;
      const dsDemanda = Math.sqrt(variabilidadDemandaCantidad); // Calcula la raíz cuadrada

      await politicaInventariosCollection.updateOne(
        { _id: resultado._id }, // Suponiendo que tienes un campo "_id" en tus documentos
        { $set: { DS_Demanda: dsDemanda } }
      );
    });

    await Promise.all(updatePromises);



    writeToLog(`\tTermina el Calculo de la Variabilidad de la Demanda`);
    client.close();
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
  }
}


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}


// Llamar a la función para calcular el promedio y actualizar los datos
calcularPromedioErrorCuadrado();



async function CalculaRangoFechas(dbName) {
  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
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
    const diasprom = new Number(diasAtras);

    fechaInicio.setDate(fechaInicio.getDate() - (diasAtras - 1));

    return { fechaInicio, fechaFin, diasprom };
  } catch (error) {
    console.error('Error al consultar la tabla:', error);
  } finally {
    client.close();
  }
}
