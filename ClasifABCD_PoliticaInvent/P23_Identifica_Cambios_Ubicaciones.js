const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const crypto = require('crypto');

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

async function identificarCambiosUbicaciones() {
  console.log('INICIANDO P23 - Verificacion de Cambios en Ubicaciones');
  writeToLog(`\nPaso 23 - Verificacion de Cambios en Ubicaciones (MODO INCREMENTAL)`);
  writeToLog(`Parametros recibidos: dbName=${dbName}, DBUser=${DBUser}`);
  writeToLog(`MongoDB URI: ${mongoUri.replace(DBPassword, '***')}`);

  let client;
  try {
    writeToLog(`Conectando a MongoDB...`);
    client = await MongoClient.connect(mongoUri);
    writeToLog(`Conexión exitosa a MongoDB`);
    const db = client.db(dbName);
    writeToLog(`Base de datos seleccionada: ${dbName}`);

    const cambiosCollection = db.collection('cambios_ubicaciones_temp');

    // *** VERIFICAR SI YA EXISTEN CAMBIOS PROCESADOS RECIENTEMENTE ***
    const debeEjecutarse = await verificarSiDebeEjecutarse(db);
    if (!debeEjecutarse) {
      writeToLog(`P23 SALTADO - Cambios ya generados recientemente`);
      console.log('P23: Saltado por cambios recientes');
      return;
    }

    // VERIFICAR SI YA EXISTEN CAMBIOS GENERADOS POR EL SCRIPT DE UBICACIONES
    writeToLog(`Verificando si ya existen cambios generados...`);
    const cambiosExistentes = await cambiosCollection.find().toArray();
    if (cambiosExistentes.length > 0) {
      // VERIFICAR SI SON CAMBIOS FRESCOS (no procesados aún)
      const cambiosNoProcesados = cambiosExistentes.filter(c => !c.procesado);
      const cambiosProcesadosRecientes = cambiosExistentes.filter(c => 
        c.procesado && c.fecha_procesado && 
        (new Date() - c.fecha_procesado) < (10 * 60 * 1000) // 10 minutos
      );
      
      if (cambiosNoProcesados.length > 0) {
        writeToLog(`CAMBIOS YA DETECTADOS por script anterior:`);
        writeToLog(`   Total cambios existentes: ${cambiosExistentes.length}`);
        writeToLog(`   Cambios sin procesar: ${cambiosNoProcesados.length}`);
        
        // Mostrar resumen de los cambios existentes
        const tiposCambios = cambiosNoProcesados.reduce((acc, c) => {
          acc[c.tipo_cambio] = (acc[c.tipo_cambio] || 0) + 1;
          return acc;
        }, {});
        
        for (const [tipo, cantidad] of Object.entries(tiposCambios)) {
          const ubicaciones = cambiosNoProcesados
            .filter(c => c.tipo_cambio === tipo)
            .map(c => c.ubicacion);
          writeToLog(`   ${tipo}: ${cantidad} [${ubicaciones.join(', ')}]`);
        }
    
        // *** NUEVA LÓGICA: VERIFICAR SI HAY DATOS NUEVOS EN UBICACIONES EXISTENTES ***
        writeToLog(`Verificando si hay datos nuevos en ubicaciones con cambios existentes...`);
        
        const ubicacionesConCambios = cambiosNoProcesados.map(c => c.ubicacion);
        const resultadoVerificacion = await verificarDatosNuevosEnUbicacionesEspecificas(db, ubicacionesConCambios);
        
        if (resultadoVerificacion.tieneDatosNuevos) {
          writeToLog(` DATOS NUEVOS DETECTADOS en ubicaciones con cambios existentes:`);
          resultadoVerificacion.detalles.forEach(detalle => {
            writeToLog(`   ${detalle}`);
          });
          
          // AGREGAR LOS NUEVOS CAMBIOS A LA LISTA EXISTENTE
          writeToLog(`Agregando cambios por datos nuevos a la lista existente...`);
          const cambiosAdicionales = await generarCambiosPorDatosNuevos(db, resultadoVerificacion.ubicacionesConDatos);
          
          if (cambiosAdicionales.length > 0) {
            const cambiosCollection = db.collection('cambios_ubicaciones_temp');
            const insertResult = await cambiosCollection.insertMany(cambiosAdicionales);
            writeToLog(`   Cambios adicionales insertados: ${insertResult.insertedCount}`);
            
            // Actualizar el conteo
            const totalCambiosActualizados = cambiosNoProcesados.length + cambiosAdicionales.length;
            writeToLog(`   Total cambios a procesar: ${totalCambiosActualizados}`);
          }
          
          // AGREGAR METADATOS A CAMBIOS EXISTENTES Y PROCEDER
          await actualizarMetadatosCambios(db, cambiosNoProcesados);
          
          writeToLog(`P23 CONTINUANDO - Cambios existentes + datos nuevos detectados`);
          console.log('P23: Procesando cambios existentes + datos nuevos');
          // NO hacer return - continuar con el procesamiento normal
          
        } else {
          writeToLog(` No hay datos nuevos en ubicaciones con cambios existentes`);
          
          // AGREGAR METADATOS A CAMBIOS EXISTENTES
          await actualizarMetadatosCambios(db, cambiosNoProcesados);
          
          writeToLog(`P23 SALTADO - Usando cambios existentes (sin datos nuevos)`);
          writeToLog(`   Los cambios fueron generados correctamente por el script de ubicaciones`);
          console.log('P23: Cambios ya detectados - usando cambios existentes');
          return;
        }
        
      } else if (cambiosProcesadosRecientes.length > 0) {
        writeToLog(`CAMBIOS PROCESADOS RECIENTEMENTE:`);
        writeToLog(`   ${cambiosProcesadosRecientes.length} cambios procesados en los últimos 10 minutos`);
        writeToLog(`   P23 SALTADO - Cambios ya fueron procesados`);
        console.log('P23: Cambios ya procesados recientemente');
        return;
      }
    }

    // SOLO SI NO EXISTEN CAMBIOS VÁLIDOS, GENERAR USANDO LÓGICA DE RESPALDO
    writeToLog(`No se encontraron cambios válidos - generando usando lógica de respaldo...`);
    
    const demandaCollection = db.collection('demanda_abcd_01');
    const politicaCollection = db.collection('politica_inventarios_01');
    const ubisCollection = db.collection('ubis_saved');

    writeToLog(`Colecciones inicializadas para análisis de respaldo`);

    // INICIALIZAR ARRAY DE CAMBIOS
    let cambios = [];

    // OBTENER UBICACIONES ACTUALES DE DEMANDA
    writeToLog(`Obteniendo ubicaciones de demanda_abcd_01...`);
    const datosDemanda = await demandaCollection.find().toArray();
    const ubicacionesEnDemanda = new Set(datosDemanda.map(d => d.Ubicacion));
    writeToLog(`Total registros en demanda_abcd_01: ${datosDemanda.length}`);
    writeToLog(`   Ubicaciones actuales en demanda: ${ubicacionesEnDemanda.size}`);
    writeToLog(`   Ubicaciones en demanda: [${[...ubicacionesEnDemanda].join(', ')}]`);

    // OBTENER UBICACIONES QUE YA TIENEN POLÍTICAS CALCULADAS
    writeToLog(`Obteniendo ubicaciones con políticas existentes...`);
    const ubicacionesConPoliticas = await politicaCollection.distinct('Ubicacion', { Es_Actual: true });
    const ubicacionesConPoliticasSet = new Set(ubicacionesConPoliticas);
    writeToLog(`Total registros actuales en politica_inventarios_01: ${await politicaCollection.countDocuments({ Es_Actual: true })}`);
    writeToLog(`   Ubicaciones con políticas existentes: ${ubicacionesConPoliticasSet.size}`);
    writeToLog(`   Ubicaciones con políticas: [${[...ubicacionesConPoliticasSet].join(', ')}]`);

    // OBTENER UBICACIONES ACTIVAS EN ubis_saved
    writeToLog(`Obteniendo ubicaciones activas de ubis_saved...`);
    const ubicacionesGuardadas = await ubisCollection.find({ activa: true }).toArray();
    const ubicacionesActivasSet = new Set(ubicacionesGuardadas.map(u => u.Ubicacion));
    writeToLog(`Total registros activos en ubis_saved: ${ubicacionesGuardadas.length}`);
    writeToLog(`   Ubicaciones activas en ubis_saved: ${ubicacionesActivasSet.size}`);
    writeToLog(`   Ubicaciones activas: [${[...ubicacionesActivasSet].join(', ')}]`);

    // IDENTIFICAR CAMBIOS REALES - MODO CONSERVADOR
    writeToLog(`\nANALIZANDO CAMBIOS CON LÓGICA DE RESPALDO...`);

    // UBICACIONES NUEVAS: están activas en ubis_saved pero NO tienen políticas
    writeToLog(`Identificando ubicaciones nuevas...`);
    const ubicacionesNuevas = [...ubicacionesActivasSet].filter(u => 
      !ubicacionesConPoliticasSet.has(u)
    );
    writeToLog(`Lógica: ubicaciones activas en ubis_saved [${ubicacionesActivasSet.size}] - que ya tienen políticas [${ubicacionesConPoliticasSet.size}]`);
    writeToLog(`   Nuevas ubicaciones encontradas: [${ubicacionesNuevas.join(', ')}]`);

    // AGREGAR UBICACIONES NUEVAS AL ARRAY DE CAMBIOS
    ubicacionesNuevas.forEach(ubicacion => {
      cambios.push({
        ubicacion: ubicacion,
        tipo_cambio: 'NUEVA',
        fecha_cambio: new Date(),
        descripcion: 'Ubicación nueva detectada por P23 (respaldo)',
        procesado: false,
        generado_por: 'P23_respaldo'
      });
    });

    // VERIFICAR PARÁMETROS ESPECIALES
    let ubicacionesEliminadas = [];
    const ALLOW_DELETIONS = process.argv.includes('--allow-deletions');
    writeToLog(`Parámetro --allow-deletions: ${ALLOW_DELETIONS}`);

    if (ALLOW_DELETIONS) {
      writeToLog(`Identificando ubicaciones para eliminar...`);
      const todasUbicacionesGuardadas = await ubisCollection.find({}).toArray();
      const ubicacionesInactivas = todasUbicacionesGuardadas
        .filter(u => u.activa === false)
        .map(u => u.Ubicacion);
      
      ubicacionesEliminadas = [...ubicacionesConPoliticasSet].filter(u => 
        ubicacionesInactivas.includes(u)
      );
      
      ubicacionesEliminadas.forEach(ubicacion => {
        cambios.push({
          ubicacion: ubicacion,
          tipo_cambio: 'ELIMINADA',
          fecha_cambio: new Date(),
          descripcion: 'Ubicación inactiva detectada por P23',
          procesado: false,
          generado_por: 'P23_respaldo'
        });
      });
      
      writeToLog(`   Modo ALLOW-DELETIONS activado`);
      writeToLog(`   Ubicaciones para eliminar: ${ubicacionesEliminadas.length} [${ubicacionesEliminadas.join(', ')}]`);
    }

    // FORZAR ACTUALIZACIÓN DE UBICACIONES EXISTENTES
    const FORCE_UPDATE = process.argv.includes('--force-update');
    writeToLog(`Parámetro --force-update: ${FORCE_UPDATE}`);

    if (FORCE_UPDATE) {
      writeToLog(`Identificando ubicaciones existentes para actualizar...`);
      const ubicacionesExistentes = [...ubicacionesActivasSet].filter(u => 
        ubicacionesConPoliticasSet.has(u)
      );
      
      writeToLog(`   Modo FORCE-UPDATE activado - se recalcularán ${ubicacionesExistentes.length} ubicaciones existentes`);
      writeToLog(`   Ubicaciones existentes: [${ubicacionesExistentes.join(', ')}]`);
      
      ubicacionesExistentes.forEach(ubicacion => {
        cambios.push({
          ubicacion: ubicacion,
          tipo_cambio: 'ACTUALIZADA',
          fecha_cambio: new Date(),
          descripcion: 'Actualización forzada por P23',
          procesado: false,
          generado_por: 'P23_respaldo'
        });
      });
    }

    writeToLog(`\nRESULTADOS DEL ANÁLISIS DE RESPALDO:`);
    writeToLog(`   Ubicaciones NUEVAS para procesar: ${ubicacionesNuevas.length}`);
    writeToLog(`   Ubicaciones ELIMINADAS: ${ubicacionesEliminadas.length}`);
    writeToLog(`   Ubicaciones ACTUALIZADAS: ${cambios.filter(c => c.tipo_cambio === 'ACTUALIZADA').length}`);

    // GUARDAR CAMBIOS O CREAR DUMMY
    writeToLog(`\nGUARDANDO CAMBIOS DE RESPALDO...`);
    writeToLog(`Total cambios a guardar: ${cambios.length}`);

    if (cambios.length > 0) {
      // AGREGAR METADATOS ADICIONALES
      cambios = cambios.map(cambio => ({
        ...cambio,
        hash_ubicaciones: crypto.createHash('md5').update([cambio.ubicacion].join(',')).digest('hex'),
        sesion_generacion: `P23_${moment().format('YYYYMMDD_HHmmss')}`,
        timestamp_generacion: new Date()
      }));
      
      writeToLog(`Insertando ${cambios.length} cambios en cambios_ubicaciones_temp...`);
      const insertResult = await cambiosCollection.insertMany(cambios);
      writeToLog(`Registros insertados exitosamente: ${insertResult.insertedCount}`);
      
      const nuevas = cambios.filter(c => c.tipo_cambio === 'NUEVA').length;
      const eliminadas = cambios.filter(c => c.tipo_cambio === 'ELIMINADA').length;
      const actualizadas = cambios.filter(c => c.tipo_cambio === 'ACTUALIZADA').length;
      
      writeToLog(`   Total cambios identificados: ${cambios.length}`);
      writeToLog(`       - Ubicaciones nuevas: ${nuevas}`);
      writeToLog(`       - Ubicaciones eliminadas: ${eliminadas}`);
      writeToLog(`       - Ubicaciones a actualizar: ${actualizadas}`);
      
      // CREAR SEÑAL DE GENERACIÓN PARA P24
      await crearSenalGeneracion(db, cambios);
      
    } else {
      writeToLog(`No hay cambios reales - creando cambio dummy...`);
      writeToLog(`   No se identificaron cambios reales`);
      writeToLog(`   Todas las ubicaciones activas ya tienen políticas calculadas`);
      writeToLog(`   Usa --force-update para recalcular ubicaciones existentes`);
      
      const dummyInsert = await cambiosCollection.insertOne({
        ubicacion: 'NO_CHANGES',
        tipo_cambio: 'SIN_CAMBIOS',
        fecha_cambio: new Date(),
        descripcion: 'No se identificaron cambios que procesar',
        procesado: false,
        generado_por: 'P23_respaldo',
        sesion_generacion: `P23_${moment().format('YYYYMMDD_HHmmss')}`,
        timestamp_generacion: new Date()
      });
      writeToLog(`Cambio dummy insertado: ${dummyInsert.insertedId}`);
    }

    writeToLog(`\nP23 COMPLETADO EXITOSAMENTE (MODO RESPALDO)`);
    writeToLog(`   Termina la identificacion de cambios en ubicaciones`);
    console.log('P23 completado usando lógica de respaldo - ver logs para detalles');

  } catch (err) {
    const errorMsg = `${now} - ERROR en identificacion de cambios: ${err.message}`;
    writeToLog(errorMsg);
    console.error('ERROR en P23:', err.message);
    console.error('Stack trace:', err.stack);
    throw err;
  } finally {
    if (client) {
      writeToLog(`Cerrando conexión a MongoDB...`);
      await client.close();
      writeToLog(`Conexión cerrada`);
      console.log('Conexión MongoDB cerrada');
    }
  }
}

