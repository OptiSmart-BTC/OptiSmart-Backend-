const { MongoClient } = require('mongodb');

async function main() {
  const uri = 'mongodb://AccUserS003:5h2IWoLkVUyB@127.0.0.1:27017/?authSource=admin'; // Cambia esto por tu URI de conexión
  const client = new MongoClient(uri);

  try {
    await client.connect();
    
    const database = client.db('btc_opti_ACCELERIUM5'); // Cambia esto por el nombre de tu base de datos
    //const db = client.db(dbName);
    const skuCollection = database.collection('sku');
    const historiaCollection = database.collection('historico_demanda');
    const clasificacionCollection = database.collection('demanda_abcd_01');

    const skus = await skuCollection.find().toArray();

    for (const sku of skus) {
      const { SKU,Producto, Ubicacion, Override_Min_Politica_Inventarios, Override_Max_Politica_Inventarios } = sku;

      if ((Override_Min_Politica_Inventarios !== null && Override_Min_Politica_Inventarios !== '') || (Override_Max_Politica_Inventarios !== null && Override_Max_Politica_Inventarios !== '')) {
        const historia = await historiaCollection.findOne({ SKU });

        if (historia) {
          const clasificacion = await clasificacionCollection.findOne({ SKU });

          if (!clasificacion) {
            const nuevoClasificacion = {
              Tipo_Calendario:"Dia",
              SKU,
              Producto,
              Desc_Producto:"",
              Familia_Producto:"",
              Categoria:"",	
              Segmentacion_Producto:"",
              Presentacion:"",
              Ubicacion,
              Desc_Ubicacion:"",
              Demanda_Costo: 0,
              Demanda_Promedio_Diaria_Costo: 0,
              Clasificacion_Demanda: ""
            };

            await clasificacionCollection.insertOne(nuevoClasificacion);

            console.log(`Insertado SKU: ${SKU} en CLASIFICACION`);
          } else {
            console.log(`SKU: ${SKU} ya existe en CLASIFICACION, no se hace nada.`);
          }
        }
      }
    }
  } finally {
    await client.close();
  }
}

main().catch(console.error);
