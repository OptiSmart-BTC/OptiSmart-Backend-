const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

async function copiarNivelOA() {
  console.log('\n🟢 INICIO: Copia de Nivel_OA y Origen_Abasto desde colección `sku` hacia `plan_reposicion_01_sem`\n');

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);

    const skuData = await db.collection('sku').find({ Nivel_OA: { $exists: true } }).toArray();
    const planRepo = db.collection('plan_reposicion_01_sem');

    const operaciones = skuData.map((sku) => {
      const producto = String(sku.Producto ?? '').trim();
      const ubicacion = String(sku.Ubicacion ?? '').trim();
      const expectedSKU = sku.SKU?.includes('@')
        ? sku.SKU.trim()
        : `${producto}@${ubicacion}`;

      const origenAbasto = sku.Origen_Abasto ? String(sku.Origen_Abasto).trim() : '';

      return {
        updateMany: {
          filter: { SKU: expectedSKU },
          update: {
            $set: {
              Nivel_OA: Number(sku.Nivel_OA) || 1,
              Origen_Abasto: origenAbasto
            }
          }
        }
      };
    });

    let totalCoincidencias = 0;
    let totalActualizados = 0;
    const batchSize = 1000;

    for (let i = 0; i < operaciones.length; i += batchSize) {
      const result = await planRepo.bulkWrite(
        operaciones.slice(i, i + batchSize),
        { ordered: false }
      );
      totalCoincidencias += result.matchedCount;
      totalActualizados += result.modifiedCount;
    }

    console.log(`\n Copia completada.`);
    console.log(` Documentos encontrados: ${totalCoincidencias}`);
    console.log(` Documentos actualizados: ${totalActualizados}`);
    console.log(` SKUs sin coincidencia: ${skuData.length - totalCoincidencias}\n`);
  } catch (error) {
    console.error(' ERROR en Copia_NivelOA:', error.message);
  } finally {
    await client.close();
  }
}

copiarNivelOA();
