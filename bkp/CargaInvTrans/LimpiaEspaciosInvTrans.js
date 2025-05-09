const fs = require('fs');
const csv = require('csv-parser');
const { MongoClient } = require('mongodb');
const moment = require('moment');
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaInvCSV.log`; 



async function eliminarRegistros() {

  //writeToLog(`\n`);
  writeToLog(`\nPaso 05 - Limpieza de Filas Vacias`);

  try {

    const passadminDeCripta = await getDecryptedPassadmin();
    const mongoURI = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;

    const client = await MongoClient.connect(mongoURI, { useNewUrlParser: true });
    const db = client.db();

    const invtransCollection = db.collection('inventario_transito');
    

      const invtransFilter = {
      SKU: 'undefined@undefined',
      Producto: 'undefined',
      Ubicacion: 'undefined',
      Cantidad_Transito: NaN
    };

    const invtransDeleteResult = await invtransCollection.deleteMany(invtransFilter);
    const numRegistrosinvtransEliminados = invtransDeleteResult.deletedCount;

    
    fs.appendFileSync(logFile, `\tRegistros Vacios Eliminados En 'inventario_transito': ${numRegistrosinvtransEliminados}\n`);
    
    client.close();
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
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
