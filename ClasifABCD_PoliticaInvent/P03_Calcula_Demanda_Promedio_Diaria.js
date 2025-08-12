const fs = require('fs');
const path = require('path');

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
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 

//const mongoURI = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const historicoDemandaCollection = 'historico_demanda'; 
const demandaAbcd01Collection = 'politica_inventarios_01'; 

async function calcularPromedioErrorCuadrado() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 03 - Calculo de la Demanda Promedio Diaria`);

  try {
    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });
    const db = client.db(dbName);

    const resultado = await CalculaRangoFechas(dbName);
    const fechaInicioObj = new Date(resultado.fechaInicio);
    const fechaFinObj = new Date(resultado.fechaFin);
    const diasprom = new Number(resultado.diasprom);

    const documentosExistentes = await db.collection(historicoDemandaCollection).countDocuments({
      Fecha: {
        $gte: fechaInicioObj,
        $lte: fechaFinObj
      }
    });



    const resultadosAgregados = await db.collection(historicoDemandaCollection).aggregate([
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
            Ubicacion: "$Ubicacion"
          },
          Demanda_Cantidad: { $sum: "$Cantidad" }
        }
      }, 
      {
        $addFields: {
          Producto: "$_id.Producto",
          Ubicacion: "$_id.Ubicacion"

          
        }
      }
    ]).toArray();

  
    const resultadosDivididos = resultadosAgregados.map(resultado => ({
      Producto: resultado.Producto,
      Ubicacion: resultado.Ubicacion,
      Demanda_Promedio_Diaria: resultado.Demanda_Cantidad / diasprom,
    }));


    const demandaAbcd01Collection = db.collection('politica_inventarios_01'); // Reemplaza con el nombre de tu colección

    for (const resultado of resultadosDivididos) {
      await demandaAbcd01Collection.updateOne(
        { Producto: resultado.Producto, Ubicacion: resultado.Ubicacion },
        { $set: { Demanda_Promedio_Diaria: resultado.Demanda_Promedio_Diaria } }
      );
    }
    //const formattedResult = JSON.stringify(resultadosDivididos, null, 2);
    //writeToLog(formattedResult);





    writeToLog(`\tTermina el Calculo de la Variabilidad de la Demanda`);
    client.close();
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
  }
}


function writeToLog(message) {
  const moment = require('moment');
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  const logMessage = `[${timestamp}] ${message}`;
  
  try {
    // Lógica mejorada para determinar el directorio de log
    let parametroFolder;
    try {
      if (typeof dbName !== 'undefined' && dbName) {
        const partes = dbName.split("_");
        let parte = partes[partes.length - 1];
        
        // Si la última parte parece un timestamp (12+ dígitos), usar la anterior
        if (/^\d{12,}$/.test(parte)) {
          parte = partes[partes.length - 2];
        }
        
        parametroFolder = parte.toUpperCase();
      } else {
        parametroFolder = 'DEFAULT';
      }
    } catch (error) {
      parametroFolder = 'DEFAULT';
    }
    
    const logFile = path.resolve(__dirname, `../../${parametroFolder}/log/ClasABCD_PolInvent.log`);
    const logDir = path.dirname(logFile);
    
    // Crear directorio si no existe
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Escribir al archivo de log
    fs.appendFileSync(logFile, logMessage + '\n');
  } catch (err) {
    // Fallback: escribir en directorio actual si hay problemas
    try {
      const fallbackLogFile = path.join(__dirname, `${path.basename(__filename, '.js')}_fallback.log`);
      fs.appendFileSync(fallbackLogFile, logMessage + '\n');
      console.error(`Log escrito en fallback: ${fallbackLogFile}`);
    } catch (fallbackErr) {
      // Si todo falla, solo mostrar en consola
      console.error(`Error escribiendo log: ${err.message}`);
      console.log(logMessage);
    }
  }
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
