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
const UI_ALL_POL_INV_COLL = process.env.UI_ALL_POL_INV_COLL || 'ui_all_pol_inv';
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

async function backupUiAllPolInv(db) {
  const backupName = `${UI_ALL_POL_INV_COLL}_bk_${moment().format('YYYYMMDD_HHmmss')}`;
  const uiAll = db.collection(UI_ALL_POL_INV_COLL);
  const count = await uiAll.estimatedDocumentCount();
  
  if (count === 0) {
    writeToLog(` ${UI_ALL_POL_INV_COLL} está vacía. No se crea respaldo.`);
    return null;
  }
  
  writeToLog(` Creando respaldo de ${UI_ALL_POL_INV_COLL} (${count} docs) en ${backupName}...`);
  // Copia completa usando $out
  await uiAll.aggregate([{ $match: {} }, { $out: backupName }], { allowDiskUse: true }).toArray();
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
  const cambiosCollection = db.collection(CAMBIOS_COLL);
  
  // *** NUEVA LÓGICA: OBTENER UBICACIONES RECARGADAS ***
  const ubicacionesRecargadas = await cambiosCollection.find({
    tipo_cambio: 'RECARGA'
  }).toArray();
  
  const ubicacionesRecaradasList = ubicacionesRecargadas.map(r => r.ubicacion);
  
  if (ubicacionesRecaradasList.length > 0) {
    writeToLog(` ADVERTENCIA: EXCLUIR del merge ubicaciones recargadas: [${ubicacionesRecaradasList.join(', ')}]`);
    writeToLog(`   Estas ubicaciones fueron limpiadas y recalculadas desde cero`);
  }
  
  // Contar documentos antes del merge
  const countPoliticaBefore = await pol.estimatedDocumentCount();
  const countBackup = await backup.estimatedDocumentCount();
  
  writeToLog(` Fusionando datos del backup ${backupName} con ${POL_COLL}...`);
  writeToLog(` Documentos en ${POL_COLL} antes del merge: ${countPoliticaBefore}`);
  writeToLog(` Documentos en backup: ${countBackup}`);

  // *** MODIFICACIÓN: EXCLUIR UBICACIONES RECARGADAS DEL MERGE ***
  const matchStage = ubicacionesRecaradasList.length > 0 
    ? { $match: { Ubicacion: { $nin: ubicacionesRecaradasList } } }
    : { $match: {} };

  // Insertar documentos del backup EXCLUYENDO ubicaciones recargadas
  await backup.aggregate([
    matchStage,
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
  
  if (ubicacionesRecaradasList.length > 0) {
    // Verificar que las ubicaciones recargadas NO tengan datos del backup
    const docsRecaradasEnBackup = await backup.countDocuments({
      Ubicacion: { $in: ubicacionesRecaradasList }
    });
    
    writeToLog(` VERIFICACION EXITOSA: ${docsRecaradasEnBackup} docs de ubicaciones recargadas EXCLUIDOS del merge`);
  }
  
  writeToLog(` Merge completado. Documentos agregados del backup: ${docsAgregados}`);
  writeToLog(` Total de documentos en ${POL_COLL} después del merge: ${countPoliticaAfter}`);
  
  if (ubicacionesRecaradasList.length > 0) {
    writeToLog(` RECARGAS: Ubicaciones recargadas mantienen solo sus datos nuevos (sin merge)`);
  }
}

async function mergeBackupToUiAllPolInv(db, backupName) {
  if (!backupName) {
    writeToLog(` No hay respaldo de ${UI_ALL_POL_INV_COLL} que fusionar.`);
    return;
  }

  const uiAll = db.collection(UI_ALL_POL_INV_COLL);
  const backup = db.collection(backupName);
  const cambiosCollection = db.collection(CAMBIOS_COLL);
  
  // *** NUEVA LÓGICA: OBTENER UBICACIONES RECARGADAS ***
  const ubicacionesRecargadas = await cambiosCollection.find({
    tipo_cambio: 'RECARGA'
  }).toArray();
  
  const ubicacionesRecaradasList = ubicacionesRecargadas.map(r => r.ubicacion);
  
  if (ubicacionesRecaradasList.length > 0) {
    writeToLog(` ADVERTENCIA: EXCLUIR del merge ${UI_ALL_POL_INV_COLL} ubicaciones recargadas: [${ubicacionesRecaradasList.join(', ')}]`);
    writeToLog(`   Estas ubicaciones fueron limpiadas y recalculadas desde cero`);
  }
  
  // Contar documentos antes del merge
  const countUiAllBefore = await uiAll.estimatedDocumentCount();
  const countBackup = await backup.estimatedDocumentCount();
  
  writeToLog(` Fusionando datos del backup ${backupName} con ${UI_ALL_POL_INV_COLL}...`);
  writeToLog(` Documentos en ${UI_ALL_POL_INV_COLL} antes del merge: ${countUiAllBefore}`);
  writeToLog(` Documentos en backup: ${countBackup}`);

  // *** MODIFICACIÓN: EXCLUIR UBICACIONES RECARGADAS DEL MERGE ***
  const matchStage = ubicacionesRecaradasList.length > 0 
    ? { $match: { Ubicacion: { $nin: ubicacionesRecaradasList } } }
    : { $match: {} };

  // Insertar documentos del backup EXCLUYENDO ubicaciones recargadas
  await backup.aggregate([
    matchStage,
    { $merge: {
        into: UI_ALL_POL_INV_COLL,
        whenMatched: 'keepExisting', // Mantener los nuevos datos si hay conflicto
        whenNotMatched: 'insert'     // Insertar los datos del backup que no existan
      }
    }
  ], { allowDiskUse: true }).toArray();

  // Contar documentos después del merge
  const countUiAllAfter = await uiAll.estimatedDocumentCount();
  const docsAgregados = countUiAllAfter - countUiAllBefore;
  
  if (ubicacionesRecaradasList.length > 0) {
    // Verificar que las ubicaciones recargadas NO tengan datos del backup
    const docsRecaradasEnBackup = await backup.countDocuments({
      Ubicacion: { $in: ubicacionesRecaradasList }
    });
    
    writeToLog(` VERIFICACION EXITOSA: ${docsRecaradasEnBackup} docs de ubicaciones recargadas EXCLUIDOS del merge en ${UI_ALL_POL_INV_COLL}`);
  }
  
  writeToLog(` Merge completado. Documentos agregados del backup: ${docsAgregados}`);
  writeToLog(` Total de documentos en ${UI_ALL_POL_INV_COLL} después del merge: ${countUiAllAfter}`);
  
  if (ubicacionesRecaradasList.length > 0) {
    writeToLog(` RECARGAS: Ubicaciones recargadas mantienen solo sus datos nuevos (sin merge)`);
  }
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

async function restoreUiAllPolInv(db, backupName) {
  if (!backupName) {
    writeToLog(` No hay respaldo de ${UI_ALL_POL_INV_COLL} que restaurar.`);
    return;
  }
  writeToLog(` Restaurando ${UI_ALL_POL_INV_COLL} desde ${backupName}...`);
  
  // Restaura: reemplaza coincidencias por _id y crea si no existe
  await db.collection(backupName).aggregate([
    { $match: {} },
    {
      $merge: {
        into: UI_ALL_POL_INV_COLL,
        whenMatched: 'replace',
        whenNotMatched: 'insert'
      }
    }
  ], { allowDiskUse: true }).toArray();

  // Elimina documentos "extra" que se hayan creado durante el proceso y no estén en el respaldo
  const idsBackup = await db.collection(backupName).find({}, { projection: { _id: 1 } }).toArray();
  const idSet = new Set(idsBackup.map(d => String(d._id)));
  
  // Borra en lotes para no cargar todo en memoria en colecciones enormes
  const cursor = db.collection(UI_ALL_POL_INV_COLL).find({}, { projection: { _id: 1 } });
  const toDelete = [];
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!idSet.has(String(doc._id))) toDelete.push(doc._id);
    if (toDelete.length >= 5000) {
      await db.collection(UI_ALL_POL_INV_COLL).deleteMany({ _id: { $in: toDelete.splice(0, toDelete.length) } });
    }
  }
  if (toDelete.length) {
    await db.collection(UI_ALL_POL_INV_COLL).deleteMany({ _id: { $in: toDelete } });
  }
  writeToLog(` Restauración terminada. ${UI_ALL_POL_INV_COLL} quedó idéntica al respaldo.`);
}

async function eliminarDuplicadosDeEjecucion(db, inicioEjecucion) {
  writeToLog(` \nINICIANDO ELIMINACIÓN DE DUPLICADOS...`);
  
  try {
    const pol = db.collection(POL_COLL);
    const cambiosCollection = db.collection(CAMBIOS_COLL);
    
    // *** NUEVA LÓGICA: NO TOCAR UBICACIONES RECARGADAS ***
    const recargas = await cambiosCollection.find({
      tipo_cambio: 'RECARGA'
    }).toArray();
    
    const ubicacionesRecargadas = recargas.map(r => r.ubicacion);
    
    if (recargas.length > 0) {
      writeToLog(` RECARGAS DETECTADAS - SALTANDO limpieza (ya procesadas por P24):`);
      for (const recarga of recargas) {
        writeToLog(`   RECARGA ${recarga.ubicacion}: Ya limpiada por P24 - NO TOCAR`);
      }
    }
    
    // 1. Identificar documentos creados durante esta ejecución (EXCLUYENDO UBICACIONES RECARGADAS)
    const matchFilter = {
      created_at: { $gte: inicioEjecucion },
      // *** EXCLUIR UBICACIONES RECARGADAS ***
      ...(ubicacionesRecargadas.length > 0 && {
        Ubicacion: { $nin: ubicacionesRecargadas }
      })
    };
    
    const docsNuevos = await pol.find(matchFilter).toArray();
    
    if (docsNuevos.length === 0) {
      writeToLog(` No hay documentos nuevos con timestamp de esta ejecución (excluyendo recargas)`);
      return;
    }
    
    writeToLog(` Documentos creados en esta ejecución (excluyendo recargas): ${docsNuevos.length}`);
    
    // 2. Encontrar duplicados basados en campos de negocio (SOLO EN DOCUMENTOS NUEVOS NO-RECARGADOS)
    const pipeline = [
      {
        $match: matchFilter
      },
      {
        $group: {
          _id: {
            SKU: "$SKU",
            Ubicacion: "$Ubicacion"
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
      writeToLog(` No se encontraron duplicados en documentos nuevos (excluyendo recargas)`);
      return;
    }
    
    writeToLog(` Grupos de duplicados encontrados (sin recargas): ${duplicados.length}`);
    
    let totalEliminados = 0;
    
    // 3. Para cada grupo de duplicados, mantener solo el más reciente
    for (const grupo of duplicados) {
      const docs = grupo.docs;
      
      // Ordenar por created_at descendente (más reciente primero)
      docs.sort((a, b) => {
        const dateA = new Date(a.created_at || a._id.getTimestamp());
        const dateB = new Date(b.created_at || b._id.getTimestamp());
        return dateB - dateA;
      });
      
      // Mantener el primer documento (más reciente), eliminar el resto
      const docsAEliminar = docs.slice(1);
      const idsAEliminar = docsAEliminar.map(doc => doc._id);
      
      if (idsAEliminar.length > 0) {
        const resultado = await pol.deleteMany({ _id: { $in: idsAEliminar } });
        totalEliminados += resultado.deletedCount;
        
        writeToLog(` Eliminados ${resultado.deletedCount} duplicados para SKU: ${grupo._id.SKU}, Ubicacion: ${grupo._id.Ubicacion}`);
      }
    }
    
    writeToLog(` TOTAL DUPLICADOS ELIMINADOS (excluyendo recargas): ${totalEliminados}`);
    
    if (totalEliminados > 0) {
      const countFinal = await pol.countDocuments({});
      writeToLog(` Documentos finales en ${POL_COLL}: ${countFinal}`);
    }
    
  } catch (error) {
    writeToLog(` Error eliminando duplicados: ${error.message}`);
    throw error;
  }
}

async function eliminarDuplicadosUiAllPolInv(db, inicioEjecucion) {
  writeToLog(` \nINICIANDO ELIMINACIÓN DE DUPLICADOS EN ${UI_ALL_POL_INV_COLL}...`);
  
  try {
    const uiAll = db.collection(UI_ALL_POL_INV_COLL);
    const cambiosCollection = db.collection(CAMBIOS_COLL);
    
    // *** NUEVA LÓGICA: NO TOCAR UBICACIONES RECARGADAS ***
    const recargas = await cambiosCollection.find({
      tipo_cambio: 'RECARGA'
    }).toArray();
    
    const ubicacionesRecargadas = recargas.map(r => r.ubicacion);
    
    if (recargas.length > 0) {
      writeToLog(` RECARGAS DETECTADAS EN ${UI_ALL_POL_INV_COLL} - SALTANDO limpieza (ya procesadas por P24):`);
      for (const recarga of recargas) {
        writeToLog(`   RECARGA ${recarga.ubicacion}: Ya limpiada por P24 - NO TOCAR`);
      }
    }
    
    // 1. Identificar documentos creados durante esta ejecución (EXCLUYENDO UBICACIONES RECARGADAS)
    const matchFilter = {
      created_at: { $gte: inicioEjecucion },
      // *** EXCLUIR UBICACIONES RECARGADAS ***
      ...(ubicacionesRecargadas.length > 0 && {
        Ubicacion: { $nin: ubicacionesRecargadas }
      })
    };
    
    const docsNuevos = await uiAll.find(matchFilter).toArray();
    
    if (docsNuevos.length === 0) {
      writeToLog(` No hay documentos nuevos en ${UI_ALL_POL_INV_COLL} con timestamp de esta ejecución (excluyendo recargas)`);
      return;
    }
    
    writeToLog(` Documentos creados en ${UI_ALL_POL_INV_COLL} en esta ejecución (excluyendo recargas): ${docsNuevos.length}`);
    
    // 2. Encontrar duplicados basados en campos de negocio (SOLO EN DOCUMENTOS NUEVOS NO-RECARGADOS)
    const pipeline = [
      {
        $match: matchFilter
      },
      {
        $group: {
          _id: {
            SKU: "$SKU",
            Ubicacion: "$Ubicacion"
          },
          docs: { $push: "$$ROOT" },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ];
    
    const duplicados = await uiAll.aggregate(pipeline).toArray();
    
    if (duplicados.length === 0) {
      writeToLog(` No se encontraron duplicados en ${UI_ALL_POL_INV_COLL} documentos nuevos (excluyendo recargas)`);
      return;
    }
    
    writeToLog(` Grupos de duplicados encontrados en ${UI_ALL_POL_INV_COLL} (sin recargas): ${duplicados.length}`);
    
    let totalEliminados = 0;
    
    // 3. Para cada grupo de duplicados, mantener solo el más reciente
    for (const grupo of duplicados) {
      const docs = grupo.docs;
      
      // Ordenar por created_at descendente (más reciente primero)
      docs.sort((a, b) => {
        const dateA = new Date(a.created_at || a._id.getTimestamp());
        const dateB = new Date(b.created_at || b._id.getTimestamp());
        return dateB - dateA;
      });
      
      // Mantener el primer documento (más reciente), eliminar el resto
      const docsAEliminar = docs.slice(1);
      const idsAEliminar = docsAEliminar.map(doc => doc._id);
      
      if (idsAEliminar.length > 0) {
        const resultado = await uiAll.deleteMany({ _id: { $in: idsAEliminar } });
        totalEliminados += resultado.deletedCount;
        
        writeToLog(` Eliminados ${resultado.deletedCount} duplicados en ${UI_ALL_POL_INV_COLL} para SKU: ${grupo._id.SKU}, Ubicacion: ${grupo._id.Ubicacion}`);
      }
    }
    
    writeToLog(` TOTAL DUPLICADOS ELIMINADOS EN ${UI_ALL_POL_INV_COLL} (excluyendo recargas): ${totalEliminados}`);
    
    if (totalEliminados > 0) {
      const countFinal = await uiAll.countDocuments({});
      writeToLog(` Documentos finales en ${UI_ALL_POL_INV_COLL}: ${countFinal}`);
    }
    
  } catch (error) {
    writeToLog(` Error eliminando duplicados en ${UI_ALL_POL_INV_COLL}: ${error.message}`);
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
  let backupNamePolitica = null;
  let backupNameUiAll = null;
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

    // 1) BACKUPS OBLIGATORIOS antes de cualquier procesamiento
    writeToLog(` \n========== CREANDO BACKUPS INICIALES ==========`);
    backupNamePolitica = await backupPolitica(db);
    backupNameUiAll = await backupUiAllPolInv(db);

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

    // PASO 3: Ejecutar P24 (Procesar cambios incrementales) - P24 ejecuta P22 internamente
    writeToLog(` \nPASO 2: Procesando cambios incrementales (incluye P22)...`);
    await ejecutarArchivo('P24_Procesa_Cambios_Incrementales.js', parametros);

    // PASO 4: Eliminar duplicados creados durante esta ejecución (SIN TOCAR RECARGAS) - AMBAS COLECCIONES
    writeToLog(` \nPASO 3: Verificando y eliminando duplicados de esta ejecución...`);
    await eliminarDuplicadosDeEjecucion(db, inicioEjecucion);
    await eliminarDuplicadosUiAllPolInv(db, inicioEjecucion);

    // PASO 5: FUSIONAR DATOS DE LOS BACKUPS CON LOS NUEVOS DATOS - AMBAS COLECCIONES
    writeToLog(` \n========== FUSIONANDO DATOS DE LOS BACKUPS ==========`);
    await mergeBackupToPolitica(db, backupNamePolitica);
    await mergeBackupToUiAllPolInv(db, backupNameUiAll);

    // PASO 6: ELIMINAR BACKUPS INMEDIATAMENTE DESPUÉS DEL MERGE EXITOSO
    if (backupNamePolitica) {
      writeToLog(` \nEliminando backup temporal de ${POL_COLL} después del merge exitoso...`);
      await limpiarBackupTemporal(db, backupNamePolitica);
      backupNamePolitica = null; // Marcamos que ya no existe el backup
    }
    
    if (backupNameUiAll) {
      writeToLog(` \nEliminando backup temporal de ${UI_ALL_POL_INV_COLL} después del merge exitoso...`);
      await limpiarBackupTemporal(db, backupNameUiAll);
      backupNameUiAll = null; // Marcamos que ya no existe el backup
    }

    writeToLog(` \n========== FLUJO INCREMENTAL COMPLETADO ==========`);
    writeToLog(` Proceso incremental terminado correctamente. Duración total ${(Date.now()-t0)/1000}s`);
    
    procesoExitoso = true;

 } catch (error) {
    writeToLog(` Error en ejecutarIncrementalSolo: ${error?.message || error}`);
    
    // En caso de error, restaurar desde backups (solo si aún existen)
    if (client) {
      const db = client.db(dbName);
      
      if (backupNamePolitica) {
        writeToLog(` \nError detectado - Iniciando restauración de ${POL_COLL} desde backup...`);
        try {
          await restorePolitica(db, backupNamePolitica);
          writeToLog(` Restauración de ${POL_COLL} completada debido a error en la ejecución`);
        } catch (restoreError) {
          writeToLog(` Error durante la restauración de ${POL_COLL}: ${restoreError.message}`);
        }
      }
      
      if (backupNameUiAll) {
        writeToLog(` \nError detectado - Iniciando restauración de ${UI_ALL_POL_INV_COLL} desde backup...`);
        try {
          await restoreUiAllPolInv(db, backupNameUiAll);
          writeToLog(` Restauración de ${UI_ALL_POL_INV_COLL} completada debido a error en la ejecución`);
        } catch (restoreError) {
          writeToLog(` Error durante la restauración de ${UI_ALL_POL_INV_COLL}: ${restoreError.message}`);
        }
      }
    }
    
    throw error; //  Re-lanzar el error para que el .catch() lo capture
    
  } finally {
    //  SIEMPRE cerrar la conexión, haya error o no
    if (client) { 
      try { 
        await client.close(); 
        writeToLog(`  Conexión a MongoDB cerrada correctamente`);
      } catch (closeError) {
        writeToLog(`  Error cerrando conexión: ${closeError.message}`);
      }
    }
    
    // Limpiar backups solo si hubo error
    if (client && !procesoExitoso) {
      const db = client.db(dbName);
      
      if (backupNamePolitica) {
        try {
          writeToLog(` Limpiando backup temporal de ${POL_COLL} debido a proceso fallido...`);
          await limpiarBackupTemporal(db, backupNamePolitica);
        } catch (e) {
          writeToLog(` Error eliminando backup temporal de ${POL_COLL} en cleanup final: ${e.message}`);
        }
      }
      
      if (backupNameUiAll) {
        try {
          writeToLog(` Limpiando backup temporal de ${UI_ALL_POL_INV_COLL} debido a proceso fallido...`);
          await limpiarBackupTemporal(db, backupNameUiAll);
        } catch (e) {
          writeToLog(` Error eliminando backup temporal de ${UI_ALL_POL_INV_COLL} en cleanup final: ${e.message}`);
        }
      }
    }
  }
}

// Ejecución principal
ejecutarIncrementalSolo()
  .then(() => {
    writeToLog(`  SCRIPT FINALIZADO EXITOSAMENTE`);
    console.log(' Proceso completado con éxito');
    process.exit(0); //  Terminar el proceso exitosamente
  })
  .catch((err) => {
    const msg = (err && (err.message || err.toString())) ? (err.message || err.toString()) : 'Error desconocido';
    writeToLog(`  SCRIPT FINALIZADO CON ERROR: ${msg}`);
    console.error(' Error en el proceso:', err);
    process.exit(1); //  Terminar el proceso con error
  });