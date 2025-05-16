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


async function actualizarClasificacionMargen() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 16 - Calculo de la Calificacion del Margen por Semana`);

  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;

  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db(dbName);


  const demandaData = await db.collection('demanda_abcd_01_sem').find().toArray();


  const parametrosUsuario = await db.collection('parametros_usuario').find({
    Tipo: 'Criterios',
    Criterio_Clasificacion: 'Margen'
  }).toArray();


  let parametroMargenOrden2;
  for (const param of parametrosUsuario) {
    if (param.Orden === 2) {
      parametroSubClasificacion2 = param.SubClasificacion;
      parametroMargenOrden2 = param.Parametros;
      break;
    }
  }

  let parametroMargenOrden1;
  for (const param of parametrosUsuario) {
    if (param.Orden === 1) {
        parametroSubClasificacion1 = param.SubClasificacion;
        parametroMargenOrden1 = param.Parametros;

      break;
    }
  }


  for (const demandaItem of demandaData) {
    const margenUnitario = demandaItem.Margen_Unitario;
    let clasificacionMargen;

    if (margenUnitario > parametroMargenOrden2) {
      clasificacionMargen = parametroSubClasificacion2;
    } else {
      clasificacionMargen = parametroSubClasificacion1;
    }

    await db.collection('demanda_abcd_01_sem').updateOne(
      { _id: demandaItem._id },
      { $set: { Clasificacion_Margen: clasificacionMargen } }
    );
  }


  writeToLog(`\tTermina el Calculo de la Calificacion del Margen por Semana`);


  client.close();
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}


actualizarClasificacionMargen();
