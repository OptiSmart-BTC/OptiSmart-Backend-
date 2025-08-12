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
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

async function identificarCambiosUbicaciones() {
  writeToLog(`\nPaso 23 - Identificacion de Cambios en Ubicaciones (Semanal)`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const demandaCollection = db.collection('demanda_abcd_01_sem');
    const ubisCollection = db.collection('ubis_saved');
    const cambiosCollection = db.collection('cambios_ubicaciones_temp_sem');

    // Limpiar tabla temporal de cambios
    await cambiosCollection.deleteMany({});

    // Obtener ubicaciones guardadas previamente
    const ubicacionesGuardadas = await ubisCollection.find({}).toArray();
    const ubicacionesSet = new Set(ubicacionesGuardadas.map(u => u.ubicacion));

    writeToLog(`\tUbicaciones previamente guardadas: ${ubicacionesSet.size}`);

    // Obtener datos actuales de demanda
    const datosDemanda = await demandaCollection.find().toArray();
    const ubicacionesActuales = new Set(datosDemanda.map(d => d.Ubicacion));

    writeToLog(`\tUbicaciones actuales en demanda: ${ubicacionesActuales.size}`);

    // Identificar cambios
    const ubicacionesNuevas = [...ubicacionesActuales].filter(u => !ubicacionesSet.has(u));
    const ubicacionesEliminadas = [...ubicacionesSet].filter(u => !ubicacionesActuales.has(u));
    const ubicacionesExistentes = [...ubicacionesActuales].filter(u => ubicacionesSet.has(u));

    writeToLog(`\tUbicaciones nuevas: ${ubicacionesNuevas.length}`);
    writeToLog(`\tUbicaciones eliminadas: ${ubicacionesEliminadas.length}`);
    writeToLog(`\tUbicaciones existentes: ${ubicacionesExistentes.length}`);

    // Guardar cambios en tabla temporal
    const cambios = [];

    // Ubicaciones nuevas
    for (const ubicacion of ubicacionesNuevas) {
      cambios.push({
        ubicacion: ubicacion,
        tipo_cambio: 'NUEVA',
        fecha_identificacion: now
      });
    }

    // Ubicaciones eliminadas
    for (const ubicacion of ubicacionesEliminadas) {
      cambios.push({
        ubicacion: ubicacion,
        tipo_cambio: 'ELIMINADA',
        fecha_identificacion: now
      });
    }

    // Ubicaciones existentes (que necesitan actualización)
    for (const ubicacion of ubicacionesExistentes) {
      cambios.push({
        ubicacion: ubicacion,
        tipo_cambio: 'ACTUALIZADA',
        fecha_identificacion: now
      });
    }

    if (cambios.length > 0) {
      await cambiosCollection.insertMany(cambios);
      writeToLog(`\tTotal de cambios identificados: ${cambios.length}`);
    } else {
      writeToLog(`\tNo se identificaron cambios en ubicaciones`);
    }

    // Verificar si hay cambios que requieren procesamiento
    const totalCambios = ubicacionesNuevas.length + ubicacionesEliminadas.length + ubicacionesExistentes.length;
    
    if (totalCambios === 0) {
      writeToLog(`\tNo hay cambios que procesar - terminando proceso incremental`);
      process.exit(0);
    }

    writeToLog(`\tTermina la identificacion de cambios en ubicaciones`);

  } catch (err) {
    writeToLog(`${now} - Error en identificacion de cambios: ${err.message}`);
    throw err;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Ejecutar la función
identificarCambiosUbicaciones().catch(console.error);