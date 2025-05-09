const fs = require('fs');
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
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 


async function actualizarMargenUnitario() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 15 - Calculo del Margen Unitario por Semana`);

  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;

  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db(dbName);

  const skuData = await db.collection('sku').find().toArray();


  for (const skuItem of skuData) {
    const sku = skuItem.SKU;
    const margenUnitario = skuItem.MargenUnitario;

    await db.collection('demanda_abcd_01_sem').updateOne(
      { SKU: sku },
      { $set: { Margen_Unitario: margenUnitario } }
    );
  }


  writeToLog(`\tTermina el Calculo del Margen Unitario por Semana`);

  client.close();
}


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}


// Ejecutar la función para actualizar los datos
actualizarMargenUnitario();