// *** NUEVA FUNCIÓN: VERIFICAR SI DEBE EJECUTARSE ***
// *** FUNCIÓN MEJORADA: VERIFICAR SI DEBE EJECUTARSE ***
async function verificarSiDebeEjecutarse(db) {
  try {
    const FORCE_EXECUTION = process.argv.includes('--force');
    
    if (FORCE_EXECUTION) {
      writeToLog('PARÁMETRO --force detectado - Forzando ejecución P23');
      return true;
    }
    
    // VERIFICAR CAMBIOS GENERADOS RECIENTEMENTE
    const cambiosCollection = db.collection('cambios_ubicaciones_temp');
    const cambiosRecientes = await cambiosCollection.find({
      timestamp_generacion: { $gte: new Date(Date.now() - 15 * 60 * 1000) } // 15 minutos
    }).toArray();
    
    if (cambiosRecientes.length > 0) {
      const minutosTranscurridos = Math.min(...cambiosRecientes.map(c => 
        (new Date() - c.timestamp_generacion) / (1000 * 60)
      ));
      
      writeToLog(`CAMBIOS GENERADOS RECIENTEMENTE:`);
      writeToLog(`   ${cambiosRecientes.length} cambios generados hace ${minutosTranscurridos.toFixed(1)} minutos`);
      writeToLog(`   Generados por: ${[...new Set(cambiosRecientes.map(c => c.generado_por))].join(', ')}`);
      
      if (minutosTranscurridos < 10) { // 10 minutos de protección
        writeToLog(`   Cambios demasiado recientes - SALTANDO P23`);
        return false;
      }
    }
    
    // *** NUEVA LÓGICA: VERIFICAR DATOS NUEVOS EN UBICACIONES EXISTENTES ***
    const estadoP24 = await db.collection('estado_procesamiento_p24').findOne({
      _id: 'ultimo_procesamiento_incremental'
    });
    
    if (estadoP24 && estadoP24.completado) {
      const minutosTranscurridos = (new Date() - estadoP24.fecha_completado) / (1000 * 60);
      const ubicacionesProcesadas = estadoP24.ubicaciones_procesadas || [];
      
      writeToLog(`P24 EJECUTADO RECIENTEMENTE:`);
      writeToLog(`   Hace ${minutosTranscurridos.toFixed(1)} minutos`);
      writeToLog(`   Ubicaciones procesadas: [${ubicacionesProcesadas.join(', ')}]`);
      
      // SOLO verificar tiempo si han pasado menos de 5 minutos Y no hay datos nuevos
      if (minutosTranscurridos < 5) {
        writeToLog(`   Verificando si hay datos nuevos en ubicaciones existentes...`);
        
        // VERIFICAR SI HAY DATOS NUEVOS EN UBICACIONES YA PROCESADAS
        const hayDatosNuevos = await verificarDatosNuevosEnUbicaciones(db, estadoP24);
        
        if (hayDatosNuevos.tieneDatosNuevos) {
          writeToLog(`   ✅ DATOS NUEVOS DETECTADOS:`);
          writeToLog(`   ${hayDatosNuevos.detalles.join(', ')}`);
          writeToLog(`   CONTINUANDO P23 - Hay datos nuevos que procesar`);
          return true;
        } else {
          writeToLog(`   ❌ No hay datos nuevos en ubicaciones existentes`);
          writeToLog(`   SALTANDO P23 - Cambios ya fueron procesados`);
          return false;
        }
      } else {
        writeToLog(`   Tiempo suficiente transcurrido - CONTINUANDO P23`);
      }
    }
    
    return true;
    
  } catch (err) {
    writeToLog(`Error verificando si debe ejecutarse P23: ${err.message}`);
    return true; // En caso de error, mejor ejecutar
  }
}

