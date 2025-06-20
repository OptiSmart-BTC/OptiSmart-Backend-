const fs = require('fs');
const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const now = moment().format('YYYY-MM-DD HH:mm:ss');


const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../../Configuraciones/ConexionDB');
//const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);
const { DBUser, DBPassword } = require(`../../../${parametroFolder}/cfg/dbvars`);
const logFile = `../../../${parametroFolder}/log/Logs_demanda.log`; 
const csvPath = `../../../${parametroFolder}/reportes/historico_demanda_cantidad_0.csv`;
const user = parametroFolder.toLowerCase(); // Convertir a mayúsculas para el nombre de usuario
const collectionName = `historico_demanda_${user}`; // Concatenación de la colección con el nombre del usuario

const csvWriterOptions = {
  path: csvPath,
  header: [
    { id: 'Producto', title: 'Producto' },
    { id: 'Canal', title: 'Canal' },
    { id: 'Ubicacion', title: 'Ubicacion' },
    { id: 'Fecha', title: 'Fecha' },
    { id: 'Cantidad', title: 'Cantidad' }
  ]
};

// Función principal
async function exportarYEliminarRegistros() {
  let client;
  writeToLog(`\nPaso 07 - Limpieza de registros con Cantidad igual a 0`);

  try {
    const passadminDeCripta = await getDecryptedPassadmin();
    const url = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
    client = await MongoClient.connect(url);
    const db = client.db(dbName);

    const collection = db.collection(collectionName);

    // Verificar registros antes de la limpieza
    const countBefore = await collection.countDocuments();
    writeToLog(`\tNúmero de registros antes de la limpieza: ${countBefore}`);

    // Obtener los registros con Cantidad igual a 0
    const registros = await collection.find({ Cantidad: 0 }).toArray();
    writeToLog(`\tNúmero de registros con Cantidad igual a 0: ${registros.length}`);

    if (registros.length === 0) {
      writeToLog(`\tNo se encontraron registros Cantidad igual a 0.`);
      return;
    }

    // Eliminar el archivo CSV si existe
    if (fs.existsSync(csvPath)) {
      fs.unlinkSync(csvPath);
    }

    // Exportar los registros a un nuevo archivo CSV
    const registrosFormateados = registros.map(registro => {
      const fecha = registro.Fecha.toISOString().substring(8, 10) + '-' +
        registro.Fecha.toISOString().substring(5, 7) + '-' +
        registro.Fecha.toISOString().substring(0, 4);

      return {
        Producto: registro.Producto,
        Canal: registro.Canal,
        Ubicacion: registro.Ubicacion,
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
