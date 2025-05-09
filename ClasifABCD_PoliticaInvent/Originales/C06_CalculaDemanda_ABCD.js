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
  fs.appendFileSync(logFile, message + '\n');
}


CalculaDataToDemandaABCD();
