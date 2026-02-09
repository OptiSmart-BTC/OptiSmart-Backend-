const fs = require('fs');
const path = require('path');

const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

//const url = `mongodb://${host}:${puerto}/${dbName}`;
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);



const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


// Configurar la conexión a la base de datos
//const url = 'mongodb://127.0.0.1:27017'; // Cambia la URL según tu configuración
//const dbName = 'btc_opti_a001'; // Cambia el nombre de la base de datos
const collection = 'politica_inventarios_01';

// Realizar los cálculos y la actualización
async function actualizarDatos() {

  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 10.1 - Determina si se requiere Override o no`);

  let client;
  try {

  client = await MongoClient.connect(mongoUri);
  //const client = await MongoClient.connect(url);
  const db = client.db(dbName);

  // Obtener la colección (política_inventarios_01)
  const col = db.collection(collection);

  // Realizar los cálculos y la actualización
  const result = await col.aggregate([
    {
      $project: {
        _id: 1,
        Override_SI_NO: {
          $cond: {
            if: { $ne: ['$SS_Cantidad', '$STAT_SS'] },
            then: 'SI',
            else: 'NO'
          }
        }
      }
    }
  ]).toArray();

  //writeToLog(`${result}`);
  /*const formattedResult = result.map(doc => ({
    _id: doc._id,
    Prom_LT: doc.Prom_LT
  }));
  
  writeToLog(JSON.stringify(formattedResult, null, 2));
*/
  for (const doc of result) {
    await col.updateOne(
      { _id: doc._id },
      {
        $set: {
          Override_SI_NO: doc.Override_SI_NO
        }
      }
    );
  }
console.log(result);
  writeToLog(`\tTermina la Determinacion de Requerimiento de Override`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) {
      client.close();
    }
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

// Llamar a la función para actualizar los datos
actualizarDatos().catch(console.error);
