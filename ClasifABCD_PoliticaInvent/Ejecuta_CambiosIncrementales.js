const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { MongoClient } = require('mongodb');
const { decryptData } = require('./DeCriptaPassAppDb');
const conex = require('../Configuraciones/ConStrDB');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const parametroUsuario = process.argv.slice(2)[0];
const { GB_DBName } = require(`../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`);
const parametroFolder = GB_DBName.toUpperCase();
const { DBUser, DBPassword, DBName } = require(`../../${parametroFolder}/cfg/dbvars`);
const dbName = `btc_opti_${DBName}`;

const POL_COLL = process.env.POL_COLL || 'politica_inventarios_01';
const CAMBIOS_COLL = process.env.CAMBIOS_COLL || 'cambios_ubicaciones_temp';

const logFileName = 'Incremental_Only';
const logDir = path.resolve(__dirname, `../../${parametroFolder}/log`);
const logFile = path.join(logDir, `${logFileName}.log`);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const now = () => moment().format('YYYY-MM-DD HH:mm:ss');
const writeToLog = (m) => { try { fs.appendFileSync(logFile, `[${now()}] ${m}\n`); } catch {} };

function ejecutarArchivo(nombreScript, parametrosString) {
  return new Promise((resolve, reject) => {
    const inicio = Date.now();
    const scriptPath = path.resolve(__dirname, nombreScript);
    const args = [scriptPath, ...parametrosString.split(' ')];

    writeToLog(`\n Inicio de ${nombreScript}`);
    const child = spawn(process.execPath, args, { cwd: path.dirname(scriptPath) });

    let stdout = ''; let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('error', (err) => {
      writeToLog(` Error lanzando ${nombreScript}: ${err?.message || err}`);
      writeToLog(`STDERR: ${stderr}`); writeToLog(`STDOUT: ${stdout}`);
      reject(err);
    });

    child.on('close', (code, signal) => {
      const duracion = ((Date.now() - inicio) / 1000).toFixed(2);
      if (code === 0) {
        writeToLog(` Fin de ${nombreScript} - Duración: ${duracion} s`);
        if (stderr.trim()) writeToLog(`STDERR (warning): ${stderr.trim()}`);
        if (stdout.trim()) writeToLog(`STDOUT: ${stdout.trim()}`);
        resolve();
      } else {
        writeToLog(` Error en ${nombreScript} - exitCode=${code} signal=${signal || 'null'} - Duración: ${duracion} s`);
        if (stderr.trim()) writeToLog(`STDERR: ${stderr.trim()}`);
        if (stdout.trim()) writeToLog(`STDOUT: ${stdout.trim()}`);
        reject(new Error(`Exit code ${code} (${nombreScript})`));
      }
    });
  });
}

async function backupPolitica(db) {
  const backupName = `${POL_COLL}_bk_${moment().format('YYYYMMDD_HHmmss')}`;
  const pol = db.collection(POL_COLL);
  const count = await pol.estimatedDocumentCount();
  
  if (count === 0) {
    writeToLog(` ${POL_COLL} está vacía. No se crea respaldo.`);
    return null;
  }
  
  writeToLog(` Creando respaldo de ${POL_COLL} (${count} docs) en ${backupName}...`);
  // Copia completa usando $out
  await pol.aggregate([{ $match: {} }, { $out: backupName }], { allowDiskUse: true }).toArray();
  writeToLog(` Respaldo creado: ${backupName} con ${count} documentos`);
  return backupName;
}

async function mergeBackupToPolitica(db, backupName) {
  if (!backupName) {
    writeToLog(` No hay respaldo que fusionar.`);
    return;
  }

  const pol = db.collection(POL_COLL);
  const backup = db.collection(backupName);
  
  // Contar documentos antes del merge
  const countPoliticaBefore = await pol.estimatedDocumentCount();
  const countBackup = await backup.estimatedDocumentCount();
  
  writeToLog(` Fusionando datos del backup ${backupName} con ${POL_COLL}...`);
  writeToLog(` Documentos en ${POL_COLL} antes del merge: ${countPoliticaBefore}`);
  writeToLog(` Documentos en backup: ${countBackup}`);

  // Insertar todos los documentos del backup a la colección principal
  // Esto agregará los datos del backup sin eliminar los nuevos datos calculados
  await backup.aggregate([
    { $match: {} },
    { $merge: {
        into: POL_COLL,
        whenMatched: 'keepExisting', // Mantener los nuevos datos si hay conflicto
        whenNotMatched: 'insert'     // Insertar los datos del backup que no existan
      }
    }
  ], { allowDiskUse: true }).toArray();

  // Contar documentos después del merge
  const countPoliticaAfter = await pol.estimatedDocumentCount();
  const docsAgregados = countPoliticaAfter - countPoliticaBefore;
  
  writeToLog(` Merge completado. Documentos agregados del backup: ${docsAgregados}`);
  writeToLog(` Total de documentos en ${POL_COLL} después del merge: ${countPoliticaAfter}`);
}