// *** NUEVA FUNCIÓN: VERIFICAR DATOS NUEVOS EN UBICACIONES EXISTENTES ***
async function verificarDatosNuevosEnUbicaciones(db, estadoP24Previo) {
  try {
    const demandaCollection = db.collection('demanda_abcd_01');
    const ubisCollection = db.collection('ubis_saved');
    
    // OBTENER UBICACIONES ACTIVAS ACTUALES
    const ubicacionesActuales = await ubisCollection.find({ activa: true }).toArray();
    const mapaUbicacionesActuales = new Map();
    
    for (const ubi of ubicacionesActuales) {
      mapaUbicacionesActuales.set(ubi.Ubicacion, {
        totalRegistros: ubi.total_registros || 0,
        fechaCarga: ubi.fecha_carga || new Date(0),
        hashDatos: ubi.hash_datos || ''
      });
    }
    
    writeToLog(`   Ubicaciones activas actuales: ${mapaUbicacionesActuales.size}`);
    
    // COMPARAR CON ESTADO PREVIO DE P24
    const ubicacionesPrevias = estadoP24Previo.ubicaciones_procesadas || [];
    const estadoPrevio = estadoP24Previo.estado_ubicaciones || {};
    
    writeToLog(`   Comparando con estado previo de P24...`);
    
    let tieneDatosNuevos = false;
    let detalles = [];
    
    // VERIFICAR CADA UBICACIÓN ACTIVA
    for (const [ubicacion, datosActuales] of mapaUbicacionesActuales.entries()) {
      const datosPrevios = estadoPrevio[ubicacion];
      
      if (datosPrevios) {
        // UBICACIÓN YA EXISTÍA - VERIFICAR CAMBIOS
        const registrosPrevios = datosPrevios.total_registros || 0;
        const registrosActuales = datosActuales.totalRegistros;
        const hashPrevio = datosPrevios.hash_datos || '';
        const hashActual = datosActuales.hashDatos;
        
        if (registrosActuales > registrosPrevios) {
          tieneDatosNuevos = true;
          const nuevosRegistros = registrosActuales - registrosPrevios;
          detalles.push(`Ubicación ${ubicacion}: +${nuevosRegistros} registros (${registrosPrevios} → ${registrosActuales})`);
        } else if (hashPrevio && hashActual && hashPrevio !== hashActual) {
          tieneDatosNuevos = true;
          detalles.push(`Ubicación ${ubicacion}: datos modificados (hash cambió)`);
        }
        
      } else if (ubicacionesPrevias.includes(ubicacion)) {
        // UBICACIÓN ESTABA EN LA LISTA PERO NO TIENE ESTADO GUARDADO
        tieneDatosNuevos = true;
        detalles.push(`Ubicación ${ubicacion}: sin estado previo registrado`);
      }
    }
    
    // VERIFICAR TAMBIÉN CON LA COLECCIÓN DE DEMANDA DIRECTAMENTE
    if (!tieneDatosNuevos) {
      writeToLog(`   Verificación adicional: comparando registros en demanda_abcd_01...`);
      
      for (const ubicacion of ubicacionesPrevias) {
        const registrosActualesEnDemanda = await demandaCollection.countDocuments({ Ubicacion: ubicacion });
        const registrosPreviosEnDemanda = (estadoPrevio[ubicacion] || {}).registros_en_demanda || 0;
        
        if (registrosActualesEnDemanda > registrosPreviosEnDemanda) {
          tieneDatosNuevos = true;
          const nuevosRegistros = registrosActualesEnDemanda - registrosPreviosEnDemanda;
          detalles.push(`Ubicación ${ubicacion}: +${nuevosRegistros} registros en demanda (${registrosPreviosEnDemanda} → ${registrosActualesEnDemanda})`);
        }
      }
    }
    
    writeToLog(`   Resultado verificación: ${tieneDatosNuevos ? 'SÍ HAY' : 'NO HAY'} datos nuevos`);
    
    return {
      tieneDatosNuevos,
      detalles
    };
    
  } catch (err) {
    writeToLog(`Error verificando datos nuevos: ${err.message}`);
    // En caso de error, asumir que hay datos nuevos para estar seguros
    return {
      tieneDatosNuevos: true,
      detalles: [`Error en verificación: ${err.message} - Asumiendo datos nuevos`]
    };
  }
}

