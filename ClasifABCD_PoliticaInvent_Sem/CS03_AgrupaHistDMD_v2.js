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

const historicoDemandaCollection = 'historico_demanda'; 
const historicoDemandaSemanaCollection = 'historico_demanda_sem'; 

async function calcularPromedioErrorCuadrado() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 03 - Agrupacion por Semana de la Cantidad de la Historia de Demanda`);

  try {
    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });
    const db = client.db(dbName);

    // Convertir las fechas
    const fechaInicioObj = convertirFechaDDMMYYYY(FechaInicio);
    const fechaFinObj = convertirFechaDDMMYYYY(FechaFin);
    fechaInicioObj.setUTCHours(0, 0, 0, 0);
    fechaFinObj.setUTCHours(0, 0, 0, 0);

    const diasprom = new Number(DiasAVG);

    // Expandir el rango de fechas para incluir la transición de año
    const fechaInicioExtendida = new Date(fechaInicioObj);
    fechaInicioExtendida.setDate(fechaInicioExtendida.getDate() - 7);  // Retrocede una semana

    const fechaFinExtendida = new Date(fechaFinObj);
    fechaFinExtendida.setDate(fechaFinExtendida.getDate() + 7);  // Avanza una semana

    const resultadosAgregados = await db.collection(historicoDemandaCollection).aggregate([
      {
        $match: {
          Fecha: {
            $gte: fechaInicioExtendida, // Incluye la última semana de diciembre
            $lte: fechaFinExtendida     // Incluye la primera semana de enero
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
        }
      }
    ]).toArray();
    
    const histSemCollection = db.collection(historicoDemandaSemanaCollection);
    
    // Insertar los resultados de la agregación en la colección de demanda semanal
    if (resultadosAgregados.length > 0) {
      await histSemCollection.insertMany(resultadosAgregados);
      writeToLog(`\tSe insertaron ${resultadosAgregados.length} registros agrupados por semana`);
    } else {
      writeToLog(`\tNo se encontraron datos para agrupar en el rango de fechas especificado`);
    }

    writeToLog(`\tTermina la Agrupacion por Semana de la Cantidad de la Historia de Demanda`);
    client.close();
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
    console.error('Error en calcularPromedioErrorCuadrado:', error);
  }
}

function writeToLog(message) {
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  fs.appendFileSync(logFile, `${timestamp} - ${message}\n`);
}

function convertirFechaDDMMYYYY(fechaString) {
  // Divide la cadena en día, mes y año utilizando "/"
  const partes = fechaString.split('/');
  
  // El constructor Date espera el año, mes y día en ese orden
  // Nota: Restamos 1 del mes porque en JavaScript los meses van de 0 a 11
  const fecha = new Date(partes[2], partes[1] - 1, partes[0]);
  
  return fecha;
}

// Ejecutar la función principal
calcularPromedioErrorCuadrado();