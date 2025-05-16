const fs = require('fs');
const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const now = moment().format('YYYY-MM-DD HH:mm:ss');
const collectionName = 'historico_demanda';

const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
//const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/dbvars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`; 
const csvPath = `../../${parametroFolder}/reportes/historico_demanda_cantidad_0.csv`;

const csvWriterOptions = {
  path: csvPath,
  header: [
    { id: 'Ubicacion', title: 'Ubicación' },
    { id: 'Producto', title: 'Producto' },
    { id: 'Fecha', title: 'Fecha' },
    { id: 'Cantidad', title: 'Cantidad' }
  ]
};

// Función principal
async function exportarYEliminarRegistros() {
  let client; // Declaración de la variable client
  writeToLog(`\nPaso 07 - Limpieza de registros con Cantidad igual a 0`);

  try {

    // Comprueba si el archivo existe
    if (fs.existsSync(csvPath)) {
      // Elimina el archivo si existe
      fs.unlinkSync(csvPath);
      console.log(`El archivo ${csvPath} ha sido eliminado.`);
    } else {
      console.log(`El archivo ${csvPath} no existe, no se ha realizado ninguna acción.`);
    }

    

    // Conectarse a la base de datos
    const passadminDeCripta = await getDecryptedPassadmin();
    const url = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
    client = await MongoClient.connect(url);
    const db = client.db(dbName);

    // Obtener los registros con Cantidad igual a 0
    const collection = db.collection(collectionName);
    const registros = await collection.find({ Cantidad: 0 }).toArray();

    if (registros.length === 0) {
      writeToLog(`\tNo se encontraron registros Cantidad igual a 0.`);
      return;
    }

    // Eliminar el archivo CSV si existe
    if (fs.existsSync(csvPath)) {
      fs.unlinkSync(csvPath);
      //writeToLog(`\tSe eliminó el archivo ${csvPath} existente.`);
    }

    // Exportar los registros a un nuevo archivo CSV
    const registrosFormateados = registros.map(registro => {
      const fecha = registro.Fecha.toISOString().substring(8, 10) + '-' +
        registro.Fecha.toISOString().substring(5, 7) + '-' +
        registro.Fecha.toISOString().substring(0, 4);

      return {
        Ubicacion: registro.Ubicacion,
        Producto: registro.Producto,
        Fecha: fecha,
        Cantidad: registro.Cantidad
      };
    });

    const csvWriter = createCsvWriter(csvWriterOptions);
    await csvWriter.writeRecords(registrosFormateados);

    // Eliminar los registros de la colección
    await collection.deleteMany({ Cantidad: 0 });

    writeToLog(`\tSe encontraron registros con Cantidad igual a 0, revisar historico_demanda_cantidad_0.csv para más detalle.`);
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
  } finally {
    if (client) {
      client.close(); // Cerrar la conexión a la base de datos
    }
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

// Ejecutar la función principal
exportarYEliminarRegistros();
