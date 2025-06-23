const fs = require('fs');
const { MongoClient } = require('mongodb');
<<<<<<< HEAD
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');


const { host, puerto} = require('../Configuraciones/ConexionDB');
=======
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');
>>>>>>> origin/test

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

<<<<<<< HEAD
//const dbName = 'btc_opti_OPTIWEEK01'
//const DBUser = 'dbOPTIWEEK01';
//const DBPassword = 'passDB123';

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 

const { FechaInicio, SemanaInicio, AñoInicio, FechaFin, SemanaFin, AñoFin, DiasAVG} = require(`../../${parametroFolder}/cfg/FechaParam`);


//const mongoURI = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const historicoDemandaCollection = 'historico_demanda'; 
const historicoDemandaSemanaCollection = 'historico_demanda_sem'; 


async function calcularPromedioErrorCuadrado() {

=======
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;

const { FechaInicio, SemanaInicio, AñoInicio, FechaFin, SemanaFin, AñoFin, DiasAVG } = require(`../../${parametroFolder}/cfg/FechaParam`);

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const historicoDemandaCollection = 'historico_demanda';
const historicoDemandaSemanaCollection = 'historico_demanda_sem';

async function calcularPromedioErrorCuadrado() {
>>>>>>> origin/test
  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 03 - Agrupacion por Semana de la Cantidad de la Historia de Demanda`);

  try {
    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });
    const db = client.db(dbName);

<<<<<<< HEAD
=======
    //  Convertir las fechas
>>>>>>> origin/test
    const fechaInicioObj = convertirFechaDDMMYYYY(FechaInicio);
    const fechaFinObj = convertirFechaDDMMYYYY(FechaFin);
    fechaInicioObj.setUTCHours(0, 0, 0, 0);
    fechaFinObj.setUTCHours(0, 0, 0, 0);

    const diasprom = new Number(DiasAVG);

<<<<<<< HEAD
=======
    // Expandimos el rango de fechas para incluir la transición de año
    const fechaInicioExtendida = new Date(fechaInicioObj);
    fechaInicioExtendida.setDate(fechaInicioExtendida.getDate() - 7);  // Retrocede una semana

    const fechaFinExtendida = new Date(fechaFinObj);
    fechaFinExtendida.setDate(fechaFinExtendida.getDate() + 7);  // Avanza una semana

>>>>>>> origin/test
    const resultadosAgregados = await db.collection(historicoDemandaCollection).aggregate([
      {
        $match: {
          Fecha: {
<<<<<<< HEAD
            $gte: fechaInicioObj,
            $lte: fechaFinObj
=======
            $gte: fechaInicioExtendida, // Incluye la última semana de diciembre
            $lte: fechaFinExtendida, // Incluye la primera semana de enero
>>>>>>> origin/test
          }
        }
      },
      {
        $group: {
          _id: {
            SKU: "$SKU",
            Ubicacion: "$Ubicacion",
            Producto: "$Producto",
            Week_Year: "$Week_Year",
            Week: "$Week",
            Year: "$Year"
          },
          Cantidad_Sem: { $sum: "$Cantidad" }
        }
      },
      {
        $addFields: {
          SKU: "$_id.SKU",
          Ubicacion: "$_id.Ubicacion",
          Producto: "$_id.Producto",
          Week: "$_id.Week",
          Year: "$_id.Year",
          Week_Year: "$_id.Week_Year"
        },
<<<<<<< HEAD
      },  
      /*{
        $addFields: {
          // Agrega campos adicionales aquí
          NuevoCampo1: "Valor1",
          NuevoCampo2: "Valor2"
        }
      }*/
    ]).toArray();
    
    const histSemCollection = db.collection('historico_demanda_sem');
    
    // Insertar los resultados de la agregación en la colección hist_sem
    await histSemCollection.insertMany(resultadosAgregados);

  
    





=======
      }
    ]).toArray();

    const histSemCollection = db.collection(historicoDemandaSemanaCollection);

    // 🔹 Insertar los resultados de la agregación en la colección de demanda semanal
    await histSemCollection.insertMany(resultadosAgregados);

>>>>>>> origin/test
    writeToLog(`\tTermina la Agrupacion por Semana de la Cantidad de la Historia de Demanda`);
    client.close();
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
  }
}

<<<<<<< HEAD

=======
>>>>>>> origin/test
function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}


<<<<<<< HEAD
// Llamar a la función para calcular el promedio y actualizar los datos
calcularPromedioErrorCuadrado();


function convertirFechaDDMMYYYY(fechaString) {
  // Divide la cadena en día, mes y año utilizando "/"
  const partes = fechaString.split('/');

  // El constructor Date espera el año, mes y día en ese orden
  // Nota: Restamos 1 del mes porque en JavaScript los meses van de 0 a 11
  const fecha = new Date(partes[2], partes[1] - 1, partes[0]);

  return fecha;
}


/*

  const resultadosDivididos = resultadosAgregados.map(resultado => ({
      Producto: resultado.Producto,
      Ubicacion: resultado.Ubicacion,
      Cantidad_Sem: resultado.Cantidad_Sem 
    }));

    writeToLog(fechaInicioObj);
    writeToLog(fechaFinObj);
    writeToLog(diasprom);

*/
=======
function convertirFechaDDMMYYYY(fechaString) {
  const partes = fechaString.split('/');
  return new Date(partes[2], partes[1] - 1, partes[0]); // Ajuste de mes (0-11 en JS)
}

calcularPromedioErrorCuadrado();
>>>>>>> origin/test
