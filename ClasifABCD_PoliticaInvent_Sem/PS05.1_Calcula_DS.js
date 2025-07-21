const fs = require("fs");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");
const math = require("mathjs");

const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;

const coleccionHistorico = "historico_demanda_sem";
const coleccionPolitica = "politica_inventarios_01_sem";

function writeToLog(message) {
  fs.appendFileSync(logFile, message + "\n");
}

async function calcularDSDemandaSemanal() {
  writeToLog(`\nPaso 05 (alt) - Calculo de la DS_Demanda con math.js (SEMANAL)`);

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const historico = db.collection(coleccionHistorico);
    const politica = db.collection(coleccionPolitica);

    // ✅ Obtener todas las semanas únicas como horizonte (de otras funciones o predefinidas)
    const semanasHorizonteDocs = await historico.aggregate([
      {
        $group: {
          _id: "$Week_Year"
        }
      }
    ]).toArray();
    const semanasHorizonte = semanasHorizonteDocs.map(d => d._id).sort(); // ← tu arreglo base

    // ✅ Agrupar demanda por producto-ubicación-semana
    const registros = await historico.aggregate([
      {
        $match: {
          Cantidad_Sem: { $ne: null }
        }
      },
      {
        $group: {
          _id: {
            Producto: "$Producto",
            Ubicacion: "$Ubicacion",
            Week_Year: "$Week_Year"
          },
          cantidad: { $sum: "$Cantidad_Sem" }
        }
      }
    ]).toArray();

    // ✅ Agrupar por SKU y mapear cantidades
    const agrupado = new Map();
    for (const doc of registros) {
      const key = `${doc._id.Producto}@${doc._id.Ubicacion}`;
      if (!agrupado.has(key)) agrupado.set(key, {});
      agrupado.get(key)[doc._id.Week_Year] = doc.cantidad;
    }

    const resultados = [];

    for (const [key, cantidadesPorSemana] of agrupado.entries()) {
      const [Producto, Ubicacion] = key.split("@");

      const vector = semanasHorizonte.map(sem => cantidadesPorSemana[sem] ?? 0);
      const desviacion = math.std(vector);

      resultados.push({ Producto, Ubicacion, DS_Demanda: parseFloat(desviacion.toFixed(5)) });
    }

    // ✅ Actualizar los calculados
    for (const item of resultados) {
      await politica.updateOne(
        { Producto: item.Producto, Ubicacion: item.Ubicacion },
        { $set: { DS_Demanda: item.DS_Demanda } }
      );
    }

    // ✅ Rellenar con 0s los que no se actualizaron
    const fillResult = await politica.updateMany(
      { DS_Demanda: { $exists: false } },
      { $set: { DS_Demanda: 0 } }
    );
    writeToLog(`\tSe rellenaron ${fillResult.modifiedCount} registros con DS_Demanda = 0`);

    writeToLog(`\tTermina el Calculo de DS_Demanda semanal con math.js`);
  } catch (error) {
    writeToLog(`${moment().format("YYYY-MM-DD HH:mm:ss")} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

calcularDSDemandaSemanal();