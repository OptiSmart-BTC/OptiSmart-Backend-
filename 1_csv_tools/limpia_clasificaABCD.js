const { MongoClient } = require('mongodb');

const mongoURI = 'mongodb://127.0.0.1:27017/btc_opti_a001'; // Actualiza con tu URI de MongoDB

async function eliminarColecciones() {
  try {
    const client = await MongoClient.connect(mongoURI, { useNewUrlParser: true });
    const db = client.db();

    // Array con los nombres de las colecciones a eliminar
    const colecciones = [
      'demanda_abcd_01',
      'ui_demanda_abcd',
      'demanda_calculada',
      'demanda_ordenada_desc'
    ];

    // Eliminar las colecciones
    for (const coleccion of colecciones) {
      try {
        await db.dropCollection(coleccion);
        console.log(`La colección '${coleccion}' ha sido eliminada.`);
      } catch (error) {
        if (error.codeName === 'NamespaceNotFound') {
          console.log(`La colección '${coleccion}' no existe en la base de datos.`);
        } else {
          throw error; // Propaga el error si no es una excepción de colección no encontrada
        }
      }
    }

    console.log('Eliminación de colecciones completada.');
    client.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

eliminarColecciones();
