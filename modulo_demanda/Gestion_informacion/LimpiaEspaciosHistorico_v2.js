const fs = require('fs');
const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../../${parametroFolder}/cfg/dbvars`);
const logFile = `../../../${parametroFolder}/log/Logs_demanda.log`; 
const csvPath = `../../../${parametroFolder}/reportes/historico_demanda_cantidad_0.csv`;
const user = parametroFolder.toLowerCase(); 
const collectionName = `historico_demanda_${user}`;

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
    writeToLog(`\tIniciando conexión a MongoDB...`);
    const passadminDeCripta = await getDecryptedPassadmin();
    writeToLog(`\tContraseña desencriptada correctamente.`);
    
    const url = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
    writeToLog(`\tIntentando conectar a MongoDB: ${host}:${puerto}/${dbName}`);
    
    client = await MongoClient.connect(url);
    writeToLog(`\tConexión establecida correctamente.`);
    
    const db = client.db(dbName);
    writeToLog(`\tBase de datos seleccionada: ${dbName}`);

    const collection = db.collection(collectionName);
    writeToLog(`\tColección seleccionada: ${collectionName}`);

    // Verificar registros antes de la limpieza
    const countBefore = await collection.countDocuments();
    writeToLog(`\tNúmero de registros antes de la limpieza: ${countBefore}`);

    if (countBefore === 0) {
      writeToLog(`\tATENCIÓN: La colección ${collectionName} está vacía antes de iniciar la limpieza!`);
      return;
    }

    // Obtener ejemplos de registros para diagnóstico
    const ejemplos = await collection.find().limit(3).toArray();
    writeToLog(`\tEjemplos de registros en la colección (primeros 3):`);
    ejemplos.forEach((ejemplo, index) => {
      writeToLog(`\t\tRegistro ${index + 1}: ${JSON.stringify(ejemplo)}`);
    });

    // Obtener los registros con Cantidad igual a 0
    const registros = await collection.find({ Cantidad: 0 }).toArray();
    writeToLog(`\tNúmero de registros con Cantidad igual a 0: ${registros.length}`);

    if (registros.length === 0) {
      writeToLog(`\tNo se encontraron registros con Cantidad igual a 0.`);
      return;
    }

    // Comprueba si existe la carpeta de reportes
    const reporteDir = `../../../${parametroFolder}/reportes`;
    if (!fs.existsSync(reporteDir)) {
      fs.mkdirSync(reporteDir, { recursive: true });
      writeToLog(`\tSe creó el directorio para reportes: ${reporteDir}`);
    }

    // Eliminar el archivo CSV si existe
    if (fs.existsSync(csvPath)) {
      fs.unlinkSync(csvPath);
      writeToLog(`\tSe eliminó el archivo CSV existente: ${csvPath}`);
    }

    // Exportar los registros a un nuevo archivo CSV
    try {
      const registrosFormateados = registros.map(registro => {
        const fecha = registro.Fecha instanceof Date ?
          registro.Fecha.toISOString().substring(8, 10) + '-' +
          registro.Fecha.toISOString().substring(5, 7) + '-' +
          registro.Fecha.toISOString().substring(0, 4) : 'fecha inválida';

        return {
          Producto: registro.Producto || 'no definido',
          Canal: registro.Canal || 'no definido',
          Ubicacion: registro.Ubicacion || 'no definido',
          Fecha: fecha,
          Cantidad: registro.Cantidad || 0
        };
      });

      const csvWriter = createCsvWriter(csvWriterOptions);
      await csvWriter.writeRecords(registrosFormateados);
      writeToLog(`\tSe exportaron ${registrosFormateados.length} registros al archivo CSV.`);
    } catch (csvError) {
      writeToLog(`\tError al exportar a CSV: ${csvError}`);
    }

    // Eliminar los registros de la colección
    const deleteResult = await collection.deleteMany({ Cantidad: 0 });
    writeToLog(`\tSe eliminaron ${deleteResult.deletedCount} registros con Cantidad igual a 0.`);

    // Verificar registros después de la limpieza
    const countAfter = await collection.countDocuments();
    writeToLog(`\tNúmero de registros después de la limpieza: ${countAfter}`);
    
    if (countBefore !== countAfter) {
      writeToLog(`\tSe eliminaron registros: ${countBefore - countAfter}`);
    }

    writeToLog(`\tSe encontraron registros con Cantidad igual a 0, revisar historico_demanda_cantidad_0.csv para más detalle.`);
  } catch (error) {
    writeToLog(`\tERROR en limpia_Historico_Cantidad_0_v6.js: ${error}`);
    console.error('Error:', error);
  } finally {
    if (client) {
      client.close();
      writeToLog(`\tConexión a MongoDB cerrada.`);
    }
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
  console.log(message);
}

// Obtener el valor desencriptado de passadmin
async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    writeToLog(`\tError al desencriptar el passadmin: ${error}`);
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}

// Ejecutar la función principal
exportarYEliminarRegistros();
