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


async function CalculaDataToDemandaABCD() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 06 - Calculo de la Demanda ABCD`);

  //const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db(dbName);

  const parametrosUsuario = await db.collection('parametros_usuario').findOne({ Tipo: 'Horizontes', Num_Param: 1 });
  const horizonteHistoricoDias = parametrosUsuario.Horizonte_Historico_dias;

  const demandaOrdenadaDesc = await db.collection('demanda_ordenada_desc').find({ Producto: { $ne: 'Producto' } }).toArray();

  const demandaABCDData = demandaOrdenadaDesc.map((item) => {
    return {
      Tipo_Calendario:"Dia",
      SKU: `${item.Producto}@${item.Ubicacion}`,
      Producto: item.Producto,
      Desc_Producto:"",
      Familia_Producto:"",
      Categoria:"",	
      Segmentacion_Producto:"",
      Presentacion:"",
      Ubicacion: item.Ubicacion,
      Desc_Ubicacion:"",
      Demanda_Costo: item.Demanda_Costo,
      Demanda_Promedio_Diaria_Costo: item.Demanda_Costo / horizonteHistoricoDias,
      Clasificacion_Demanda: item.Clasificacion_Demanda
    };
  }); 
 
  await db.collection('demanda_abcd_01').deleteMany({});
  await db.collection('demanda_abcd_01').insertMany(demandaABCDData);

  writeToLog(`\tTermina el Calculo de la Demanda ABCD`);
  client.close();
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


CalculaDataToDemandaABCD();
