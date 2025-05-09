const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');


const { host, puerto} = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

//const dbName = 'btc_opti_OPTIWEEK01';
//const DBUser = 'dbOPTIWEEK01';
//const DBPassword = 'passDB123';

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 

//const mongoURI = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const historicoDemandaCollection = 'historico_demanda'; 


async function calcularPromedioErrorCuadrado() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 02 - Calculo de los parametros de Horizontes en Semanas`);

  try {
    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });
    const db = client.db(dbName);

    const fileName = `../../${parametroFolder}/cfg/FechaParam.js`;
    // Verificar si el archivo ya existe y eliminarlo
    if (fs.existsSync(fileName)) {
        fs.unlinkSync(fileName);
        //console.log(`Archivo "${fileName}" existente eliminado.`);
      }

    const resultado = await CalculaRangoFechas(dbName);
    const fechaInicioObj = new Date(resultado.fechaInicio);
    const fechaFinObj = new Date(resultado.fechaFin);
    const DiasAVG = new Number(resultado.diasprom);

    fechaInicioObj.setUTCHours(0, 0, 0, 0);
    fechaFinObj.setUTCHours(0, 0, 0, 0);

    const FechaInicio = formatearFecha(fechaInicioObj);
    const collection = db.collection('Calendar');
    const result = await collection.aggregate([
        {
          $match: {
            Fecha: { $eq: fechaInicioObj }, 
          },
        },
        {
          $sort: {
            Fecha: 1, 
          },
        },
        {
          $limit: 1, 
        },
        {
          $project: {
            Year: 1,
            Week: 1,
            _id: 0, 
          },
        },
      ]).toArray();




      const FechaFin = formatearFecha(fechaFinObj);
      const resultFin = await collection.aggregate([
        {
          $match: {
            Fecha: { $eq: fechaFinObj }, 
          },
        },
        {
          $sort: {
            Fecha: 1, 
          },
        },
        {
          $limit: 1, 
        },
        {
          $project: {
            Year: 1,
            Week: 1,
            _id: 0, 
          },
        },
      ]).toArray();
    
//-----------------------------------------
    const fileContent = `
const FechaInicio = "${FechaInicio}";
const SemanaInicio = "${result[0].Week}";
const AñoInicio = "${result[0].Year}";
const FechaFin = "${FechaFin}";
const SemanaFin = "${resultFin[0].Week}";
const AñoFin = "${resultFin[0].Year}";
const DiasAVG ="${DiasAVG}";


module.exports = {
    FechaInicio,
    SemanaInicio,
    AñoInicio,
    FechaFin,
    SemanaFin,
    AñoFin,
    DiasAVG
};`;

await fs.promises.writeFile(fileName, fileContent);



    writeToLog(`\tTermina el Calculo de los parametros de Horizontes en Semanas`);
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
    const diasprom = new Number(diasAtras);

    fechaInicio.setDate(fechaInicio.getDate() - (diasAtras - 1));

    return { fechaInicio, fechaFin, diasprom };
  } catch (error) {
    console.error('Error al consultar la tabla:', error);
  } finally {
    client.close();
  }
}


function formatearFecha(fecha) {
    const dia = fecha.getUTCDate().toString().padStart(2, '0');
    const mes = (fecha.getUTCMonth() + 1).toString().padStart(2, '0');
    const año = fecha.getUTCFullYear();
  
    return `${dia}/${mes}/${año}`;
  }

