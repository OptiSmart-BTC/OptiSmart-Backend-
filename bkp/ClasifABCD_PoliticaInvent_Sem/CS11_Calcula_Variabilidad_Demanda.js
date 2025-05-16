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

const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const mongoURI = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const historicoDemandaCollection = 'historico_demanda_sem'; 
const demandaAbcd01Collection = 'demanda_abcd_01_sem'; 

async function calcularPromedioErrorCuadrado() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 11 - Calculo de la Variabilidad de la Demanda por Semana`);

  try {
    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });
    const db = client.db(dbName);

    
    const resultado = await CalculaRangoFechas(dbName);
    const fechaInicioObj = new Date(resultado.fechaInicio);
    const fechaFinObj = new Date(resultado.fechaFin);
    const diasprom = new Number(resultado.diasprom);
/*
    const documentosExistentes = await db.collection(historicoDemandaCollection).countDocuments({
      Fecha: {
        $gte: fechaInicioObj,
        $lte: fechaFinObj
      }
    });
*/


    const resultadosAgregados = await db.collection(historicoDemandaCollection).aggregate([
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

 /* 
    const resultadosDivididos = resultadosAgregados.map(resultado => ({
      Producto: resultado.Producto,
      Ubicacion: resultado.Ubicacion,
      Variabilidad_Demanda: resultado.Demanda_Costo / diasprom,
    }));
*/

    const resultadosDivididos = resultadosAgregados.map(resultado => ({
      Producto: resultado.Producto,
      Ubicacion: resultado.Ubicacion,
      Variabilidad_Demanda: resultado.Demanda_Costo / (Math.ceil(diasprom / 7)),
    }));

    const demandaAbcd01Collection = db.collection('demanda_abcd_01_sem'); 

    for (const resultado of resultadosDivididos) {
      await demandaAbcd01Collection.updateOne(
        { Producto: resultado.Producto, Ubicacion: resultado.Ubicacion },
        { $set: { Variabilidad_Demanda: resultado.Variabilidad_Demanda } }
      );
    }
    //const formattedResult = JSON.stringify(resultadosDivididos, null, 2);
    //writeToLog(formattedResult);





    writeToLog(`\tTermina el Calculo de la Variabilidad de la Demanda por Semana`);
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
