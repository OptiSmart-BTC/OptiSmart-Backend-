const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const jstat = require('jstat');
const moment = require('moment');

  // Configuración de conexión a la base de datos MongoDB
  //const uri = 'mongodb://127.0.0.1:27017';
  //const dbName = 'btc_opti_a001';

const { host, puerto } = require('../Configuraciones/ConexionDB');
const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

//const uri = `mongodb://${host}:${puerto}/${dbName}`;
//const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');
 
 
async function actualizarValorZ() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 01 - Calculo del Valor Z`);



  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const collection = db.collection('parametros_usuario');

    // Obtener los registros donde Tipo="Nivel_Servicio"
    const registros = await collection.find({ Tipo: 'Nivel_Servicio' }).toArray();

    // Calcular el valor de ValorZ y actualizar los registros
    registros.forEach((registro) => {
      const nivelServicio = registro.NivelServicio/100;
      //console.log(nivelServicio);
      const valorZ = jstat.normal.inv(1 - nivelServicio, 0, 1); // Calcula la función de distribución normal inversa
      registro.ValorZ = valorZ*-1;
    });

    // Actualizar los registros en la base de datos
    await Promise.all(registros.map((registro) => collection.updateOne({ _id: registro._id }, { $set: { ValorZ: registro.ValorZ } })));

    //console.log('Los registros se han actualizado correctamente.');
    //writeToLog(`${now} - Los registros se han actualizado correctamente.`);
    //writeToLog('------------------------------------------------------------------------------');
    //writeToLog(`${now} - Ejecucion exitosa`);
    writeToLog(`\tTermina el Calculo del Valor Z`);
  } catch (err) {
    //console.error('Error al actualizar los registros:', err);
    writeToLog(`${now} - Error al actualizar los registros: ${err}`);
    //writeToLog('------------------------------------------------------------------------------');
  } finally {
    // Cerrar la conexión a la base de datos
    client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Llamar a la función para ejecutarla
actualizarValorZ();
