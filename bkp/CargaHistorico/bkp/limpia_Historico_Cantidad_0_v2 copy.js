const MongoClient = require('mongodb').MongoClient;
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Configuración de la conexión a MongoDB
const url = 'mongodb://127.0.0.1:27017';
const dbName = 'btc_opti_01RT';
const collectionName = 'historico_demanda';

// Configuración del archivo CSV
const csvWriter = createCsvWriter({
  path: `../../01RT/historico_demanda_cantidad_0.csv`,
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
    //await collection.deleteMany({ CantidadFacturada: 0 });

    console.log('Exportación y eliminación completadas.');
  } catch (error) {
    console.error('Ocurrió un error:', error);
  } finally {
    if (client) {
      client.close(); // Cerrar la conexión a la base de datos
    }
  }
}

// Ejecutar la función principal
exportarYEliminarRegistros();
