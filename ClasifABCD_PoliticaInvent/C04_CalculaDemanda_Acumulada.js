const fs = require('fs');
const path = require('path');

const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; // Cambia esta ruta según la ubicación de tu archivo CSV


async function obtenerRegistros() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 04 - Calculo de la Demanda Acumulada`);

  //const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const database = client.db(`${dbName}`);
    const collection = database.collection('demanda_ordenada_desc'); 

    const registros = await collection.find().sort({ Ubicacion: -1 }).toArray(); 
    return registros;
  } catch (error) {
    writeToLog(`${now} - Error al obtener los registros: ${error}`);
  } finally {
    client.close();
  }
}

async function actualizarRegistros(registros) {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  //const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const database = client.db(`${dbName}`);
    const collection = database.collection('demanda_ordenada_desc'); 

    for (const registro of registros) {
      const filter = { _id: registro._id }; 
      const update = {
        $set: {
          Demanda_Acumulada: Number(registro.Demanda_Acumulada),
          Demanda_Acumulada_Previa: Number((registro.Demanda_Acumulada - registro.Demanda_Porcentaje))
        }
      };
      await collection.updateOne(filter, update);
    }

    writeToLog(`\t Termina el Calculo de la Demanda Acumulada`);
  } catch (error) {
    writeToLog(`${now} - Error al actualizar los registros: ${error}`);
  } finally {
    client.close();
  }
}
 
obtenerRegistros().then(registros => {
  let demandaAcumuladaAnterior = 0;

  registros.forEach(registro => {
    const demandaActual = registro.Demanda_Porcentaje;
    const demandaAcumulada = (registro.Ubicacion === registros[registros.indexOf(registro) - 1]?.Ubicacion) ? demandaActual + demandaAcumuladaAnterior : demandaActual;
    registro.Demanda_Acumulada = demandaAcumulada;
    demandaAcumuladaAnterior = demandaAcumulada;
  });

  actualizarRegistros(registros);
}).catch(error => {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`${now} - Error: ${error}`);
});


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


