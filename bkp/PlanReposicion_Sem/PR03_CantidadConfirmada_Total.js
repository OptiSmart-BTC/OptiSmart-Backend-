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
const logFile = `../../${parametroFolder}/log/PlanReposicion_Sem.log`; 

//const mongoURI = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
const historicoDemandaCollection = 'requerimientos_confirmados'; 
const demandaAbcd01Collection = 'plan_reposicion_01_sem'; 

async function calcularPromedioErrorCuadrado() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 03 - Calculo de la Cantidad Confirmada Total Semanal`);

  try {
    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });
    const db = client.db(dbName);

    const resultadosAgregados = await db.collection(historicoDemandaCollection).aggregate([
     {
        $group: {
          _id: {
            Producto: "$Producto", 
            Ubicacion: "$Ubicacion"
          },
          Cantidad_Confirmada_Total: { $sum: "$Cantidad_Confirmada" }
        }
      }, 
      {
        $addFields: {
          Producto: "$_id.Producto",
          Ubicacion: "$_id.Ubicacion"

          
        }
      }
    ]).toArray();

  
    const resultadosDivididos = resultadosAgregados.map(resultado => ({
      Producto: resultado.Producto,
      Ubicacion: resultado.Ubicacion,
      Cantidad_Confirmada_Total: resultado.Cantidad_Confirmada_Total,
    }));


    const demandaAbcd01Collection = db.collection('plan_reposicion_01_sem'); 

    for (const resultado of resultadosDivididos) {
      await demandaAbcd01Collection.updateOne(
        { Producto: resultado.Producto, Ubicacion: resultado.Ubicacion },
        { $set: { Cantidad_Confirmada_Total: resultado.Cantidad_Confirmada_Total } }
      );
    }
    //const formattedResult = JSON.stringify(resultadosDivididos, null, 2);
    //writeToLog(formattedResult);





    writeToLog(`\tTermina el Calculo de la Cantidad Confirmada Total`);
    client.close();
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
  }
}


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}


// Llamar a la función para calcular el promedio y actualizar los datos
calcularPromedioErrorCuadrado();

