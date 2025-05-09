const fs = require('fs');
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





async function calcularDemandaPorcentaje() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 02 - Calculo del Porcentaje de la Demanda`);
  //const mongoURI = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
  const collectionName = 'demanda_calculada';

  try {
    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });
    const db = client.db(dbName);
    const demandas = await db.collection(collectionName).find().toArray();

    for (const demanda of demandas) {
      const ubicacion = demanda.Ubicacion;
      const demandaCosto = demanda.Demanda_Costo;

      const sumaDemandas = demandas.reduce((suma, d) => {
        if (d.Ubicacion === ubicacion) {
          suma += d.Demanda_Costo;
        }
        return suma;
      }, 0);

      const demandaPorcentaje = ((demandaCosto / sumaDemandas)*100) || 0;

      await db.collection(collectionName).updateOne(
        { _id: demanda._id },
        { $set: { Demanda_Porcentaje: Number(demandaPorcentaje) } }
      );
    }

    writeToLog(`\tTermina el Calculo del Porcentaje de la Demanda`);
    client.close();
  } catch (error) {
    writeToLog(`${now} - Error: ${err}`);
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

calcularDemandaPorcentaje();
