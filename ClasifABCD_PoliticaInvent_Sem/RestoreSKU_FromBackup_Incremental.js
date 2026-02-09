const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const now = moment().format('YYYY-MM-DD HH:mm:ss');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];

const { host, puerto } = require('../Configuraciones/ConexionDB');
const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parte = dbName.substring(dbName.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/Incremental_Only_Sem.log`;

const SOURCE_COLLECTION = 'sku';
const BACKUP_COLLECTION = 'sku_backup';
const CAMBIOS_COLL = process.env.CAMBIOS_COLL_SEM || 'cambios_ubicaciones_temp_sem';

function writeToLog(message) {
  const timestamp = moment().format('HH:mm:ss');
  const logMessage = `[${timestamp}] ${message}`;
  fs.appendFileSync(logFile, logMessage + '\n');
  console.log(logMessage);
}

async function mergeSKUBackup() {
  writeToLog(`\n========== INICIANDO MERGE DE SKU BACKUP (MODO INCREMENTAL) ==========`);
  
  let client;
  
  try {
    client = await MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = client.db(dbName);

    const skuCollection = db.collection(SOURCE_COLLECTION);
    const backupCollection = db.collection(BACKUP_COLLECTION);
    const cambiosCollection = db.collection(CAMBIOS_COLL);

    // VERIFICAR SI EXISTE EL BACKUP
    const collections = await db.listCollections({ name: BACKUP_COLLECTION }).toArray();
    if (collections.length === 0) {
      writeToLog(`   No existe la colección '${BACKUP_COLLECTION}' - probablemente es la primera carga`);
      writeToLog(` Saltando merge de SKU backup`);
      return;
    }

    const countBackup = await backupCollection.estimatedDocumentCount();
    if (countBackup === 0) {
      writeToLog(`   El backup de SKU está vacío - no hay nada que fusionar`);
      return;
    }

    // *** OBTENER UBICACIONES RECARGADAS (MISMA LÓGICA QUE POLÍTICAS) ***
    const ubicacionesRecargadas = await cambiosCollection.find({
      tipo_cambio: 'RECARGA'
    }).toArray();
    
    const ubicacionesRecaradasList = ubicacionesRecargadas.map(r => r.ubicacion);
    
    if (ubicacionesRecaradasList.length > 0) {
      writeToLog(`  ADVERTENCIA: EXCLUIR del merge SKUs de ubicaciones recargadas: [${ubicacionesRecaradasList.join(', ')}]`);
      writeToLog(`    Estas ubicaciones fueron limpiadas y tienen datos nuevos desde cero`);
    }

    // CONTAR DOCUMENTOS ANTES DEL MERGE
    const countSKUBefore = await skuCollection.estimatedDocumentCount();
    
    writeToLog(`  Fusionando datos del backup con colección ${SOURCE_COLLECTION}...`);
    writeToLog(`    Documentos en ${SOURCE_COLLECTION} antes del merge: ${countSKUBefore}`);
    writeToLog(`    Documentos en backup: ${countBackup}`);
writeToLog(`  Fusionando datos del backup con colección ${SOURCE_COLLECTION}...`);
    writeToLog(`    Documentos en ${SOURCE_COLLECTION} antes del merge: ${countSKUBefore}`);
    writeToLog(`    Documentos en backup: ${countBackup}`);

    //  AGREGAR DESDE AQUÍ 
    // VERIFICAR/CREAR ÍNDICE ÚNICO COMPUESTO ANTES DEL MERGE
    const skuIndexes = await skuCollection.indexes();
    const hasUniqueSkuUbicacionIndex = skuIndexes.some(idx => 
      idx.unique && 
      idx.key.SKU === 1 && 
      idx.key.Ubicacion === 1
    );

    if (!hasUniqueSkuUbicacionIndex) {
      writeToLog(`  Creando índice único compuesto (SKU + Ubicacion) - requerido para $merge...`);
      try {
        await skuCollection.createIndex(
          { SKU: 1, Ubicacion: 1 },
          { unique: true, name: 'sku_ubicacion_unique_idx' }
        );
        writeToLog(`    Índice único compuesto creado exitosamente`);
      } catch (idxError) {
        if (idxError.code === 11000) {
          writeToLog(`    ADVERTENCIA: Hay SKUs duplicados (mismo SKU + Ubicacion). Limpiando...`);
          
          const pipeline = [
            { $group: { 
                _id: { SKU: "$SKU", Ubicacion: "$Ubicacion" },
                docs: { $push: "$$ROOT" },
                count: { $sum: 1 }
              }
            },
            { $match: { count: { $gt: 1 } } }
          ];
          
          const duplicados = await skuCollection.aggregate(pipeline).toArray();
          writeToLog(`    Encontrados ${duplicados.length} grupos de duplicados`);
          
          for (const grupo of duplicados) {
            const docs = grupo.docs.sort((a, b) => 
              new Date(b.created_at || b._id.getTimestamp()) - 
              new Date(a.created_at || a._id.getTimestamp())
            );
            const idsAEliminar = docs.slice(1).map(d => d._id);
            await skuCollection.deleteMany({ _id: { $in: idsAEliminar } });
            writeToLog(`      Eliminados ${idsAEliminar.length} duplicados para SKU:${grupo._id.SKU} Ubicacion:${grupo._id.Ubicacion}`);
          }
          
          await skuCollection.createIndex(
            { SKU: 1, Ubicacion: 1 },
            { unique: true, name: 'sku_ubicacion_unique_idx' }
          );
          writeToLog(`    Duplicados eliminados e índice único compuesto creado`);
        } else {
          throw idxError;
        }
      }
    } else {
      writeToLog(`  Índice único compuesto (SKU + Ubicacion) ya existe`);
    }

    // *** EXCLUIR UBICACIONES RECARGADAS DEL MERGE (IGUAL QUE POLÍTICAS) ***
    const matchStage = ubicacionesRecaradasList.length > 0 
      ? { $match: { Ubicacion: { $nin: ubicacionesRecaradasList } } }
      : { $match: {} };

    // INSERTAR DOCUMENTOS DEL BACKUP EXCLUYENDO UBICACIONES RECARGADAS
    await backupCollection.aggregate([
      matchStage,
      { 
        $merge: {
          into: SOURCE_COLLECTION,
             on: ["SKU", "Ubicacion"], // Clave única: Producto@Ubicacion
          whenMatched: 'keepExisting', // Mantener los nuevos datos si hay conflicto
          whenNotMatched: 'insert'      // Insertar los datos del backup que no existan
        }
      }
    ], { allowDiskUse: true }).toArray();

    // CONTAR DOCUMENTOS DESPUÉS DEL MERGE
    const countSKUAfter = await skuCollection.estimatedDocumentCount();
    const docsAgregados = countSKUAfter - countSKUBefore;
    
    writeToLog(`  Merge completado. Documentos agregados del backup: ${docsAgregados}`);
    writeToLog(`    Total de documentos en ${SOURCE_COLLECTION} después del merge: ${countSKUAfter}`);
    
    // VERIFICACIÓN: CONTAR SKUs DE UBICACIONES RECARGADAS QUE SE EXCLUYERON
    if (ubicacionesRecaradasList.length > 0) {
      const docsRecaradasEnBackup = await backupCollection.countDocuments({
        Ubicacion: { $in: ubicacionesRecaradasList }
      });
      
      writeToLog(`  VERIFICACIÓN EXITOSA: ${docsRecaradasEnBackup} SKUs de ubicaciones recargadas EXCLUIDOS del merge`);
      writeToLog(`     RECARGAS: Ubicaciones recargadas mantienen solo sus SKUs nuevos (sin merge)`);
    }

    // ESTADÍSTICAS DETALLADAS
    const ubicacionesEnSKU = [...new Set((await skuCollection.find({}, { projection: { Ubicacion: 1 } }).toArray()).map(d => d.Ubicacion))];
    const productosEnSKU = [...new Set((await skuCollection.find({}, { projection: { Producto: 1 } }).toArray()).map(d => d.Producto))];
    
    writeToLog(` \n    ESTADÍSTICAS POST-MERGE:`);
    writeToLog(`      • Total SKUs: ${countSKUAfter}`);
    writeToLog(`      • Ubicaciones únicas: ${ubicacionesEnSKU.length}`);
    writeToLog(`      • Productos únicos: ${productosEnSKU.length}`);
    writeToLog(`      • SKUs agregados del backup: ${docsAgregados}`);

    // REGISTRAR EN AUDITORÍA
    const auditoriaCollection = db.collection('auditoria_merge_sku');
    await auditoriaCollection.insertOne({
      tipo_operacion: 'MERGE_SKU_INCREMENTAL',
      coleccion_origen: BACKUP_COLLECTION,
      coleccion_destino: SOURCE_COLLECTION,
      documentos_en_backup: countBackup,
      documentos_antes_merge: countSKUBefore,
      documentos_despues_merge: countSKUAfter,
      documentos_agregados: docsAgregados,
      ubicaciones_recargadas_excluidas: ubicacionesRecaradasList,
      fecha_merge: new Date(),
      timestamp: moment().format('YYYYMMDD_HHmmss'),
      proceso: 'Ejecuta_CambiosIncrementales_Sem'
    });
    
    writeToLog(`     Auditoría de merge registrada en 'auditoria_merge_sku'`);
    writeToLog(` \n========== MERGE DE SKU BACKUP COMPLETADO ==========\n`);

  } catch (error) {
    writeToLog(`  ERROR en merge de SKU backup: ${error.message}`);
    writeToLog(` Stack trace: ${error.stack}`);
    console.error('Error en merge SKU:', error);
    throw error;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

mergeSKUBackup().catch(console.error);