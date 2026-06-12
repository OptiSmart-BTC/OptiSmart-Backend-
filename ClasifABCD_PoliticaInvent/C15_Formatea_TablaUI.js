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



async function copiarDatos() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 15 - Formateo de las Tablas Finales para mostrar en UI`);

  //const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const collection = db.collection('demanda_abcd_01');

    const finalCollection = db.collection('ui_demanda_abcd');
    await finalCollection.deleteMany({});

    const datos = await collection.find().toArray();

    const datosFormateados = datos.map((dato) => {
      return {
        ...dato,
        Demanda_Costo: formatearNumero(dato.Demanda_Costo),
        Demanda_Promedio_Diaria_Costo: formatearNumero(dato.Demanda_Promedio_Diaria_Costo),
        Variabilidad_Demanda: formatearNumero(dato.Variabilidad_Demanda),
        DS_Demanda: formatearNumero(dato.DS_Demanda),
        DS_Demanda_Costo: formatearNumero(dato.DS_Demanda_Costo),
        Coeficiente_Variabilidad: formatearNumero(dato.Coeficiente_Variabilidad)
      };
    });


    await finalCollection.insertMany(datosFormateados);


    writeToLog(`\tTermina el Formateo de las Tablas Finales para mostrar en UI`);
  } catch (err) {

    writeToLog(`${now} - Error al copiar los datos: ${err}`);

  } finally {

    client.close();
  }
}


function formatearNumero(numero) {
  if (typeof numero === 'number') {
    return numero.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    });
  }
  return numero;
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


copiarDatos();