// *** FUNCIÓN PARA ACTUALIZAR METADATOS DE CAMBIOS EXISTENTES ***
async function actualizarMetadatosCambios(db, cambiosExistentes) {
  try {
    writeToLog(`Actualizando metadatos de cambios existentes...`);
    
    const cambiosCollection = db.collection('cambios_ubicaciones_temp');
    const sesionActual = `P23_${moment().format('YYYYMMDD_HHmmss')}`;
    
    for (const cambio of cambiosExistentes) {
      if (!cambio.hash_ubicaciones) {
        const hash = crypto.createHash('md5').update([cambio.ubicacion].join(',')).digest('hex');
        
        await cambiosCollection.updateOne(
          { _id: cambio._id },
          {
            $set: {
              hash_ubicaciones: hash,
              sesion_validacion: sesionActual,
              validado_por: 'P23',
              timestamp_validacion: new Date()
            }
          }
        );
      }
    }
    
    writeToLog(`Metadatos actualizados para ${cambiosExistentes.length} cambios`);
    
  } catch (err) {
    writeToLog(`Error actualizando metadatos: ${err.message}`);
  }
}

// *** FUNCIÓN PARA CREAR SEÑAL DE GENERACIÓN ***
async function crearSenalGeneracion(db, cambios) {
  try {
    const senalCollection = db.collection('p23_generation_signals');
    
    const ubicacionesNuevas = cambios.filter(c => c.tipo_cambio === 'NUEVA').map(c => c.ubicacion);
    const ubicacionesActualizadas = cambios.filter(c => c.tipo_cambio === 'ACTUALIZADA').map(c => c.ubicacion);
    const ubicacionesEliminadas = cambios.filter(c => c.tipo_cambio === 'ELIMINADA').map(c => c.ubicacion);
    
    const senal = {
      _id: 'cambios_generados',
      fecha_generacion: new Date(),
      generado_por: 'P23',
      total_cambios: cambios.length,
      
      // RESUMEN DE CAMBIOS
      ubicaciones_nuevas: ubicacionesNuevas,
      ubicaciones_actualizadas: ubicacionesActualizadas,
      ubicaciones_eliminadas: ubicacionesEliminadas,
      
      // METADATOS
      sesion_generacion: cambios[0].sesion_generacion,
      hash_conjunto: crypto.createHash('md5').update(
        [...ubicacionesNuevas, ...ubicacionesActualizadas, ...ubicacionesEliminadas].sort().join(',')
      ).digest('hex'),
      
      // ESTADO
      listo_para_p24: true,
      procesado_por_p24: false
    };
    
    await senalCollection.replaceOne(
      { _id: 'cambios_generados' },
      senal,
      { upsert: true }
    );
    
    writeToLog(`📡 Señal de generación creada para P24:`);
    writeToLog(`   Nuevas: ${ubicacionesNuevas.length}, Actualizadas: ${ubicacionesActualizadas.length}, Eliminadas: ${ubicacionesEliminadas.length}`);
    writeToLog(`   Hash conjunto: ${senal.hash_conjunto}`);
    
  } catch (err) {
    writeToLog(`Error creando señal de generación: ${err.message}`);
  }
}

