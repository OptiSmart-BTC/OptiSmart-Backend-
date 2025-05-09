const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];     // ejemplo: btc_opti_PBI
const DBUser = process.argv[3];     // usuario
const DBPassword = process.argv[4]; // password

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const collectionName = 'plan_reposicion_01';

async function verificarMatch() {
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const coleccion = db.collection(collectionName);

    const docNivel2 = await coleccion.findOne({ SKU: "00202@0024" });

    if (!docNivel2) {
      console.log(" No se encontró el documento de Nivel 2 con SKU 00202@0024");
      return;
    }

    // Extraemos el código del producto desde el SKU directamente
    const codigo = docNivel2.SKU.split('@')[0].trim().toUpperCase();
    const ubicacion = docNivel2.Ubicacion.trim().toUpperCase();
    const nivel = docNivel2.Nivel_OA;

    const abastecidos = await coleccion.find({
      SKU: { $regex: new RegExp(`^${codigo}@`, 'i') },
      Origen_Abasto: ubicacion,
      Nivel_OA: nivel - 1,
      Plan_Reposicion_Cantidad: { $gt: 0 }
    }).toArray();

    if (abastecidos.length > 0) {
      console.log(" Se encontraron documentos en Nivel 1 que deberían ser abastecidos por Nivel 2:");
      console.table(abastecidos.map(doc => ({
        SKU: doc.SKU,
        Origen_Abasto: doc.Origen_Abasto,
        Plan_Reposicion_Cantidad: doc.Plan_Reposicion_Cantidad
      })));
    } else {
      console.log(" NO se encontraron documentos en Nivel 1 que el SKU 00202@0024 pueda abastecer.");
    }
  } catch (err) {
    console.error(" Error de conexión o consulta:", err.message);
  } finally {
    await client.close();
  }
}

verificarMatch();
