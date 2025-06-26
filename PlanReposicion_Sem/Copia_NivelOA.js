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

    let totalActualizados = 0;
    let totalFallidos = 0;

    for (const sku of skuData) {
      const producto = String(sku.Producto).padStart(5, '0');
      const ubicacion = String(sku.Ubicacion).padStart(4, '0');
      const expectedSKU = sku.SKU?.includes('@')
        ? sku.SKU.trim().toUpperCase()
        : `${producto}@${ubicacion}`;

      const origenAbasto = sku.Origen_Abasto ? String(sku.Origen_Abasto).padStart(4, '0').toUpperCase() : '';

      const result = await planRepo.updateMany(
        { SKU: expectedSKU },
        {
          $set: {
            Nivel_OA: sku.Nivel_OA,
            Origen_Abasto: origenAbasto
          }
        }
      );

      if (result.modifiedCount > 0) {
        totalActualizados += result.modifiedCount;
        console.log(` ${expectedSKU} actualizado (${result.modifiedCount} documentos)`);
      } else {
        totalFallidos++;
        console.log(`  ${expectedSKU} no encontrado en plan_reposicion_01_sem`);
      }
    }

    console.log(`\n Copia completada.`);
    console.log(` Documentos actualizados: ${totalActualizados}`);
    console.log(` Documentos sin coincidencia: ${totalFallidos}\n`);
  } catch (error) {
    console.error(' ERROR en Copia_NivelOA:', error.message);
  } finally {
    await client.close();
  }
}

copiarNivelOA();