// *** NUEVA FUNCIÓN: VERIFICAR DATOS NUEVOS EN UBICACIONES ESPECÍFICAS ***
async function verificarDatosNuevosEnUbicacionesEspecificas(db, ubicacionesAVerificar) {
  try {
    writeToLog(`   Verificando datos nuevos en ubicaciones: [${ubicacionesAVerificar.join(', ')}]`);
    
    const ubisCollection = db.collection('ubis_saved');
    const demandaCollection = db.collection('demanda_abcd_01');
    
    // OBTENER ESTADO ACTUAL DE LAS UBICACIONES
    const ubicacionesActuales = await ubisCollection.find({ 
      Ubicacion: { $in: ubicacionesAVerificar },
      activa: true 
    }).toArray();
    
    // OBTENER ÚLTIMO ESTADO PROCESADO DE P24
    const estadoP24 = await db.collection('estado_procesamiento_p24').findOne({
      _id: 'ultimo_procesamiento_incremental'
    });
    
    let tieneDatosNuevos = false;
    let detalles = [];
    let ubicacionesConDatos = [];
    
    // COMPARAR CADA UBICACIÓN
    for (const ubicacionData of ubicacionesActuales) {
      const ubicacion = ubicacionData.Ubicacion;
      const registrosActuales = ubicacionData.total_registros || 0;
      const hashActual = ubicacionData.hash_datos || '';
      const fechaCargaActual = ubicacionData.fecha_carga || new Date(0);
      
      // OBTENER DATOS PREVIOS
      let registrosPrevios = 0;
      let hashPrevio = '';
      let fechaCargaPrevia = new Date(0);
      
      if (estadoP24 && estadoP24.estado_ubicaciones && estadoP24.estado_ubicaciones[ubicacion]) {
        const estadoPrevio = estadoP24.estado_ubicaciones[ubicacion];
        registrosPrevios = estadoPrevio.total_registros || 0;
        hashPrevio = estadoPrevio.hash_datos || '';
        fechaCargaPrevia = estadoPrevio.fecha_carga || new Date(0);
      }
      
      writeToLog(`   Ubicación ${ubicacion}:`);
      writeToLog(`     Registros: ${registrosPrevios} → ${registrosActuales}`);
      writeToLog(`     Hash: ${hashPrevio !== hashActual ? 'CAMBIÓ' : 'IGUAL'}`);
      writeToLog(`     Fecha carga: ${fechaCargaPrevia.toISOString()} → ${fechaCargaActual.toISOString()}`);
      
      // VERIFICAR CAMBIOS
      if (registrosActuales > registrosPrevios) {
        tieneDatosNuevos = true;
        const nuevosRegistros = registrosActuales - registrosPrevios;
        detalles.push(`Ubicación ${ubicacion}: +${nuevosRegistros} registros nuevos (${registrosPrevios} → ${registrosActuales})`);
        ubicacionesConDatos.push(ubicacion);
        
      } else if (fechaCargaActual > fechaCargaPrevia) {
        tieneDatosNuevos = true;
        detalles.push(`Ubicación ${ubicacion}: nueva carga de datos (${fechaCargaPrevia.toISOString()} → ${fechaCargaActual.toISOString()})`);
        ubicacionesConDatos.push(ubicacion);
        
      } else if (hashPrevio && hashActual && hashPrevio !== hashActual) {
        tieneDatosNuevos = true;
        detalles.push(`Ubicación ${ubicacion}: datos modificados (hash cambió)`);
        ubicacionesConDatos.push(ubicacion);
      }
      
      // VERIFICACIÓN ADICIONAL: CONTAR REGISTROS EN DEMANDA
      const registrosEnDemanda = await demandaCollection.countDocuments({ Ubicacion: ubicacion });
      const registrosPreviosEnDemanda = (estadoP24 && estadoP24.estado_ubicaciones && estadoP24.estado_ubicaciones[ubicacion]) 
        ? (estadoP24.estado_ubicaciones[ubicacion].registros_en_demanda || 0) 
        : 0;
        
      if (registrosEnDemanda > registrosPreviosEnDemanda) {
        const nuevosEnDemanda = registrosEnDemanda - registrosPreviosEnDemanda;
        if (!ubicacionesConDatos.includes(ubicacion)) {
          tieneDatosNuevos = true;
          detalles.push(`Ubicación ${ubicacion}: +${nuevosEnDemanda} registros nuevos en demanda (${registrosPreviosEnDemanda} → ${registrosEnDemanda})`);
          ubicacionesConDatos.push(ubicacion);
        }
      }
    }
    
    writeToLog(`   Resultado: ${tieneDatosNuevos ? 'SÍ' : 'NO'} hay datos nuevos`);
    writeToLog(`   Ubicaciones con datos nuevos: [${ubicacionesConDatos.join(', ')}]`);
    
    return {
      tieneDatosNuevos,
      detalles,
      ubicacionesConDatos
    };
    
  } catch (err) {
    writeToLog(`   Error en verificación específica: ${err.message}`);
    return {
      tieneDatosNuevos: true,
      detalles: [`Error: ${err.message} - Procesando por seguridad`],
      ubicacionesConDatos: ubicacionesAVerificar
    };
  }
}

