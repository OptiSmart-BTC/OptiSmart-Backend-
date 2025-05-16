const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

//const uri = `mongodb://${host}:${puerto}/${dbName}`;
//const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);


const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/Override_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

  //const uri = 'mongodb://127.0.0.1:27017'; 

async function calculateAndSetSSCantidad() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 01.1 - Re-Calculo del SS Cantidad`);

  let client;
  client = new MongoClient(mongoUri);
  //const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(`${dbName}`); 
    const col = db.collection('politica_inventarios_01');

    const result = await col.find().toArray();

    const processedResult = result.map(item => {
      let resultado;
    
      if (item.Override_Max_Politica_Inventarios !== "" || item.Override_Min_Politica_Inventarios !== "") {
        if (item.Tipo_Override === "SS") {
          if (item.Medida_Override === "Cantidad") {
            if (item.Override_Max_Politica_Inventarios !== "" && item.Override_Max_Politica_Inventarios < item.STAT_SS) {
              resultado = item.Override_Max_Politica_Inventarios;
            } else {
              if (item.Override_Min_Politica_Inventarios > item.STAT_SS) {
                resultado = item.Override_Min_Politica_Inventarios;
              } else {
                resultado = item.STAT_SS;
              }
            }
          } else {
            if (item.Override_Max_Politica_Inventarios !== "" && (item.Override_Max_Politica_Inventarios * item.Demanda_Promedio_Diaria) < item.STAT_SS) {
              resultado = item.Override_Max_Politica_Inventarios * item.Demanda_Promedio_Diaria;
            } else {
              if ((item.Override_Min_Politica_Inventarios * item.Demanda_Promedio_Diaria) > item.STAT_SS) {
                resultado = item.Override_Min_Politica_Inventarios * item.Demanda_Promedio_Diaria;
              } else {
                resultado = item.STAT_SS;
              }
            }
          }
        } else {
          const maxVal = Math.max(
            0,
            item.Medida_Override === "Cantidad"
              ? item.Override_Max_Politica_Inventarios !== "" && (item.Override_Max_Politica_Inventarios - item.Prom_LT * item.Demanda_Promedio_Diaria) < item.STAT_SS
                ? item.Override_Max_Politica_Inventarios - item.Prom_LT * item.Demanda_Promedio_Diaria
                : (item.Override_Min_Politica_Inventarios - item.Prom_LT * item.Demanda_Promedio_Diaria) > item.STAT_SS
                ? item.Override_Min_Politica_Inventarios - item.Prom_LT * item.Demanda_Promedio_Diaria
                : item.STAT_SS
              : item.Override_Max_Politica_Inventarios !== "" && (item.Override_Max_Politica_Inventarios * item.Demanda_Promedio_Diaria - item.Prom_LT * item.Demanda_Promedio_Diaria) < item.STAT_SS
              ? item.Override_Max_Politica_Inventarios * item.Demanda_Promedio_Diaria - item.Prom_LT * item.Demanda_Promedio_Diaria
              : (item.Override_Min_Politica_Inventarios * item.Demanda_Promedio_Diaria - item.Prom_LT * item.Demanda_Promedio_Diaria) > item.STAT_SS
              ? item.Override_Min_Politica_Inventarios * item.Demanda_Promedio_Diaria - item.Prom_LT * item.Demanda_Promedio_Diaria
              : item.STAT_SS
          );
          resultado = maxVal;
        }
      } else {
        resultado = item.STAT_SS;
      }
    
      return {
        ...item,
        resultado
      };
    });
    
    for (const item of processedResult) {
      await col.updateOne(
        { _id: item._id },
        { $set: { 'SS_Cantidad': item.resultado } }
      );
    }


    writeToLog(`\tTermina el Re-Calculo del SS Cantidad`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

calculateAndSetSSCantidad();
