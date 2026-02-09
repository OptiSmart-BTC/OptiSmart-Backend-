
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`;

async function actualizarClasificacionABCD() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 14.1 - Calculo de la Clasificación ABCD Final (versión segura)`);

  const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db(dbName);

  const demandaData = await db.collection('demanda_abcd_01').find().toArray();
  let omitidos = 0;
  let procesados = 0;

  for (const demandaItem of demandaData) {
    const skuItem = await db.collection('sku').findOne({ SKU: demandaItem.SKU });

    if (!skuItem) {
      writeToLog(`SKU omitido (no encontrado): ${demandaItem.SKU}`);
      omitidos++;
      continue;
    }

    const parametrosUsuario = await db.collection('parametros_usuario').findOne({
      ID: demandaItem.Clasificacion_Variabilidad + demandaItem.Clasificacion_Margen + demandaItem.Clasificacion_Demanda,
      Tipo: 'Variabilidad'
    });

    if (demandaItem.Override_SI_NO === 'NO') {
      if (skuItem.OverrideClasificacionABCD && skuItem.OverrideClasificacionABCD !== '-') {
        await db.collection('demanda_abcd_01').updateOne(
          { _id: demandaItem._id },
          { $set: { Clasificacion_ABCD: skuItem.OverrideClasificacionABCD } }
        );
        procesados++;
      } else if (parametrosUsuario && parametrosUsuario.Clasificacion_ABCD) {
        await db.collection('demanda_abcd_01').updateOne(
          { _id: demandaItem._id },
          { $set: { Clasificacion_ABCD: parametrosUsuario.Clasificacion_ABCD } }
        );
        procesados++;
      } else {
        writeToLog(`Clasificación omitida (sin override ni parámetro): SKU=${demandaItem.SKU}`);
        omitidos++;
      }
    } else {
      if (skuItem.OverrideClasificacionABCD && skuItem.OverrideClasificacionABCD !== '-') {
        await db.collection('demanda_abcd_01').updateOne(
          { _id: demandaItem._id },
          { $set: { Clasificacion_ABCD: skuItem.OverrideClasificacionABCD } }
        );
        procesados++;
      } else {
        writeToLog(`Override activo pero sin valor válido: SKU=${demandaItem.SKU}`);
        omitidos++;
      }
    }
  }

  await db.collection('demanda_abcd_01').updateMany(
    { Demanda_Promedio_Diaria_Costo: 0 },
    { $set: { Clasificacion_ABCD: "SIN DEMANDA" } }
  );

  writeToLog(`Clasificación completada. Procesados: ${procesados}, Omitidos: ${omitidos}`);
  client.close();
}

function writeToLog(message) {
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  const logMessage = `[${timestamp}] ${message}`;

  try {
    const logFile = path.resolve(__dirname, `../../${parametroFolder}/log/ClasABCD_PolInvent.log`);
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, logMessage + '\n');
  } catch (err) {
    const fallbackLogFile = path.join(__dirname, 'Clasificacion_Fallback.log');
    fs.appendFileSync(fallbackLogFile, logMessage + '\n');
    console.error(`Fallback log: ${logMessage}`);
  }

  console.log(logMessage);
}

actualizarClasificacionABCD();
