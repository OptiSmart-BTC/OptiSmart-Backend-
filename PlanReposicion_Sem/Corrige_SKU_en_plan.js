const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

async function actualizarSKU() {
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db();
    const col = db.collection('plan_reposicion_01_sem');

    const result = await col.updateMany({}, [
      {
        $set: {
          SKU: { $concat: [ { $toString: "$Producto" }, "@", { $toString: "$Ubicacion" } ] }
        }
      }
    ]);

    console.log(` SKU actualizado para ${result.modifiedCount} documentos`);
  } catch (error) {
    console.error(' Error actualizando SKU:', error);
  } finally {
    await client.close();
  }
}

actualizarSKU();
