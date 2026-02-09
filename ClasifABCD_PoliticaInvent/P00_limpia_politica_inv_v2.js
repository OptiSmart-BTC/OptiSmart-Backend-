const fs = require('fs');
const path = require('path');
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
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

async function eliminarColecciones() {
  let client;
  try {
    writeToLog('\n\nProceso de Generacion de la Politica de Inventarios');
    writeToLog(`\nInicio de ejecucion: ${now}\n`);
    writeToLog(`\nPaso 00 - Depuracion de Tablas de Politica de Inventarios`);

    client = await MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = client.db();

    // ✅ DETECTAR MODO DE PROCESAMIENTO
    const esIncremental = await detectarModoIncremental(db);
    
    if (esIncremental) {
      writeToLog(`🔄 MODO INCREMENTAL DETECTADO - Preservando politica_inventarios_01`);
      await limpiarSoloTemporales(db);
    } else {
      writeToLog(`🔄 MODO COMPLETO - Limpiando todas las tablas incluida politica_inventarios_01`);
      await limpiarTodasLasTablas(db);
    }

    writeToLog(`\tTermina el Proceso de depuracion`);

  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
    throw error;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

async function detectarModoIncremental(db) {
  try {
    // Verificar si existe tabla de cambios (señal de proceso incremental)
    const collections = await db.listCollections({ name: 'cambios_ubicaciones_temp' }).toArray();
    const existeCambios = collections.length > 0;
    
    if (existeCambios) {
      const cambios = await db.collection('cambios_ubicaciones_temp').find().toArray();
      const hayUbicacionesNuevas = cambios.some(c => 
        c.tipo_cambio === 'NUEVA' || c.tipo_cambio === 'ACTUALIZADA'
      );
      
      if (hayUbicacionesNuevas) {
        const ubicacionesNuevas = cambios
          .filter(c => c.tipo_cambio === 'NUEVA' || c.tipo_cambio === 'ACTUALIZADA')
          .map(c => c.ubicacion);
        writeToLog(`Ubicaciones detectadas para procesamiento incremental: [${ubicacionesNuevas.join(', ')}]`);
        return true;
      }
    }
    
    return false;
  } catch (err) {
    writeToLog(`⚠️ Error detectando modo incremental: ${err.message}`);
    return false; // Default a modo completo si hay error
  }
}

async function limpiarSoloTemporales(db) {
  writeToLog(`🧹 Limpiando solo tablas temporales (preservando politica_inventarios_01)...`);
  
  // ✅ TABLAS QUE SÍ SE PUEDEN LIMPIAR EN MODO INCREMENTAL
  const tablasTemporales = [
    'ui_politica_inventarios',      // Temporal, se regenera
    'ui_pol_inv_dias_cobertura',    // Se regenera
    'ui_pol_inv_pallets',           // Se regenera  
    'ui_pol_inv_costo',             // Se regenera
    'ui_pol_inv_uom',               // Se regenera
    // Tablas internas temporales
    'politica_inventarios_costo',   // Temporal
    'ui_all_pol_inv_temp',
    'politica_temp',
    'carga_inicial_politicas',
    'campos_iniciales',
    'demanda_promedio_diaria',
    'valor_z',
    'ds_demanda',
    'stat_ss',
    'ss_cantidad',
    'demanda_lt',
    'roq_calculado',
    'rop_calculado',
    'meta_calculado',
    'inventario_promedio',
    'ui_temp_politicas',
    'dias_cobertura',
    'vida_util_dias',
    'pallets_calculado',
    'costo_calculado',
    'uom_calculado',
    'ui_costos_temp'
  ];
  
  let tablasLimpiadas = 0;
  let registrosEliminados = 0;
  
  for (const tabla of tablasTemporales) {
    try {
      const resultado = await db.collection(tabla).deleteMany({});
      if (resultado.deletedCount > 0) {
        writeToLog(`✅ Limpiada ${tabla}: ${resultado.deletedCount} registros`);
        registrosEliminados += resultado.deletedCount;
        tablasLimpiadas++;
      }
    } catch (err) {
      // No es crítico si la tabla no existe
      writeToLog(`⚠️ Tabla ${tabla}: ${err.message}`);
    }
  }
  
  writeToLog(`📊 RESUMEN MODO INCREMENTAL:`);
  writeToLog(`   Tablas limpiadas: ${tablasLimpiadas}`);
  writeToLog(`   Registros eliminados: ${registrosEliminados}`);
  writeToLog(`   ✅ politica_inventarios_01 PRESERVADA`);
}

async function limpiarTodasLasTablas(db) {
  writeToLog(`🧹 Limpiando TODAS las tablas de políticas...`);
  
  // ✅ TODAS LAS TABLAS (incluidas las principales) - TU CÓDIGO ORIGINAL
  const todasLasTablas = [
    'politica_inventarios_01',        // ✅ En modo completo SÍ se limpia
    'politica_inventarios_costo',
    'ui_politica_inventarios',
    'ui_pol_inv_dias_cobertura',
    'ui_pol_inv_pallets',
    'ui_pol_inv_costo',
    'ui_pol_inv_uom'
  ];
  
  let tablasLimpiadas = 0;
  let registrosEliminados = 0;
  
  for (const tabla of todasLasTablas) {
    try {
      // Usar dropCollection como en tu código original para ser más eficiente
      await db.dropCollection(tabla);
      writeToLog(`✅ Eliminada colección: ${tabla}`);
      tablasLimpiadas++;
    } catch (error) {
      // Si no existe la colección, no es error crítico
      if (error.codeName !== 'NamespaceNotFound') {
        writeToLog(`⚠️ Error eliminando ${tabla}: ${error.message}`);
      }
    }
  }
  
  writeToLog(`📊 RESUMEN MODO COMPLETO:`);
  writeToLog(`   Colecciones eliminadas: ${tablasLimpiadas}`);
  writeToLog(`   ✅ Todas las tablas limpiadas (incluida politica_inventarios_01)`);
}

function writeToLog(message) {
  const moment = require('moment');
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  const logMessage = `[${timestamp}] P00: ${message}`;
  
  try {
    // Lógica mejorada para determinar el directorio de log
    let parametroFolder;
    try {
      if (typeof dbName !== 'undefined' && dbName) {
        const partes = dbName.split("_");
        let parte = partes[partes.length - 1];
        
        // Si la última parte parece un timestamp (12+ dígitos), usar la anterior
        if (/^\d{12,}$/.test(parte)) {
          parte = partes[partes.length - 2];
        }
        
        parametroFolder = parte.toUpperCase();
      } else {
        parametroFolder = 'DEFAULT';
      }
    } catch (error) {
      parametroFolder = 'DEFAULT';
    }
    
    const logFile = path.resolve(__dirname, `../../${parametroFolder}/log/ClasABCD_PolInvent.log`);
    const logDir = path.dirname(logFile);
    
    // Crear directorio si no existe
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Escribir al archivo de log
    fs.appendFileSync(logFile, logMessage + '\n');
    
    // También mostrar en consola
    console.log(logMessage);
  } catch (err) {
    // Fallback: escribir en directorio actual si hay problemas
    try {
      const fallbackLogFile = path.join(__dirname, `${path.basename(__filename, '.js')}_fallback.log`);
      fs.appendFileSync(fallbackLogFile, logMessage + '\n');
      console.error(`Log escrito en fallback: ${fallbackLogFile}`);
    } catch (fallbackErr) {
      // Si todo falla, solo mostrar en consola
      console.error(`Error escribiendo log: ${err.message}`);
      console.log(logMessage);
    }
  }
}

eliminarColecciones();