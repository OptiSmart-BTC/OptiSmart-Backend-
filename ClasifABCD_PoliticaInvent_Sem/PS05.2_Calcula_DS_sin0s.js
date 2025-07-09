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

async function calcularDSDemandaSin0s() {
  writeToLog(`\nPaso 05.2 - Calculo de DS_Demanda_sin0s (SEMANAL)`);

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const historico = db.collection(coleccionHistorico);
    const politica = db.collection(coleccionPolitica);

    // Agrupar demanda por producto-ubicación
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
            Ubicacion: "$Ubicacion"
          },
          cantidades: { $push: "$Cantidad_Sem" }
        }
      }
    ]).toArray();

    for (const item of registros) {
      const desviacion = math.std(item.cantidades || []);
      await politica.updateOne(
        { Producto: item._id.Producto, Ubicacion: item._id.Ubicacion },
        { $set: { DS_Demanda_sin0s: parseFloat(desviacion.toFixed(5)) } }
      );
    }

    writeToLog(`\tTermina el Calculo de DS_Demanda_sin0s`);
  } catch (error) {
    writeToLog(`${moment().format("YYYY-MM-DD HH:mm:ss")} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

calcularDSDemandaSin0s();
