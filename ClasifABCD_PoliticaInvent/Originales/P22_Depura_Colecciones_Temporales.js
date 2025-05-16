const { MongoClient } = require('mongodb');

const mongoURI = 'mongodb://AccUserS003:5h2IWoLkVUyB@127.0.0.1:27017/btc_opti_ACCELERIUM5?authSource=admin'; // Actualiza con tu URI de MongoDB

async function eliminarColecciones() {
  try {
    const client = await MongoClient.connect(mongoURI, { useNewUrlParser: true });
    const db = client.db();

    // Array con los nombres de las colecciones a eliminar
    const colecciones = [
      'historico_agrupado',
      'demanda_abcd_01',
      'demanda_calculada',
      'demanda_ordenada_desc',
      'historico_demanda',
      'politica_inventarios_01',
      'politica_inventarios_costo',
      'sku',
      'ui_demanda_abcd',
      'ui_pol_inv_costo',
      'ui_pol_inv_dias_cobertura',
      'ui_pol_inv_pallets',
      'ui_politica_inventarios',
      'historico_agrupado_sem',
      'demanda_abcd_01_sem',
      'demanda_calculada_sem',
      'demanda_ordenada_desc_sem',
      'historico_demanda_sem',
      'politica_inventarios_01_sem',
      'politica_inventarios_costo_sem',
      'ui_sem_demanda_abcd',
      'ui_sem_pol_inv_costo',
      'ui_sem_pol_inv_dias_cobertura',
      'ui_sem_pol_inv_pallets',
      'ui_sem_politica_inventarios',
      'inventario_disponible',
      'inventario_transito',
      'plan_reposicion_01',
      'requerimientos_confirmados',
      'ui_all_pol_inv',
      'ui_all_pol_invs',
      'ui_plan_reposicion',
      'ui_pol_inv_uom',
      'ui_sem_all_pol_inv',
      'ui_sem_pol_inv_uom',
      'plan_reposicion_01_sem',
      'report_invdisp_vs_polinv_ss_cantidad_0',
      'report_invtrans_vs_polinv_ss_cantidad_0',
      'report_requconf_vs_polinv_ss_cantidad_0',
      'report_sin_sku_histdemand_vs_sku',
      'report_sin_sku_invdisp_vs_sku',
      'report_sin_sku_reqconf_vs_sku',
      'ui_sem_plan_reposicion',
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
