const fs = require("fs");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require('moment');
const crypto = require('crypto');

const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

// CONFIGURACIÓN DE LOGS
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`;

async function crearPoliticaInventariosFinal() {
  const client = new MongoClient(mongoUri);
  let esIncremental = false;
  let ubicacionesNuevas = [];
  
  try {
    await client.connect();
    const db = client.db(dbName);
    
    writeToLog('P22 - Creando tabla final politica_inventarios_01 CON HISTORIAL');

    // *** VERIFICAR SI DEBE EJECUTARSE (CON PROTECCIÓN ANTI-DUPLICADOS) ***
    const debeEjecutarse = await verificarSiDebeEjecutarse(db);
    if (!debeEjecutarse) {
      writeToLog('P22 SALTADO - Ejecución reciente detectada o cambios ya procesados');
      console.log('P22: Saltado por ejecución reciente');
      return;
    }

    // DETECTAR MODO DE PROCESAMIENTO
    esIncremental = await detectarModoIncremental(db);
    
    if (esIncremental) {
      ubicacionesNuevas = await getUbicacionesIncrementales(db);
      writeToLog(`MODO INCREMENTAL - Integrando ${ubicacionesNuevas.length} ubicaciones: [${ubicacionesNuevas.join(', ')}]`);
      await integrarPoliticaIncrementalConHistorial(db, ubicacionesNuevas);
      
      // MARCAR ESTADO INCREMENTAL COMPLETADO
      await marcarEstadoProcesamientoCompletado(db, 'INCREMENTAL', ubicacionesNuevas);
      
      // PROCESAR SEÑALES DE P24
      await procesarSenalesP24(db);
      
    } else {
      writeToLog('MODO COMPLETO - Creando politica_inventarios_01 completa');
      await crearPoliticaCompleta(db);
      
      // MARCAR ESTADO COMPLETO COMPLETADO
      await marcarEstadoProcesamientoCompletado(db, 'COMPLETO', []);
    }

    writeToLog('P22 completado exitosamente');

  } catch (err) {
    writeToLog(`Error en P22: ${err.message}`);
    console.error("Error en P22:", err);
    throw err;
  } finally {
    await client.close();
  }
}

// *** FUNCIÓN MEJORADA: VERIFICAR SI DEBE EJECUTARSE ***
async function verificarSiDebeEjecutarse(db) {
  try {
    // VERIFICAR PARÁMETROS ESPECIALES
    const FORCE_EXECUTION = process.argv.includes('--force');
    const SKIP_IF_RECENT = process.argv.includes('--skip-if-recent');
    
    if (FORCE_EXECUTION) {
      writeToLog('PARÁMETRO --force detectado - Forzando ejecución');
      return true;
    }
    
    // *** VERIFICAR MÚLTIPLES FUENTES DE ESTADO ***
    
    // 1. VERIFICAR ESTADO DE P22
    const estadoP22 = db.collection('estado_procesamiento_p22');
    const estadoRecienteP22 = await estadoP22.findOne({
      _id: 'ultimo_procesamiento'
    });
    
    // 2. VERIFICAR ESTADO DE P24 (más específico)
    const estadoP24 = db.collection('estado_procesamiento_p24');
    const estadoRecienteP24 = await estadoP24.findOne({
      _id: 'ultimo_procesamiento_incremental'
    });
    
    // 3. VERIFICAR LOCK TEMPORAL
    const lockCollection = db.collection('p22_execution_lock');
    const lockActivo = await lockCollection.findOne({
      _id: 'p22_incremental_lock',
      activo: true,
      expira_en: { $gt: new Date() }
    });
    
    // *** USAR EL ESTADO MÁS RECIENTE ***
    let estadoMasReciente = null;
    let fuente = '';
    
    if (estadoRecienteP22 && estadoRecienteP24) {
      if (estadoRecienteP22.fecha_completado > estadoRecienteP24.fecha_completado) {
        estadoMasReciente = estadoRecienteP22;
        fuente = 'P22';
      } else {
        estadoMasReciente = estadoRecienteP24;
        fuente = 'P24';
      }
    } else if (estadoRecienteP22) {
      estadoMasReciente = estadoRecienteP22;
      fuente = 'P22';
    } else if (estadoRecienteP24) {
      estadoMasReciente = estadoRecienteP24;
      fuente = 'P24';
    }
    
    if (estadoMasReciente && estadoMasReciente.completado) {
      const minutosTranscurridos = (new Date() - estadoMasReciente.fecha_completado) / (1000 * 60);
      
      // *** VENTANA MÁS ESTRICTA PARA INCREMENTALES ***
      const VENTANA_INCREMENTAL_SEGUNDOS = 30; // 30 segundos
      const VENTANA_COMPLETO_MINUTOS = 15; // 15 minutos
      
      const esIncremental = estadoMasReciente.tipo_procesamiento === 'INCREMENTAL';
      const ventanaLimite = esIncremental ? (VENTANA_INCREMENTAL_SEGUNDOS / 60) : VENTANA_COMPLETO_MINUTOS;
      
      if (minutosTranscurridos < ventanaLimite) {
        writeToLog(`EJECUCIÓN RECIENTE DETECTADA (fuente: ${fuente}):`);
        writeToLog(`   Tipo: ${estadoMasReciente.tipo_procesamiento}`);
        writeToLog(`   Fecha: ${estadoMasReciente.fecha_completado}`);
        writeToLog(`   Minutos transcurridos: ${minutosTranscurridos.toFixed(2)}`);
        writeToLog(`   Ventana límite: ${esIncremental ? VENTANA_INCREMENTAL_SEGUNDOS + 's' : VENTANA_COMPLETO_MINUTOS + 'm'}`);
        writeToLog(`   Ubicaciones procesadas: [${(estadoMasReciente.ubicaciones_procesadas || []).join(', ')}]`);
        
        // *** AUTO-SKIP PARA INCREMENTALES RECIENTES ***
        if (esIncremental && minutosTranscurridos < (VENTANA_INCREMENTAL_SEGUNDOS / 60)) {
          writeToLog(`   AUTO-SKIP: Procesamiento incremental demasiado reciente`);
          writeToLog(`   P22 ya procesó estas ubicaciones hace ${(minutosTranscurridos * 60).toFixed(1)} segundos`);
          return false;
        }
        
        if (SKIP_IF_RECENT) {
          writeToLog('   PARÁMETRO --skip-if-recent: Saltando ejecución');
          return false;
        }
      } else {
        writeToLog(`Última ejecución (${fuente}) hace ${minutosTranscurridos.toFixed(1)} minutos - OK para ejecutar`);
      }
    } else {
      writeToLog('No se encontró estado de procesamiento previo - OK para ejecutar');
    }
    
    // *** VERIFICAR CAMBIOS YA PROCESADOS RECIENTEMENTE ***
    const cambiosCollection = db.collection('cambios_ubicaciones_temp');
    const cambiosRecientes = await cambiosCollection.find({
      procesado: true,
      fecha_procesado: { $gte: new Date(Date.now() - 2 * 60 * 1000) } // Últimos 2 minutos
    }).toArray();
    
    if (cambiosRecientes.length > 0) {
      const todosCambios = await cambiosCollection.find().toArray();
      const todosProcesadosRecientemente = todosCambios.every(c => 
        c.procesado && c.fecha_procesado && 
        (new Date() - c.fecha_procesado) < (2 * 60 * 1000)
      );
      
      if (todosProcesadosRecientemente && todosCambios.length > 0) {
        writeToLog(`CAMBIOS YA PROCESADOS RECIENTEMENTE:`);
        writeToLog(`   ${cambiosRecientes.length} cambios procesados en los últimos 2 minutos`);
        writeToLog(`   TODOS los cambios fueron procesados recientemente - SALTANDO P22`);
        return false;
      }
    }
    
    // *** VERIFICAR HASH DE UBICACIONES (EVITAR DUPLICADOS EXACTOS) ***
    if (estadoMasReciente && estadoMasReciente.hash_ubicaciones) {
      const cambiosPendientes = await cambiosCollection.find({
        $or: [
          { tipo_cambio: 'NUEVA' },
          { tipo_cambio: 'ACTUALIZADA' }
        ]
      }).toArray();
      
      if (cambiosPendientes.length > 0) {
        const ubicacionesActuales = cambiosPendientes.map(c => c.ubicacion).sort();
        const hashActual = crypto.createHash('md5').update(ubicacionesActuales.join(',')).digest('hex');
        
        if (estadoMasReciente.hash_ubicaciones === hashActual) {
          const esReciente = (new Date() - estadoMasReciente.fecha_completado) < (5 * 60 * 1000); // 5 minutos
          if (esReciente) {
            writeToLog(`HASH IDÉNTICO DETECTADO:`);
            writeToLog(`   Mismas ubicaciones procesadas recientemente`);
            writeToLog(`   Hash: ${hashActual}`);
            writeToLog(`   EVITANDO DUPLICADO - SALTANDO P22`);
            return false;
          }
        }
      }
    }
    
    return true;
    
  } catch (err) {
    writeToLog(`Error verificando estado de procesamiento: ${err.message}`);
    return true; // En caso de error, permitir ejecución
  }
}

// *** FUNCIÓN PARA PROCESAR SEÑALES DE P24 ***
async function procesarSenalesP24(db) {
  try {
    const senalCollection = db.collection('p22_signals');
    const senal = await senalCollection.findOne({ _id: 'incremental_ready' });
    
    if (senal && senal.ready && !senal.processed_by_p22) {
      writeToLog(`Procesando señal de P24:`);
      writeToLog(`   Ubicaciones señaladas: [${senal.ubicaciones.join(', ')}]`);
      
      // Marcar señal como procesada
      await senalCollection.updateOne(
        { _id: 'incremental_ready' },
        {
          $set: {
            processed_by_p22: true,
            processed_at: new Date()
          }
        }
      );
      
      writeToLog(`Señal marcada como procesada por P22`);
    }
    
    // Limpiar señales antiguas
    await senalCollection.deleteMany({
      created_at: { $lt: new Date(Date.now() - 30 * 60 * 1000) } // Más de 30 minutos
    });
    
  } catch (err) {
    writeToLog(`Error procesando señales P24: ${err.message}`);
  }
}

// *** FUNCIÓN MEJORADA PARA MARCAR ESTADO COMPLETADO ***
async function marcarEstadoProcesamientoCompletado(db, tipoProcessing, ubicacionesProcesadas) {
  try {
    const estadoCollection = db.collection('estado_procesamiento_p22');
    
    const hashUbicaciones = ubicacionesProcesadas.length > 0 ? 
      crypto.createHash('md5').update(ubicacionesProcesadas.sort().join(',')).digest('hex') : 
      null;
    
    const estadoActual = {
      _id: 'ultimo_procesamiento',
      tipo_procesamiento: tipoProcessing,
      fecha_completado: new Date(),
      ubicaciones_procesadas: ubicacionesProcesadas,
      completado: true,
      version_ejecucion: moment().format('YYYYMMDD_HHmmss'),
      usuario: process.env.USER || 'system',
      script_origen: 'P22',
      sesion_id: `P22_${Date.now()}`,
      hash_ubicaciones: hashUbicaciones
    };
    
    await estadoCollection.replaceOne(
      { _id: 'ultimo_procesamiento' },
      estadoActual,
      { upsert: true }
    );
    
    writeToLog(`Estado de procesamiento guardado: ${tipoProcessing}`);
    writeToLog(`   Ubicaciones: [${ubicacionesProcesadas.join(', ')}]`);
    writeToLog(`   Sesión ID: ${estadoActual.sesion_id}`);
    if (hashUbicaciones) {
      writeToLog(`   Hash ubicaciones: ${hashUbicaciones}`);
    }
    
    // Limpiar estados antiguos
    await limpiarEstadosDuplicados(db);
    
    // Limpiar cambios procesados tras éxito
    await limpiarCambiosProcesados(db);
    
  } catch (err) {
    writeToLog(`Error guardando estado de procesamiento: ${err.message}`);
  }
}

// *** FUNCIÓN PARA LIMPIAR ESTADOS DUPLICADOS ***
async function limpiarEstadosDuplicados(db) {
  try {
    writeToLog(`Limpiando estados duplicados...`);
    
    // Limpiar locks expirados
    const lockCollection = db.collection('p22_execution_lock');
    const resultadoLocks = await lockCollection.deleteMany({
      expira_en: { $lt: new Date() }
    });
    
    // Limpiar señales procesadas
    const senalCollection = db.collection('p22_signals');
    const resultadoSenales = await senalCollection.deleteMany({
      processed_by_p22: true,
      processed_at: { $lt: new Date(Date.now() - 10 * 60 * 1000) } // Más de 10 minutos
    });
    
    writeToLog(`Limpieza completada: locks=${resultadoLocks.deletedCount}, señales=${resultadoSenales.deletedCount}`);
    
  } catch (err) {
    writeToLog(`Error limpiando estados duplicados: ${err.message}`);
  }
}

// *** FUNCIÓN PARA LIMPIAR CAMBIOS PROCESADOS ***
async function limpiarCambiosProcesados(db) {
  try {
    writeToLog(`Limpiando cambios procesados...`);
    
    const cambiosCollection = db.collection('cambios_ubicaciones_temp');
    const resultado = await cambiosCollection.deleteMany({
      procesado: true,
      fecha_procesado: { $lt: new Date(Date.now() - 5 * 60 * 1000) } // Más de 5 minutos
    });
    
    writeToLog(`Cambios procesados eliminados: ${resultado.deletedCount}`);
    
  } catch (err) {
    writeToLog(`Error limpiando cambios procesados: ${err.message}`);
  }
}

async function detectarModoIncremental(db) {
  try {
    const collections = await db.listCollections({ name: 'cambios_ubicaciones_temp' }).toArray();
    const existeCambios = collections.length > 0;
    
    if (existeCambios) {
      const cambios = await db.collection('cambios_ubicaciones_temp').find().toArray();
      const hayUbicacionesNuevas = cambios.some(c => 
        c.tipo_cambio === 'NUEVA' || c.tipo_cambio === 'ACTUALIZADA'
      );
      
      writeToLog(`Cambios encontrados en cambios_ubicaciones_temp: ${cambios.length}`);
      writeToLog(`   Hay ubicaciones para procesar: ${hayUbicacionesNuevas}`);
      
      return hayUbicacionesNuevas;
    }
    
    writeToLog('No se encontró colección cambios_ubicaciones_temp - Modo COMPLETO');
    return false;
  } catch (err) {
    writeToLog(`Error detectando modo incremental: ${err.message}`);
    return false;
  }
}

async function getUbicacionesIncrementales(db) {
  try {
    const cambios = await db.collection('cambios_ubicaciones_temp').find({
      $or: [
        { tipo_cambio: 'NUEVA' },
        { tipo_cambio: 'ACTUALIZADA' }
      ]
    }).toArray();
    
    const ubicaciones = cambios.map(c => c.ubicacion);
    writeToLog(`Ubicaciones incrementales obtenidas: [${ubicaciones.join(', ')}]`);
    
    return ubicaciones;
  } catch (err) {
    writeToLog(`Error obteniendo ubicaciones incrementales: ${err.message}`);
    return [];
  }
}

// *** FUNCIÓN CORRECTA - P22 SOLO ORGANIZA, NO AÑADE DATOS ***
async function integrarPoliticaIncrementalConHistorial(db, ubicacionesNuevas) {
  writeToLog('P22 - MODO INCREMENTAL: Organizando datos YA procesados por P24...');
  
  if (ubicacionesNuevas.length === 0) {
    writeToLog('No hay ubicaciones nuevas que procesar');
    return;
  }

  const targetCollection = db.collection('politica_inventarios_01');

  // *** VERIFICAR QUE YA EXISTEN DATOS PROCESADOS POR P24 ***
  writeToLog(`Verificando datos procesados por P24 para ubicaciones: [${ubicacionesNuevas.join(', ')}]`);
  
  const datosExistentes = await targetCollection.find({
    Ubicacion: { $in: ubicacionesNuevas },
    // Buscar datos que vienen del P24 (pueden no tener Es_Actual todavía)
    $or: [
      { Es_Actual: { $exists: false } },  // Datos nuevos de P24
      { Es_Actual: true },                // Datos ya marcados
      { Es_Actual: false }                // Datos históricos
    ]
  }).toArray();
  
  writeToLog(`Datos encontrados en politica_inventarios_01: ${datosExistentes.length} registros`);

  if (datosExistentes.length === 0) {
    writeToLog(' No se encontraron datos procesados por P24 - P22 no puede continuar');
    writeToLog('   P24 debe ejecutarse primero para generar los datos');
    return;
  }

  const fechaEjecucion = new Date();
  const versionEjecucion = moment().format('YYYYMMDD_HHmmss');
  
  // *** PASO 1: IDENTIFICAR DATOS NUEVOS VS HISTÓRICOS ***
  writeToLog(`Analizando datos existentes...`);
  
  // Agrupar por SKU+Ubicación para identificar duplicados
  const gruposPorSKUUbicacion = {};
  datosExistentes.forEach(doc => {
    const key = `${doc.SKU}|${doc.Ubicacion}`;
    if (!gruposPorSKUUbicacion[key]) {
      gruposPorSKUUbicacion[key] = [];
    }
    gruposPorSKUUbicacion[key].push(doc);
  });
  
  let registrosActualizados = 0;
  let registrosMarcadosHistoricos = 0;
  let registrosYaCorrectos = 0;
  
  // *** PASO 2: PROCESAR CADA GRUPO SKU+UBICACIÓN ***
  for (const [key, registros] of Object.entries(gruposPorSKUUbicacion)) {
    const [sku, ubicacion] = key.split('|');
    
    if (registros.length === 1) {
      // Solo un registro - solo asegurar que esté marcado como actual
      const registro = registros[0];
      if (!registro.Es_Actual) {
        await targetCollection.updateOne(
          { _id: registro._id },
          {
            $set: {
              Es_Actual: true,
              Fecha_Calculo: fechaEjecucion,
              Version_Calculo: versionEjecucion,
              Modo_Procesamiento: 'INCREMENTAL'
            }
          }
        );
        registrosActualizados++;
        writeToLog(`    Marcado como actual: SKU ${sku}, Ubicación ${ubicacion}`);
      } else {
        registrosYaCorrectos++;
      }
    } else {
      // Múltiples registros - mantener el más reciente, marcar otros como históricos
      writeToLog(`    Resolviendo ${registros.length} duplicados para SKU ${sku}, Ubicación ${ubicacion}`);
      
      // Ordenar por fecha de inserción/timestamp (más reciente primero)
      const registrosOrdenados = registros.sort((a, b) => {
        const fechaA = a.Timestamp_Insert || a.Fecha_Calculo || new Date(0);
        const fechaB = b.Timestamp_Insert || b.Fecha_Calculo || new Date(0);
        return new Date(fechaB) - new Date(fechaA);
      });
      
      const registroMasReciente = registrosOrdenados[0];
      const registrosAMarcarHistoricos = registrosOrdenados.slice(1);
      
      // Marcar el más reciente como actual
      await targetCollection.updateOne(
        { _id: registroMasReciente._id },
        {
          $set: {
            Es_Actual: true,
            Fecha_Calculo: fechaEjecucion,
            Version_Calculo: versionEjecucion,
            Modo_Procesamiento: 'INCREMENTAL'
          }
        }
      );
      registrosActualizados++;
      
      // Marcar los demás como históricos
      for (const regHistorico of registrosAMarcarHistoricos) {
        await targetCollection.updateOne(
          { _id: regHistorico._id },
          {
            $set: {
              Es_Actual: false,
              Fecha_Historico: fechaEjecucion,
              Version_Historico: versionEjecucion,
              Motivo_Historico: 'Duplicado resuelto por P22'
            }
          }
        );
        registrosMarcadosHistoricos++;
      }
      
      writeToLog(`     → Actual: ${registroMasReciente._id}`);
      writeToLog(`     → Históricos: ${registrosAMarcarHistoricos.length}`);
    }
  }
  
  // *** PASO 3: VERIFICAR RESULTADO FINAL ***
  const totalActuales = await targetCollection.countDocuments({ 
    Es_Actual: true,
    Ubicacion: { $in: ubicacionesNuevas }
  });
  
  const totalHistoricos = await targetCollection.countDocuments({ 
    Es_Actual: false,
    Ubicacion: { $in: ubicacionesNuevas }
  });
  
  writeToLog(` P22 INCREMENTAL COMPLETADO:`);
  writeToLog(`    Registros actuales para ubicaciones procesadas: ${totalActuales}`);
  writeToLog(`    Registros históricos: ${totalHistoricos}`);
  writeToLog(`    Registros actualizados: ${registrosActualizados}`);
  writeToLog(`    Registros marcados históricos: ${registrosMarcadosHistoricos}`);
  writeToLog(`    Registros ya correctos: ${registrosYaCorrectos}`);
  writeToLog(`    Ubicaciones procesadas: [${ubicacionesNuevas.join(', ')}]`);
  
  // Mostrar resumen por ubicación
  for (const ubicacion of ubicacionesNuevas) {
    const countUbicacion = await targetCollection.countDocuments({
      Ubicacion: ubicacion,
      Es_Actual: true
    });
    writeToLog(`    Ubicación ${ubicacion}: ${countUbicacion} registros actuales`);
  }
}

// *** FUNCIÓN PARA MODO COMPLETO - CORREGIDA PARA SOLO ORGANIZAR ***
async function crearPoliticaCompleta(db) {
  writeToLog('P22 - MODO COMPLETO: Organizando TODOS los datos YA procesados por P24...');
  
  const targetCollection = db.collection('politica_inventarios_01');
  
  // *** VERIFICAR QUE YA EXISTEN DATOS PROCESADOS POR P24 ***
  const totalRegistros = await targetCollection.countDocuments();
  if (totalRegistros === 0) {
    writeToLog(' No hay datos en politica_inventarios_01 - P24 debe ejecutarse primero');
    writeToLog('   P22 solo organiza datos, no los crea. P24 es quien hace los cálculos.');
    return;
  }
  
  writeToLog(` Datos encontrados en politica_inventarios_01: ${totalRegistros} registros`);
  writeToLog('   Procediendo a organizar datos YA calculados por P24...');
  
  const fechaEjecucion = new Date();
  const versionEjecucion = moment().format('YYYYMMDD_HHmmss');
  
  // *** PASO 1: MARCAR TODOS LOS REGISTROS EXISTENTES COMO HISTÓRICOS ***
  writeToLog(` Marcando registros previos como históricos...`);
  const resultadoHistorial = await targetCollection.updateMany(
    { Es_Actual: { $ne: false } },
    {
      $set: {
        Es_Actual: false,
        Fecha_Historico: fechaEjecucion,
        Version_Historico: versionEjecucion,
        Motivo_Historico: 'P22: Reorganización completa - marcando versión anterior como histórica'
      }
    }
  );
  writeToLog(`    Registros marcados como históricos: ${resultadoHistorial.modifiedCount}`);
  
  // *** PASO 2: IDENTIFICAR EL REGISTRO MÁS RECIENTE POR CADA SKU+UBICACIÓN ***
  writeToLog(` Identificando registros más recientes por SKU+Ubicación...`);
  
  const pipeline = [
    {
      $sort: { 
        Timestamp_Insert: -1, 
        Fecha_Calculo: -1,
        _id: -1 
      }
    },
    {
      $group: {
        _id: { SKU: "$SKU", Ubicacion: "$Ubicacion" },
        registroMasReciente: { $first: "$$ROOT" },
        totalRegistros: { $sum: 1 }
      }
    }
  ];
  
  const registrosMasRecientes = await targetCollection.aggregate(pipeline).toArray();
  writeToLog(`    Combinaciones SKU+Ubicación únicas: ${registrosMasRecientes.length}`);
  
  // Contar duplicados para información
  const totalDuplicados = registrosMasRecientes.reduce((sum, item) => sum + (item.totalRegistros - 1), 0);
  if (totalDuplicados > 0) {
    writeToLog(`     Duplicados detectados: ${totalDuplicados} registros redundantes`);
  }
  
  // *** PASO 3: MARCAR LOS MÁS RECIENTES COMO ACTUALES ***
  writeToLog(` Marcando registros más recientes como actuales...`);
  let registrosActualizados = 0;
  let erroresActualizacion = 0;
  
  for (const item of registrosMasRecientes) {
    try {
      await targetCollection.updateOne(
        { _id: item.registroMasReciente._id },
        {
          $set: {
            Es_Actual: true,
            Fecha_Calculo: fechaEjecucion,
            Version_Calculo: versionEjecucion,
            Modo_Procesamiento: 'COMPLETO',
            // *** IMPORTANTE: PRESERVAR TODOS LOS DATOS ORIGINALES ***
            // No modificamos ningún campo de negocio, solo metadatos de organización
            Procesado_Por: 'P22_Organizacion',
            Nota_Procesamiento: 'Datos calculados por P24, organizados por P22'
          }
        }
      );
      registrosActualizados++;
      
      // Log cada 1000 registros para seguimiento
      if (registrosActualizados % 1000 === 0) {
        writeToLog(`   ... procesados ${registrosActualizados}/${registrosMasRecientes.length}`);
      }
    } catch (err) {
      erroresActualizacion++;
      writeToLog(`    Error actualizando registro ${item.registroMasReciente._id}: ${err.message}`);
    }
  }
  
  // *** PASO 4: VERIFICACIÓN FINAL ***
  const totalActuales = await targetCollection.countDocuments({ Es_Actual: true });
  const totalHistoricos = await targetCollection.countDocuments({ Es_Actual: false });
  const ubicacionesTotales = await targetCollection.distinct('Ubicacion', { Es_Actual: true });
  const skusUnicos = await targetCollection.distinct('SKU', { Es_Actual: true });
  
  writeToLog(`\n ========== RESUMEN FINAL P22 COMPLETO ==========`);
  writeToLog(`    Modo: SOLO ORGANIZACIÓN (no creación de datos)`);
  writeToLog(`    Total registros actuales: ${totalActuales}`);
  writeToLog(`    Total registros históricos: ${totalHistoricos}`);
  writeToLog(`    Registros reorganizados: ${registrosActualizados}`);
  writeToLog(`    Errores de actualización: ${erroresActualizacion}`);
  writeToLog(`    Total ubicaciones activas: ${ubicacionesTotales.length}`);
  writeToLog(`    Total SKUs únicos: ${skusUnicos.length}`);
  writeToLog(`    Promedio registros por ubicación: ${(totalActuales / ubicacionesTotales.length).toFixed(1)}`);
  
  // Verificar que no hay duplicados actuales
  const duplicadosActuales = await targetCollection.aggregate([
    { $match: { Es_Actual: true } },
    { $group: { _id: { SKU: "$SKU", Ubicacion: "$Ubicacion" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();
  
  if (duplicadosActuales.length === 0) {
    writeToLog(`    Verificación: No hay duplicados en registros actuales`);
  } else {
    writeToLog(`    ADVERTENCIA: ${duplicadosActuales.length} combinaciones SKU+Ubicación con duplicados`);
    // En este caso, deberías ejecutar la función de limpieza de duplicados
  }
  
  writeToLog(`================================================\n`);
  
  // *** OPCIONAL: LIMPIEZA DE DUPLICADOS SI SE DETECTAN ***
  if (duplicadosActuales.length > 0) {
    writeToLog(` Ejecutando limpieza de duplicados...`);
    await limpiarDuplicadosActuales(db);
  }
}

// *** FUNCIÓN AUXILIAR PARA LIMPIAR DUPLICADOS ACTUALES ***
async function limpiarDuplicadosActuales(db) {
  writeToLog(` Limpiando duplicados en registros actuales...`);
  
  const targetCollection = db.collection('politica_inventarios_01');
  
  const duplicados = await targetCollection.aggregate([
    { $match: { Es_Actual: true } },
    {
      $group: {
        _id: { SKU: "$SKU", Ubicacion: "$Ubicacion" },
        count: { $sum: 1 },
        docs: { $push: "$ROOT" }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();
  
  let totalLimpiados = 0;
  
  for (const dup of duplicados) {
    // Mantener el más reciente, marcar otros como históricos
    const docsOrdenados = dup.docs.sort((a, b) => 
      new Date(b.Timestamp_Insert || 0) - new Date(a.Timestamp_Insert || 0)
    );
    
    const mantener = docsOrdenados[0];
    const eliminar = docsOrdenados.slice(1);
    
    for (const doc of eliminar) {
      await targetCollection.updateOne(
        { _id: doc._id },
        {
          $set: {
            Es_Actual: false,
            Fecha_Historico: new Date(),
            Motivo_Historico: 'P22: Duplicado resuelto - manteniendo más reciente'
          }
        }
      );
      totalLimpiados++;
    }
    
    writeToLog(`    SKU ${dup._id.SKU}, Ubicación ${dup._id.Ubicacion}: mantenido 1, históricos ${eliminar.length}`);
  }
  
  writeToLog(` Limpieza completada: ${totalLimpiados} duplicados marcados como históricos`);
}

// *** FUNCIÓN PARA VERIFICACIÓN Y LIMPIEZA FINAL ***
async function verificarYLimpiarDuplicadosFinales(db, ubicacionesProcesadas) {
  writeToLog(` VERIFICANDO DUPLICADOS FINALES...`);
  
  const targetCollection = db.collection('politica_inventarios_01');
  
  // Buscar duplicados por SKU+Ubicación
  const pipeline = [
    {
      $match: {
        Ubicacion: { $in: ubicacionesProcesadas },
        Es_Actual: true
      }
    },
    {
      $group: {
        _id: { SKU: "$SKU", Ubicacion: "$Ubicacion" },
        count: { $sum: 1 },
        ids: { $push: "$_id" },
        docs: { $push: "$ROOT" }
      }
    },
    {
      $match: { count: { $gt: 1 } }
    }
  ];
  
  const duplicados = await targetCollection.aggregate(pipeline).toArray();
  
  if (duplicados.length > 0) {
    writeToLog(`  DUPLICADOS ENCONTRADOS: ${duplicados.length} combinaciones`);
    
    for (const dup of duplicados) {
      writeToLog(`   SKU: ${dup._id.SKU}, Ubicación: ${dup._id.Ubicacion} - ${dup.count} copias`);
      
      // Mantener solo el más reciente, eliminar los demás
      const idsOrdenados = dup.docs
        .sort((a, b) => new Date(b.Timestamp_Insert) - new Date(a.Timestamp_Insert))
        .map(d => d._id);
      
      const idsAEliminar = idsOrdenados.slice(1); // Todos excepto el primero (más reciente)
      
      if (idsAEliminar.length > 0) {
        const resultado = await targetCollection.deleteMany({
          _id: { $in: idsAEliminar }
        });
        writeToLog(`   Duplicados eliminados: ${resultado.deletedCount}`);
      }
    }
  } else {
    writeToLog(` No se encontraron duplicados`);
  }
}

// *** FUNCIÓN PARA LIMPIAR TODA LA COLECCIÓN DE DUPLICADOS ***
async function limpiarTodosDuplicados(db) {
  writeToLog(` LIMPIEZA COMPLETA DE DUPLICADOS...`);
  
  const targetCollection = db.collection('politica_inventarios_01');
  
  const pipeline = [
    {
      $group: {
        _id: { SKU: "$SKU", Ubicacion: "$Ubicacion" },
        count: { $sum: 1 },
        docs: { $push: "$ROOT" }
      }
    },
    {
      $match: { count: { $gt: 1 } }
    }
  ];
  
  const duplicados = await targetCollection.aggregate(pipeline).toArray();
  let totalEliminados = 0;
  
  for (const dup of duplicados) {
    // Mantener solo el más reciente
    const docsOrdenados = dup.docs.sort((a, b) => 
      new Date(b.Timestamp_Insert || 0) - new Date(a.Timestamp_Insert || 0)
    );
    
    const idsAEliminar = docsOrdenados.slice(1).map(d => d._id);
    
    if (idsAEliminar.length > 0) {
      const resultado = await targetCollection.deleteMany({
        _id: { $in: idsAEliminar }
      });
      totalEliminados += resultado.deletedCount;
    }
  }
  
  writeToLog(` Limpieza completada - Duplicados eliminados: ${totalEliminados}`);
  
  const totalFinal = await targetCollection.countDocuments({ Es_Actual: true });
  writeToLog(` Total registros finales: ${totalFinal}`);
}

async function getNextEjecucionNumber(db) {
  try {
    const contadorCollection = db.collection('contadores_ejecucion');
    const resultado = await contadorCollection.findOneAndUpdate(
      { _id: 'numero_ejecucion' },
      { $inc: { valor: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    return resultado.value.valor;
  } catch (err) {
    writeToLog(`Error obteniendo número de ejecución: ${err.message}`);
    return Date.now();
  }
}

function writeToLog(message) {
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  const logMessage = `[${timestamp}] P22: ${message}`;
  
  try {
    const path = require('path');
    
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(logFile, logMessage + '\n');
    console.log(logMessage);
  } catch (err) {
    console.error(`Error escribiendo log: ${err.message}`);
    console.log(logMessage);
  }
}

// Ejecutar función principal
crearPoliticaInventariosFinal();