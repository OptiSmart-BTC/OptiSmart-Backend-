const fs = require('fs');
const csv = require('csv-parser');
const { MongoClient } = require('mongodb');
const moment = require('moment');
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];


const { decryptData } = require('../DeCriptaPassAppDb');
const { host, puerto } = require('../../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`; 

//const mongoURI = `mongodb://${host}:${puerto}/${dbName}`;




async function eliminarRegistros() {
    writeToLog(`Paso 05 - Limpieza de registros vacios.`);
  try {

    const passadminDeCripta = await getDecryptedPassadmin();
    const mongoURI = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
    const client = await MongoClient.connect(mongoURI, { useNewUrlParser: true });
    const db = client.db();

    const historicoDemandaCollection = db.collection('historico_demanda');

        // Eliminar registros en la colección 'historico_demanda'
    const historicoDemandaFilter = {
      SKU: 'undefined@undefined',
      Ubicacion: 'undefined',
      Producto: 'undefined',
      Fecha: new Date('1970-01-01T00:00:00.000Z'),
      CantidadFacturada: NaN
    };

    const historicoDemandaDeleteResult = await historicoDemandaCollection.deleteMany(historicoDemandaFilter);
    const numRegistrosHistoricoDemandaEliminados = historicoDemandaDeleteResult.deletedCount;

    
    fs.appendFileSync(logFile, `\tCantidad de Registros Vacios que se eliminaron en 'historico_demanda': ${numRegistrosHistoricoDemandaEliminados}\n`);

    //writeToLog(`\tLimpieza de registros vacios completada.`);
    //writeToLog('------------------------------------------------------------------------------');
    client.close();
  } catch (error) {
    //console.error('Error:', error);
    writeToLog(`${now} - Error: ${error}`);
    //writeToLog('------------------------------------------------------------------------------');
  } 
}

function writeToLog(message) {
    fs.appendFileSync(logFile, message + '\n');
  }

  // Obtener el valor desencriptado de passadmin
async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}

eliminarRegistros();
