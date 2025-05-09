const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');


const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];
//const mongoURI = `mongodb://${host}:${puerto}/${dbName}`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
//const mongoURI = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;


const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

 


async function eliminarColecciones() {
  try {

    //writeToLog('------------------------------------------------------------------------------');
    writeToLog('\n\nProceso de Generacion de la Politica de Inventarios por Semana');
    writeToLog(`\nInicio de ejecucion: ${now}\n`);
    writeToLog(`\nPaso 00 - Depuracion de Tablas de Politica de Invenatios`);

    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });
    const db = client.db();

    // Array con los nombres de las colecciones a eliminar
    const colecciones = [
      'politica_inventarios_01_sem',
      'politica_inventarios_costo_sem',
      'ui_sem_politica_inventarios',
      'ui_sem_pol_inv_dias_cobertura',
      'ui_sem_pol_inv_pallets',
      'ui_sem_pol_inv_costo',
      'ui_sem_pol_inv_uom'
    ];

    // Eliminar las colecciones
    for (const coleccion of colecciones) {
      try {
        await db.dropCollection(coleccion);
        //console.log(`La colección '${coleccion}' ha sido eliminada.`);

        //writeToLog(`${now} - La colección '${coleccion}' ha sido eliminada.`);


      } catch (error) {
        //if (error.codeName === 'NamespaceNotFound') {
          //console.log(`La colección '${coleccion}' no existe en la base de datos.`);
          //writeToLog(`${now} - La colección '${coleccion}' no existe en la base de datos.`);
       // } else {
        //  throw error; 
        //}
      }
    }

    //writeToLog('------------------------------------------------------------------------------');
    //console.log('Eliminación de colecciones completada.');
    //writeToLog(`${now} - Ejecucion exitosa`);
    writeToLog(`\tTermina el Proceso de depuracion`);
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


eliminarColecciones();
