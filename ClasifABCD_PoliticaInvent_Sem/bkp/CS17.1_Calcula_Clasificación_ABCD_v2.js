const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../../Configuraciones/ConStrDB');
const moment = require('moment');


const { host, puerto} = require('../../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 

async function actualizarClasificacionABCD() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 17.1 - Calculo de la Clasificación ABCD por Semana Final `);

  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;

  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db(dbName);

  const demandaData = await db.collection('demanda_abcd_01_sem').find().toArray();

  for (const demandaItem of demandaData) {
    const skuItem = await db.collection('sku').findOne({ SKU: demandaItem.SKU });
    const parametrosUsuario = await db.collection('parametros_usuario').findOne({ ID: demandaItem.Clasificacion_Variabilidad + demandaItem.Clasificacion_Margen + demandaItem.Clasificacion_Demanda, Tipo: 'Variabilidad' });
    let clasificacionABCD;

    if(demandaItem.Override_SI_NO === 'NO'){
      if (skuItem.OverrideClasificacionABCD !== '-') {
        clasificacionABCD = skuItem.OverrideClasificacionABCD;
      } else {
        clasificacionABCD = parametrosUsuario.Clasificacion_ABCD;
      }
  } else {
    clasificacionABCD = skuItem.OverrideClasificacionABCD;
  }
  

    await db.collection('demanda_abcd_01_sem').updateOne(
      { _id: demandaItem._id },
      { $set: { Clasificacion_ABCD: clasificacionABCD } }
    );
  }


  writeToLog(`\tTermina el Calculo de la Clasificación ABCD por Semana Final`);


  client.close();
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}


actualizarClasificacionABCD();
