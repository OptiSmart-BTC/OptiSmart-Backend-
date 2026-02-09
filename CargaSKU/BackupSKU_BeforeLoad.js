const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const now = moment().format('YYYY-MM-DD HH:mm:ss');
const timestamp = moment().format('YYYYMMDD_HHmmss');

const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];
const AppUser = process.argv.slice(2)[2];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/dbvars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`;

const SOURCE_COLLECTION = 'sku';
const BACKUP_COLLECTION = 'sku_backup';

async function writeToLog(message) {
  fs.appendFileSync(logFile, `${message}\n`);
}

async function crearBackupSKU() {
  writeToLog(`\nPaso 03.5 - Creación de Backup de SKU (Modo Incremental)`);
  
  let client;
  
  try {
    const passadminDeCripta = await decryptData(`${DBPassword}`);
    const mongoUri = conex.getUrl(DBUser, passadminDeCripta, host, puerto, dbName);
    
    client = await MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = client.db();

    const skuCollection = db.collection(SOURCE_COLLECTION);
    const backupCollection = db.collection(BACKUP_COLLECTION);

    // Verificar si existe la colección SKU y tiene datos
    const countSKU = await skuCollection.countDocuments();
    
    if (countSKU === 0) {
      writeToLog(`\t  La colección '${SOURCE_COLLECTION}' está vacía - no hay nada que respaldar`);
      writeToLog(`\tBackup omitido (primera carga de datos)`);
      return;
    }

    writeToLog(`\t Iniciando backup de ${countSKU} documentos...`);

    // LIMPIAR backup anterior (siempre se reemplaza con el más reciente)
    await backupCollection.deleteMany({});
    writeToLog(`\t  Backup anterior eliminado`);

    // COPIAR todos los documentos de sku a sku_backup
    const documentosSKU = await skuCollection.find({}).toArray();
    
    if (documentosSKU.length > 0) {
      // Agregar metadatos de backup a cada documento
      // *** CORRECCIÓN: Remover _id original antes de insertar ***
      const documentosConMetadata = documentosSKU.map(doc => {
        const { _id, ...docSinId } = doc; // Extraer _id y usar el resto
        return {
          ...docSinId,
          _backup_metadata: {
            fecha_backup: new Date(),
            timestamp_backup: timestamp,
            version_backup: 'V1',
            origen: 'pre_carga_csv',
            id_original: _id // Guardar el _id original como referencia
          }
        };
      });

      await backupCollection.insertMany(documentosConMetadata);
      writeToLog(`\t Backup completado: ${documentosConMetadata.length} documentos copiados a '${BACKUP_COLLECTION}'`);
      
      // Estadísticas del backup
      const ubicacionesUnicas = [...new Set(documentosSKU.map(d => d.Ubicacion))];
      const productosUnicos = [...new Set(documentosSKU.map(d => d.Producto))];
      
      writeToLog(`\t    Estadísticas del backup:`);
      writeToLog(`\t       Ubicaciones: ${ubicacionesUnicas.length}`);
      writeToLog(`\t       Productos únicos: ${productosUnicos.length}`);
      writeToLog(`\t       Total SKUs: ${documentosConMetadata.length}`);
      writeToLog(`\t       Timestamp: ${timestamp}`);

      // CRÍTICO: Crear índice único compuesto (SKU + Ubicacion) para permitir $merge
      const skuIndexes = await skuCollection.indexes();
      const hasUniqueSkuUbicacionIndex = skuIndexes.some(idx => 
        idx.unique && 
        idx.key.SKU === 1 && 
        idx.key.Ubicacion === 1
      );

      if (!hasUniqueSkuUbicacionIndex) {
        writeToLog(`\t    Creando índice único compuesto (SKU + Ubicacion) para operaciones de merge...`);
        try {
          await skuCollection.createIndex(
            { SKU: 1, Ubicacion: 1 },
            { unique: true, name: 'sku_ubicacion_unique_idx' }
          );
          writeToLog(`\t    Índice único compuesto creado exitosamente`);
        } catch (indexError) {
          // Si el error es por duplicados existentes, informar pero continuar
          if (indexError.code === 11000) {
            writeToLog(`\t    ADVERTENCIA: No se pudo crear índice único - existen duplicados en la colección`);
            writeToLog(`\t    Se recomienda limpiar duplicados antes de la siguiente carga`);
          } else {
            throw indexError;
          }
        }
      } else {
        writeToLog(`\t    Índice único compuesto (SKU + Ubicacion) ya existe`);
      }

      // Crear índice en la colección de backup para búsquedas rápidas
      await backupCollection.createIndex({ SKU: 1 });
      await backupCollection.createIndex({ Ubicacion: 1 });
      await backupCollection.createIndex({ Producto: 1 });
      writeToLog(`\t    Índices creados en colección de backup`);

    } else {
      writeToLog(`\t  No se encontraron documentos para respaldar`);
    }

    // Registrar en auditoría
    const auditoriaCollection = db.collection('auditoria_backups_sku');
    await auditoriaCollection.insertOne({
      tipo_backup: 'SKU_PRE_CARGA',
      coleccion_origen: SOURCE_COLLECTION,
      coleccion_destino: BACKUP_COLLECTION,
      documentos_respaldados: documentosSKU.length,
      ubicaciones_respaldadas: [...new Set(documentosSKU.map(d => d.Ubicacion))],
      fecha_backup: new Date(),
      timestamp: timestamp,
      ejecutado_por: AppUser || 'sistema',
      proceso: 'loadCSV_SKU'
    });
    
    writeToLog(`\t    Auditoría de backup registrada`);
    writeToLog(`\tPaso 03.5 completado exitosamente\n`);

  } catch (error) {
    writeToLog(`${now} -  ERROR en backup de SKU: ${error.message}`);
    writeToLog(`Stack trace: ${error.stack}`);
    console.error('Error en backup:', error);
    throw error;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Obtener el valor desencriptado de passadmin
async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}

crearBackupSKU();