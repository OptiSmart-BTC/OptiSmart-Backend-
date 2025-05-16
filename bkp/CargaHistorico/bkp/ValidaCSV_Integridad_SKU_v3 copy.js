const { MongoClient } = require('mongodb');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const mongoUri = 'mongodb://127.0.0.1:27017';
const dbName = 'btc_opti_CR001';

// Configuración para generar el archivo CSV
const csvWriter = createCsvWriter({
  path: `../../CR001/skus_no_encontrados.csv`,
  header: [
    //{ id: 'SKU', title: 'SKU' },
    { id: 'Ubicacion', title: 'Ubicacion' },
    { id: 'Producto', title: 'Producto' },
    { id: 'Fecha', title: 'Fecha' },
    { id: 'CantidadFacturada', title: 'CantidadFacturada' },
  ],
});

async function main() {
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const skuCollection = db.collection('sku');
    const historicoDemandaCollection = db.collection('historico_demanda');

    // Obtener todos los SKUs de la colección "sku"
    const skuDocs = await skuCollection.find({}).toArray();
    const skus = skuDocs.map((doc) => doc.SKU);

    // Obtener los registros del historial de demanda que no tienen SKU en la colección "sku"
    const skusNoEncontrados = await historicoDemandaCollection
      .find({ SKU: { $nin: skus } })
      .toArray();

    // Formatear la fecha en el formato "DD/MM/YYYY"
    const registrosFormateados = skusNoEncontrados.map((registro) => {
      const fecha = registro.Fecha.toISOString().substring(8, 10) + '/' +
        registro.Fecha.toISOString().substring(5, 7) + '/' +
        registro.Fecha.toISOString().substring(0, 4);

      return {
        //SKU: registro.SKU,
        Ubicacion: registro.Ubicacion,
        Producto: registro.Producto,
        Fecha: fecha,
        CantidadFacturada: registro.CantidadFacturada,
      };
    });

    // Generar el archivo CSV con los registros no encontrados
    await csvWriter.writeRecords(registrosFormateados);
    console.log('Archivo CSV generado con éxito: skus_no_encontrados.csv');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

main().catch(console.error);