// *** NUEVA FUNCIÓN: GENERAR CAMBIOS POR DATOS NUEVOS ***
async function generarCambiosPorDatosNuevos(db, ubicacionesConDatos) {
  const cambios = [];
  const ahora = new Date();
  const sesion = `P23_datos_nuevos_${moment().format('YYYYMMDD_HHmmss')}`;
  
  for (const ubicacion of ubicacionesConDatos) {
    cambios.push({
      ubicacion: ubicacion,
      tipo_cambio: 'DATOS_NUEVOS',
      fecha_cambio: ahora,
      descripcion: `Nuevos datos detectados en ubicación existente - P23`,
      procesado: false,
      generado_por: 'P23_datos_nuevos',
      hash_ubicaciones: crypto.createHash('md5').update([ubicacion].join(',')).digest('hex'),
      sesion_generacion: sesion,
      timestamp_generacion: ahora,
      prioridad: 'ALTA' // Marcar como alta prioridad para P24
    });
  }
  
  writeToLog(`   Generando ${cambios.length} cambios por datos nuevos`);
  return cambios;
}

function writeToLog(message) {
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  const logMessage = `[${timestamp}] P23: ${message}`;

  // Escribir al archivo de log
  try {
    fs.appendFileSync(logFile, logMessage + '\n');
  } catch (err) {
    console.error(`Error escribiendo log: ${err.message}`);
  }

  // También mostrar en consola para depuración inmediata
  console.log(logMessage);
}

// Ejecutar la función
identificarCambiosUbicaciones().catch(console.error);