async function restorePolitica(db, backupName) {
  if (!backupName) {
    writeToLog(` No hay respaldo que restaurar.`);
    return;
  }
  writeToLog(` Restaurando ${POL_COLL} desde ${backupName}...`);
  
  // Restaura: reemplaza coincidencias por _id y crea si no existe
  await db.collection(backupName).aggregate([
    { $match: {} },
    {
      $merge: {
        into: POL_COLL,
        whenMatched: 'replace',
        whenNotMatched: 'insert'
      }
    }
  ], { allowDiskUse: true }).toArray();

  // Elimina documentos "extra" que se hayan creado durante el proceso y no estén en el respaldo
  const idsBackup = await db.collection(backupName).find({}, { projection: { _id: 1 } }).toArray();
  const idSet = new Set(idsBackup.map(d => String(d._id)));
  
  // Borra en lotes para no cargar todo en memoria en colecciones enormes
  const cursor = db.collection(POL_COLL).find({}, { projection: { _id: 1 } });
  const toDelete = [];
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!idSet.has(String(doc._id))) toDelete.push(doc._id);
    if (toDelete.length >= 5000) {
      await db.collection(POL_COLL).deleteMany({ _id: { $in: toDelete.splice(0, toDelete.length) } });
    }
  }
  if (toDelete.length) {
    await db.collection(POL_COLL).deleteMany({ _id: { $in: toDelete } });
  }
  writeToLog(` Restauración terminada. ${POL_COLL} quedó idéntica al respaldo.`);
}

