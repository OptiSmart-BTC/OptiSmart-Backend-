// CS10_Calcula_Desviacion_STD_Demanda_Costos.js
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
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

async function calcularDesviacionEstandar() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 10 - Calculo STDEV Demanda y STDEV Costo`);

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);

  const histColl = db.collection('historico_demanda_sem');
  const abcdColl = db.collection('demanda_abcd_01_sem');
  const skuColl = db.collection('sku');

  // Agrupar por Producto + Ubicacion y Week_Year
  const registros = await histColl.aggregate([
    {
      $group: {
        _id: {
          Producto: "$Producto",
          Ubicacion: "$Ubicacion",
          Week_Year: "$Week_Year"
        },
        Cantidad_Sem: { $sum: "$Cantidad_Sem" }
      }
    }
  ]).toArray();

  // Agrupar por clave (Producto+Ubicacion)
  const datosAgrupados = {};
  for (const r of registros) {
    const clave = `${r._id.Producto}@${r._id.Ubicacion}`;
    if (!datosAgrupados[clave]) datosAgrupados[clave] = [];
    datosAgrupados[clave].push({
      week: r._id.Week_Year,
      cantidad: r.Cantidad_Sem
    });
  }

  for (const clave in datosAgrupados) {
    const [producto, ubicacion] = clave.split("@");
    const semanas = datosAgrupados[clave];

    // Obtener todas las semanas únicas del histórico para esta ejecución
    const semanasUnicas = [...new Set(registros.map(r => r._id.Week_Year))];

    // Construir vector con ceros donde no haya datos
    const vectorCantidad = semanasUnicas.map(sem => {
      const match = semanas.find(s => s.week === sem);
      return match ? match.cantidad : 0;
    });

    // Obtener costo unidad
    const skuData = await skuColl.findOne({ Producto: producto, Ubicacion: ubicacion });
    const costo = skuData?.Costo_Unidad || 0;

    const vectorCosto = vectorCantidad.map(val => val * costo);

    const stdevCantidad = math.std(vectorCantidad, 'uncorrected');
    const stdevCosto = math.std(vectorCosto, 'uncorrected');

    // Actualizar en demanda_abcd_01_sem
    await abcdColl.updateOne(
      { Producto: producto, Ubicacion: ubicacion },
      { $set: {
          STDEV_Demanda: stdevCantidad,
          STDEV_Costo: stdevCosto
        } }
    );
  }

  writeToLog(`\tTermina el Calculo STDEV Demanda y STDEV Costo`);
  await client.close();
}

calcularDesviacionEstandar().catch(error => writeToLog(`Error: ${error}`));