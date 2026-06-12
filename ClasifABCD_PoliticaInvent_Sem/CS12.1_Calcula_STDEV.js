const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const math = require('mathjs');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf('_') + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;
const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

async function calcularDesviacionEstandar() {
  writeToLog('\nPaso 10 - Calculo STDEV Demanda y STDEV Costo');

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const histColl = db.collection('historico_demanda_sem');
    const abcdColl = db.collection('demanda_abcd_01_sem');
    const skuColl = db.collection('sku');

    await Promise.all([
      skuColl.createIndex(
        { Producto: 1, Ubicacion: 1 },
        { name: 'Producto_1_Ubicacion_1' }
      ),
      abcdColl.createIndex(
        { Producto: 1, Ubicacion: 1 },
        { name: 'Producto_1_Ubicacion_1' }
      )
    ]);

    const registros = await histColl.aggregate([
      {
        $group: {
          _id: {
            Producto: '$Producto',
            Ubicacion: '$Ubicacion',
            Week_Year: '$Week_Year'
          },
          Cantidad_Sem: { $sum: '$Cantidad_Sem' }
        }
      }
    ], { allowDiskUse: true }).toArray();

    const semanasUnicas = [...new Set(
      registros.map(registro => registro._id.Week_Year)
    )];
    const datosAgrupados = new Map();

    for (const registro of registros) {
      const clave = `${registro._id.Producto}@${registro._id.Ubicacion}`;
      if (!datosAgrupados.has(clave)) {
        datosAgrupados.set(clave, new Map());
      }
      datosAgrupados
        .get(clave)
        .set(registro._id.Week_Year, registro.Cantidad_Sem);
    }

    const skuDocs = await skuColl.find(
      {},
      { projection: { Producto: 1, Ubicacion: 1, Costo_Unidad: 1 } }
    ).toArray();
    const costosPorSKU = new Map(
      skuDocs.map(sku => [
        `${sku.Producto}@${sku.Ubicacion}`,
        sku.Costo_Unidad || 0
      ])
    );

    const operaciones = [];
    for (const [clave, semanas] of datosAgrupados) {
      const [producto, ubicacion] = clave.split('@');
      const vectorCantidad = semanasUnicas.map(
        semana => semanas.get(semana) || 0
      );
      const costo = costosPorSKU.get(clave) || 0;
      const vectorCosto = vectorCantidad.map(valor => valor * costo);

      operaciones.push({
        updateOne: {
          filter: { Producto: producto, Ubicacion: ubicacion },
          update: {
            $set: {
              STDEV_Demanda: math.std(vectorCantidad, 'uncorrected'),
              STDEV_Costo: math.std(vectorCosto, 'uncorrected')
            }
          }
        }
      });

      if (operaciones.length === 1000) {
        await abcdColl.bulkWrite(operaciones, { ordered: false });
        operaciones.length = 0;
      }
    }

    if (operaciones.length > 0) {
      await abcdColl.bulkWrite(operaciones, { ordered: false });
    }

    writeToLog('\tTermina el Calculo STDEV Demanda y STDEV Costo');
  } catch (error) {
    writeToLog(`Error: ${error}`);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

calcularDesviacionEstandar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
