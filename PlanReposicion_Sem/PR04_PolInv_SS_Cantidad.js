const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion_Se,.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection1 = 'plan_reposicion_01_sem';
const collection2 = 'politica_inventarios_01_sem';

async function actualizarDatos() {
  writeToLog(`\nPaso 04 - Campos relacionados a la Politica de Inventario`);
  writeToLog(`\t-Inventario de Seguridad (SS Cantidad)`);
  writeToLog(`\t-Punto de reorden (ROP)`);
  writeToLog(`\t-Inventario objetivo (META)`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const col1 = db.collection(collection1);
    const col2 = db.collection(collection2);

    const docs = await col1.find({}).toArray();
    const politicas = await col2.find({}).toArray();

    const poliMap = new Map();
    politicas.forEach(p => {
      poliMap.set(`${p.SKU}_${p.Ubicacion}`, p);
    });

    const updates = docs.map(doc => {
      const match = poliMap.get(`${doc.SKU}_${doc.Ubicacion}`);
      if (!match) return null;

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              SS_Cantidad: match.SS_Cantidad ?? 0,
              ROP: match.ROP ?? 0,
              META: match.META ?? 0
            }
          }
        }
      };
    }).filter(Boolean);

    if (updates.length > 0) {
      await col1.bulkWrite(updates);
    }

    writeToLog(`\tTermina el Calculo de la Política de Inventario (${updates.length} registros actualizados)`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

actualizarDatos().catch(console.error);
