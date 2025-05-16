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
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 


async function updateClasificacionVariabilidad() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 11 - Calculo de la Clasificacion de la Variabilidad`);

  //const url = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
  const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db(dbName);

  // Obtener los parámetros de comparación
  const criteriosOrden1 = await db.collection('parametros_usuario').findOne({
    Tipo: 'Criterios',
    Criterio_Clasificacion: 'Variabilidad',
    Orden: 1
  });



  const criteriosOrden2 = await db.collection('parametros_usuario').findOne({
    Tipo: 'Criterios',
    Criterio_Clasificacion: 'Variabilidad',
    Orden: 2
  });



  const criteriosOrden3 = await db.collection('parametros_usuario').findOne({
    Tipo: 'Criterios',
    Criterio_Clasificacion: 'Variabilidad',
    Orden: 3
  });


  const demandaABCDData = await db.collection('demanda_abcd_01').find().toArray();

  const updatedData = demandaABCDData.map((item) => {
    if (item.Coeficiente_Variabilidad > criteriosOrden3.Parametros) {
      return { ...item, Clasificacion_Variabilidad: criteriosOrden3.SubClasificacion };
    } else if (item.Coeficiente_Variabilidad > criteriosOrden2.Parametros) {
      return { ...item, Clasificacion_Variabilidad: criteriosOrden2.SubClasificacion };
    } else {
      return { ...item, Clasificacion_Variabilidad: criteriosOrden1.SubClasificacion };
    }
  });

  // Actualizar los datos en la tabla demanda_abcd_01
  for (const item of updatedData) {
    await db.collection('demanda_abcd_01').updateOne(
      { _id: item._id },
      { $set: { Clasificacion_Variabilidad: item.Clasificacion_Variabilidad } }
    );
  }

  writeToLog(`\tTermina el Calculo de la Clasificacion de la Variabilidad`);

  client.close();
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

updateClasificacionVariabilidad();
