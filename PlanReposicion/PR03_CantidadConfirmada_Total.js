const fs = require('fs');
const { MongoClient } = require('mongodb');
<<<<<<< HEAD
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');


const { host, puerto} = require('../Configuraciones/ConexionDB');
=======
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');
>>>>>>> origin/test

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
<<<<<<< HEAD
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`; 

//const mongoURI = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
const historicoDemandaCollection = 'requerimientos_confirmados'; 
const demandaAbcd01Collection = 'plan_reposicion_01'; 

async function calcularPromedioErrorCuadrado() {

  const now = moment().format('YYYY-MM-DD HH:mm:ss');

  writeToLog(`\nPaso 03 - Calculo de la Cantidad Confirmada Total`);

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

          
=======
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`;

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const historicoDemandaCollection = 'requerimientos_confirmados';
const planRepoCollection = 'plan_reposicion_01';

async function calcularConfirmadaTotal() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 03 - Calculo de la Cantidad Confirmada Total`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const agregados = await db.collection(historicoDemandaCollection).aggregate([
      {
        $group: {
          _id: { Producto: "$Producto", Ubicacion: "$Ubicacion" },
          Cantidad_Confirmada_Total: { $sum: "$Cantidad_Confirmada" }
>>>>>>> origin/test
        }
      }
    ]).toArray();

<<<<<<< HEAD
  
    const resultadosDivididos = resultadosAgregados.map(resultado => ({
      Producto: resultado.Producto,
      Ubicacion: resultado.Ubicacion,
      Cantidad_Confirmada_Total: resultado.Cantidad_Confirmada_Total,
    }));


    const demandaAbcd01Collection = db.collection('plan_reposicion_01'); // Reemplaza con el nombre de tu colección

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


=======
    const updates = agregados.map(r => ({
      updateOne: {
        filter: {
          Producto: r._id.Producto,
          Ubicacion: r._id.Ubicacion
        },
        update: {
          $set: { Cantidad_Confirmada_Total: r.Cantidad_Confirmada_Total }
        }
      }
    }));

    if (updates.length > 0) {
      await db.collection(planRepoCollection).bulkWrite(updates);
    }

    writeToLog(`\tTermina el Calculo de la Cantidad Confirmada Total (${updates.length} registros)`);
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
  } finally {
    if (client) client.close();
  }
}

>>>>>>> origin/test
function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

<<<<<<< HEAD

// Llamar a la función para calcular el promedio y actualizar los datos
calcularPromedioErrorCuadrado();

=======
calcularConfirmadaTotal();
>>>>>>> origin/test
