const fs = require('fs');
const moment = require('moment');

const MongoClient = require('mongodb').MongoClient;
const createCsvWriter = require('csv-writer').createObjectCsvWriter;


// Configuración de la conexión a MongoDB
const { host, puerto } = require('../Configuraciones/ConexionDB');
const dbName = process.argv.slice(2)[0];
const url = `mongodb://${host}:${puerto}/${dbName}`;
const collectionName = 'historico_demanda';

const parametroFolder = process.argv.slice(2)[1];
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`; // Cambia esta ruta según la ubicación de tu archivo CSV


// Configuración del archivo CSV
const csvWriter = createCsvWriter({
  path: `../../${parametroFolder}/historico_demanda_cantidad_0.csv`,
  header: [
    { id: 'Ubicacion', title: 'Ubicación' },
    { id: 'Producto', title: 'Producto' },
    { id: 'Fecha', title: 'Fecha' },
    { id: 'CantidadFacturada', title: 'Cantidad Facturada' }
  ]
});

// Función principal
async function exportarYEliminarRegistros() {
  let client; // Declaración de la variable client
  //writeToLog(`\n`);
  writeToLog(`\nPaso 06 - Limpieza de registros con Cantidad Facturada igual a 0`);

  try {
    // Conectarse a la base de datos
    client = await MongoClient.connect(url);
    const db = client.db(dbName);

    // Obtener los registros con CantidadFacturada igual a 0
    const collection = db.collection(collectionName);
    const registros = await collection.find({ CantidadFacturada: 0 }).toArray();

    // Exportar los registros a un archivo CSV
    const registrosFormateados = registros.map(registro => {
      const fecha = registro.Fecha.toISOString().substring(8, 10) + '-' +
        registro.Fecha.toISOString().substring(5, 7) + '-' +
        registro.Fecha.toISOString().substring(0, 4);

      return {
        Ubicacion: registro.Ubicacion,
        Producto: registro.Producto,
        Fecha: fecha,
        CantidadFacturada: registro.CantidadFacturada
      };
    });

    await csvWriter.writeRecords(registrosFormateados);

    // Eliminar los registros de la colección
    await collection.deleteMany({ CantidadFacturada: 0 });

    //console.log('Exportación y eliminación completadas.');
    writeToLog(`\tExportación y eliminación completadas.`);
  } catch (error) {
    //console.error('Ocurrió un error:', error);
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

// Ejecutar la función principal
exportarYEliminarRegistros();
