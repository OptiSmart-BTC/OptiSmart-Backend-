const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection = 'politica_inventarios_01_sem';

async function actualizarDatos() {

  writeToLog(`\nPaso 10.1 - Determina si se requiere Override o no`);

  let client;
  try {

  client = await MongoClient.connect(mongoUri);
  const db = client.db(dbName);
  const col = db.collection(collection);

  // MEJORA: Comparar valores redondeados para evitar falsos positivos
  const result = await col.aggregate([
    {
      $project: {
        _id: 1,
        SS_Cantidad: 1,
        STAT_SS: 1,
        // Redondear ambos antes de comparar
        SS_Redondeado: { $ceil: { $ifNull: ['$SS_Cantidad', 0] } },
        STAT_Redondeado: { $ceil: { $ifNull: ['$STAT_SS', 0] } },
        Override_SI_NO: {
          $cond: {
            if: { 
              $ne: [
                { $ceil: { $ifNull: ['$SS_Cantidad', 0] } },
                { $ceil: { $ifNull: ['$STAT_SS', 0] } }
              ]
            },
            then: 'SI',
            else: 'NO'
          }
        }
      }
    }
  ]).toArray();

  // Análisis detallado
  const stats = {
    total: result.length,
    overrideSI: 0,
    overrideNO: 0,
    ambosZero: 0,
    soloSSZero: 0
  };

  result.forEach(doc => {
    if (doc.Override_SI_NO === 'SI') stats.overrideSI++;
    else stats.overrideNO++;
    
    if (doc.SS_Redondeado === 0 && doc.STAT_Redondeado === 0) stats.ambosZero++;
    else if (doc.SS_Redondeado === 0) stats.soloSSZero++;
  });

  writeToLog(`\n\tESTADÍSTICAS DE OVERRIDE:`);
  writeToLog(`\t  Total: ${stats.total}`);
  writeToLog(`\t  Override SI: ${stats.overrideSI}`);
  writeToLog(`\t  Override NO: ${stats.overrideNO}`);
  writeToLog(`\t  Ambos en 0 (NO override): ${stats.ambosZero}`);
  writeToLog(`\t  Solo SS_Cantidad en 0 (SI override): ${stats.soloSSZero}`);

  // Mostrar ejemplos
  const ejemplosSI = result.filter(r => r.Override_SI_NO === 'SI').slice(0, 3);
  const ejemplosNO = result.filter(r => r.Override_SI_NO === 'NO' && r.SS_Redondeado === 0).slice(0, 3);

  if (ejemplosSI.length > 0) {
    writeToLog(`\n\tEjemplos Override SI:`);
    ejemplosSI.forEach(e => {
      writeToLog(`\t  _id: ${e._id}, SS: ${e.SS_Cantidad} → ${e.SS_Redondeado}, STAT: ${e.STAT_SS} → ${e.STAT_Redondeado}`);
    });
  }

  if (ejemplosNO.length > 0) {
    writeToLog(`\n\tEjemplos Override NO con SS=0:`);
    ejemplosNO.forEach(e => {
      writeToLog(`\t  _id: ${e._id}, SS: ${e.SS_Cantidad} → ${e.SS_Redondeado}, STAT: ${e.STAT_SS} → ${e.STAT_Redondeado}`);
    });
  }

  for (const doc of result) {
    await col.updateOne(
      { _id: doc._id },
      {
        $set: {
          Override_SI_NO: doc.Override_SI_NO
        }
      }
    );
  }

  writeToLog(`\n\tTermina la Determinacion de Requerimiento de Override`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) {
      client.close();
    }
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

actualizarDatos().catch(console.error);