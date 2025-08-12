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


//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const collectionName = 'demanda_abcd_01';


async function updateDocuments() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 10 - Calculo del Coeficiente de Variabilidad`);
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();


    const db = client.db(dbName);
    const collection = db.collection(collectionName);

  /*
    await collection.updateMany(
      { Producto: { $ne: 'Producto' } },
      [
        {
          $set: {
            'Coeficiente_Variabilidad': {
              $divide: [
                '$DS_Demanda',
                '$Demanda_Promedio_Diaria_Costo'
              ]
            }
          }
        }
      ]
    );

    */


    await collection.updateMany(
      { Producto: { $ne: 'Producto' } },
      [
        {
          $addFields: {
            'Demanda_Promedio_Diaria_Costo': {
              $cond: {
                if: { $eq: ['$Demanda_Promedio_Diaria_Costo', 0] },
                then: 0,
                else: '$Demanda_Promedio_Diaria_Costo'
              }
            }
          }
        },
        {
          $set: {
            'Coeficiente_Variabilidad': {
              $cond: {
                if: { $eq: ['$Demanda_Promedio_Diaria_Costo', 0] },
                then: 0,
                else: {
                  $divide: [
                    '$DS_Demanda',
                    '$Demanda_Promedio_Diaria_Costo'
                  ]
                }
              }
            }
          }
        }
      ]
    );
    

    writeToLog(`\tTermina el Calculo del Coeficiente de Variabilidad`);
  } catch (err) {
    writeToLog(`${now} - Error al realizar la operación de actualización: ${err}`);
  } finally {
    client.close();
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


updateDocuments();
