const { MongoClient } = require('mongodb');

const mongoURI = 'mongodb://dbCFEX:passdb12@127.0.0.1:27017/btc_opti_CFEX?authSource=admin'; // Actualiza con tu URI de MongoDB

async function eliminarColecciones() {
  try {
    const client = await MongoClient.connect(mongoURI, { useNewUrlParser: true });
    const db = client.db();

    // Array con los nombres de las colecciones a eliminar
    const colecciones = [
      'demanda_abcd_01',
      'demanda_calculada',
      'demanda_ordenada_desc',
      'historico_demanda',
      'política_inventarios_01',
      'política_inventarios_costo',
      'sku',
      'ui_demanda_abcd',
      'ui_pol_inv_costo',
      'ui_pol_inv_dias_cobertura',
      'ui_pol_inv_pallets',
      'ui_política_inventarios'
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