async function eliminarDuplicadosDeEjecucion(db, inicioEjecucion) {
  writeToLog(` \nINICIANDO ELIMINACIÓN DE DUPLICADOS...`);
  
  try {
    const pol = db.collection(POL_COLL);
    
    // 1. Identificar documentos creados durante esta ejecución
    const docsNuevos = await pol.find({
      created_at: { $gte: inicioEjecucion }
    }).toArray();
    
    if (docsNuevos.length === 0) {
      writeToLog(` No hay documentos nuevos con timestamp de esta ejecución`);
      return;
    }
    
    writeToLog(` Documentos creados en esta ejecución: ${docsNuevos.length}`);
    
    // 2. Encontrar duplicados basados en campos de negocio
    const pipeline = [
      {
        $group: {
          _id: {
            SKU: "$SKU",
            Ubicacion: "$Ubicacion"
            // Agrega aquí otros campos que definan unicidad
          },
          docs: { $push: "$$ROOT" },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ];
    
    const duplicados = await pol.aggregate(pipeline).toArray();
    
    if (duplicados.length === 0) {
      writeToLog(` No se encontraron duplicados en la colección`);
      return;
    }
    
    writeToLog(` Grupos de duplicados encontrados: ${duplicados.length}`);
    
    let totalEliminados = 0;
    
    // 3. Para cada grupo de duplicados, mantener solo el más reciente
    for (const grupo of duplicados) {
      const docs = grupo.docs;
      
      // Filtrar solo documentos creados en esta ejecución
      const docsDeEstaEjecucion = docs.filter(doc => 
        doc.created_at && doc.created_at >= inicioEjecucion
      );
      
      if (docsDeEstaEjecucion.length <= 1) {
        continue;
      }
      
      // Ordenar por created_at descendente (más reciente primero)
      docsDeEstaEjecucion.sort((a, b) => {
        const dateA = new Date(a.created_at || a._id.getTimestamp());
        const dateB = new Date(b.created_at || b._id.getTimestamp());
        return dateB - dateA;
      });
      
      // Mantener el primer documento (más reciente), eliminar el resto
      const docsAEliminar = docsDeEstaEjecucion.slice(1);
      const idsAEliminar = docsAEliminar.map(doc => doc._id);
      
      if (idsAEliminar.length > 0) {
        const resultado = await pol.deleteMany({ _id: { $in: idsAEliminar } });
        totalEliminados += resultado.deletedCount;
        
        writeToLog(` Eliminados ${resultado.deletedCount} duplicados para SKU: ${grupo._id.SKU}, Ubicacion: ${grupo._id.Ubicacion}`);
      }
    }
    
    writeToLog(` TOTAL DUPLICADOS ELIMINADOS: ${totalEliminados}`);
    
    if (totalEliminados > 0) {
      const countFinal = await pol.countDocuments({});
      writeToLog(` Documentos restantes en ${POL_COLL}: ${countFinal}`);
    }
    
  } catch (error) {
    writeToLog(` Error eliminando duplicados: ${error.message}`);
    throw error;
  }
}

async function limpiarBackupTemporal(db, backupName) {
  if (!backupName) return;
  
  try {
    const collections = await db.listCollections({ name: backupName }).toArray();
    if (collections.length > 0) {
      await db.collection(backupName).drop();
      writeToLog(` Backup temporal ${backupName} eliminado`);
    }
  } catch (e) {
    writeToLog(` Error eliminando backup temporal: ${e.message}`);
  }
}

async function ejecutarIncrementalSolo() {
  let client;
  let backupName = null;
  const inicioEjecucion = new Date();
  const t0 = Date.now();
  let procesoExitoso = false;

  try {
    const passadminDeCripta = await decryptData(DBPassword);
    if (!passadminDeCripta) throw new Error('decryptData(DBPassword) devolvió vacío/undefined.');
    const parametros = [dbName, DBUser, passadminDeCripta].join(' ');

    // Conexión
    const mongoUri = conex.getUrl(DBUser, passadminDeCripta, host, puerto, dbName);
    client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(dbName);
    writeToLog(` Conectado a Mongo. Node=${process.version} Driver=${require('mongodb/package.json').version}`);
    writeToLog(` Inicio de ejecución marcado: ${inicioEjecucion.toISOString()}`);

    // 1) BACKUP OBLIGATORIO antes de cualquier procesamiento
    writeToLog(` \n========== CREANDO BACKUP INICIAL ==========`);
    backupName = await backupPolitica(db);

    // 2) FLUJO DE EJECUCIÓN SECUENCIAL
    writeToLog(` \n========== INICIANDO FLUJO INCREMENTAL ==========`);
    
    // PASO 1: Ejecutar P23 (Identificar cambios)
    writeToLog(` \nPASO 1: Identificando cambios de ubicaciones...`);
    await ejecutarArchivo('P23_Identifica_Cambios_Ubicaciones.js', parametros);

    // PASO 2: Verificar si hay cambios que procesar
    const totalCambios = await db.collection(CAMBIOS_COLL).countDocuments({});
    writeToLog(` Total de cambios detectados: ${totalCambios}`);
    
    if (totalCambios === 0) {
      writeToLog(` No se detectaron cambios. Terminando proceso.`);
      procesoExitoso = true;
      return;
    }

    // PASO 3: Ejecutar P24 (Procesar cambios incrementales)
    writeToLog(` \nPASO 2: Procesando cambios incrementales...`);
    await ejecutarArchivo('P24_Procesa_Cambios_Incrementales.js', parametros);

    // PASO 4: Ejecutar P22 (Crear política final)
    writeToLog(` \nPASO 3: Ejecutando creación de política final...`);
    await ejecutarArchivo('P22_Crea_Politica_Final.js', parametros);

    // PASO 5: Eliminar duplicados creados durante esta ejecución
    writeToLog(` \nPASO 4: Verificando y eliminando duplicados de esta ejecución...`);
    await eliminarDuplicadosDeEjecucion(db, inicioEjecucion);

    // PASO 6: FUSIONAR DATOS DEL BACKUP CON LOS NUEVOS DATOS
    writeToLog(` \n========== FUSIONANDO DATOS DEL BACKUP ==========`);
    await mergeBackupToPolitica(db, backupName);

    // PASO 7: ELIMINAR BACKUP INMEDIATAMENTE DESPUÉS DEL MERGE EXITOSO
    if (backupName) {
      writeToLog(` \nEliminando backup temporal después del merge exitoso...`);
      await limpiarBackupTemporal(db, backupName);
      backupName = null; // Marcamos que ya no existe el backup
    }

    writeToLog(` \n========== FLUJO INCREMENTAL COMPLETADO ==========`);
    writeToLog(` Proceso incremental terminado correctamente. Duración total ${(Date.now()-t0)/1000}s`);
    
    procesoExitoso = true;

  } catch (error) {
    writeToLog(` Error en ejecutarIncrementalSolo: ${error?.message || error}`);
    
    // En caso de error, restaurar desde backup (solo si aún existe)
    if (client && backupName) {
      writeToLog(` \nError detectado - Iniciando restauración desde backup...`);
      try {
        const db = client.db(dbName);
        await restorePolitica(db, backupName);
        writeToLog(` Restauración completada debido a error en la ejecución`);
      } catch (restoreError) {
        writeToLog(` Error durante la restauración: ${restoreError.message}`);
      }
    }
    
    throw error;
  } finally {
    // 7) LIMPIEZA FINAL: Eliminar backup temporal solo si aún existe y hubo error
    if (client && backupName && !procesoExitoso) {
      try {
        const db = client.db(dbName);
        writeToLog(` Limpiando backup temporal debido a proceso fallido...`);
        await limpiarBackupTemporal(db, backupName);
      } catch (e) {
        writeToLog(` Error eliminando backup temporal en cleanup final: ${e.message}`);
      }
    }
    
    if (client) { 
      try { 
        await client.close(); 
        writeToLog(` Conexión a MongoDB cerrada`);
      } catch {} 
    }
  }
}

// Ejecución principal
ejecutarIncrementalSolo().catch((err) => {
  const msg = (err && (err.message || err.toString())) ? (err.message || err.toString()) : 'Error desconocido';
  writeToLog(` Proceso fallido: ${msg}`);
  console.error(err);
  process.exit(1);
});