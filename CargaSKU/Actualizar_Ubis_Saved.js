const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const fs = require('fs');
const moment = require('moment');
const crypto = require('crypto');

const now = moment().format('YYYY-MM-DD HH:mm:ss');

const dbName = process.argv[2];
const parametroFolder = process.argv[3];
const AppUser = process.argv[4];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/dbvars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`;

// COLECCIONES A LIMPIAR CUANDO SE DETECTA RECARGA
const COLECCIONES_CALCULO = [
  'demanda_abcd_01',
  'demanda_porcentaje_01', 
  'demanda_ordenada_01',
  'demanda_acumulada_01',
  'clasificacion_dmd_01',
  'demanda_abc_01',
  'ui_all_pol_inv',
  'politicas_inventario_01',
  'ui_pol_inv_costo',
  'ui_pol_inv_dias_cobertura',
  'ui_pol_inv_pallets',
  'ui_pol_inv_uom',
  'ui_politica_inventarios',
  'politica_inventarios_01'
];

async function writeToLog(message) {
  fs.appendFileSync(logFile, `${message}\n`);
}

async function actualizarUbisSaved() {
  writeToLog(`\nPaso 08 - Actualización de la colección 'ubis_saved' (MODO ACUMULATIVO CON LIMPIEZA DE RECARGAS)`);

  try {
    const passadminDeCripta = await decryptData(`${DBPassword}`);
    const mongoUri = conex.getUrl(DBUser, passadminDeCripta, host, puerto, dbName);
    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = client.db();

    const skuCollection = db.collection('sku');
    const ubisSavedCollection = db.collection('ubis_saved');
    const cambiosCollection = db.collection('cambios_ubicaciones_temp');

    // OBTENER UBICACIONES ACTUALES DE SKU
    const ubicacionesSKU = await skuCollection
      .aggregate([
        {
          $group: {
            _id: '$Ubicacion',
            Desc_Ubicacion: { $first: '$Desc_Ubicacion' },
            total_skus: { $sum: 1 },
            skus_sample: { $push: '$SKU' }
          }
        }
      ])
      .toArray();

    const ubicacionesSKUMap = new Map(ubicacionesSKU.map(u => [u._id, {
      desc: u.Desc_Ubicacion,
      total_skus: u.total_skus,
      hash_datos: crypto.createHash('md5').update(u.skus_sample.sort().join('|')).digest('hex')
    }]));

    // OBTENER UBICACIONES GUARDADAS PREVIAMENTE
    const ubicacionesGuardadas = await ubisSavedCollection.find({}).toArray();
    const guardadasMap = new Map(ubicacionesGuardadas.map(u => [u.Ubicacion, u]));

    let insertadas = 0;
    let actualizadas = 0;
    let marcadasInactivas = 0;
    let ubicacionesRecargadas = [];
    
    // ARRAY PARA REGISTRAR CAMBIOS
    const cambios = [];

    writeToLog(`\tProcesando ${ubicacionesSKU.length} ubicaciones actuales vs ${ubicacionesGuardadas.length} guardadas`);

    // *** NUEVA LÓGICA: IDENTIFICAR UBICACIONES RECARGADAS ***
    writeToLog(`\n\t=== IDENTIFICANDO UBICACIONES RECARGADAS ===`);
    
    for (const [ubi, datosActuales] of ubicacionesSKUMap) {
      const ubicacionGuardada = guardadasMap.get(ubi);
      
      if (ubicacionGuardada && ubicacionGuardada.activa) {
        // VERIFICAR SI ES UNA RECARGA (cambios significativos en datos)
        const esRecarga = await verificarSiEsRecarga(ubicacionGuardada, datosActuales, ubi);
        
        if (esRecarga.esRecarga) {
          ubicacionesRecargadas.push({
            ubicacion: ubi,
            razon: esRecarga.razon,
            detalles: esRecarga.detalles
          });
          
          writeToLog(`\t   RECARGA DETECTADA: ${ubi} - ${esRecarga.razon}`);
          writeToLog(`\t      ${esRecarga.detalles}`);
        }
      }
    }

    // *** NUEVA FUNCIONALIDAD: LIMPIAR DATOS DE UBICACIONES RECARGADAS ***
    if (ubicacionesRecargadas.length > 0) {
      writeToLog(`\n\t=== LIMPIANDO DATOS DE UBICACIONES RECARGADAS ===`);
      writeToLog(`\tUbicaciones a limpiar: [${ubicacionesRecargadas.map(u => u.ubicacion).join(', ')}]`);
      
      await limpiarDatosUbicacionesRecargadas(db, ubicacionesRecargadas.map(u => u.ubicacion));
      
      // MARCAR COMO RECARGAS EN LA TABLA DE CAMBIOS
      for (const recarga of ubicacionesRecargadas) {
        cambios.push({
          ubicacion: recarga.ubicacion,
          tipo_cambio: 'RECARGA',
          desc_ubicacion: ubicacionesSKUMap.get(recarga.ubicacion).desc,
          fecha_cambio: new Date(),
          procesado: false,
          razon_recarga: recarga.razon,
          detalles_recarga: recarga.detalles,
          datos_limpiados: true
        });
      }
    }

    // PROCESAR UBICACIONES ACTUALES (LÓGICA ORIGINAL)
    for (const [ubi, datosActuales] of ubicacionesSKUMap) {
      if (!guardadasMap.has(ubi)) {
        // UBICACIÓN NUEVA
        await ubisSavedCollection.insertOne({ 
          Ubicacion: ubi, 
          Desc_Ubicacion: datosActuales.desc,
          fecha_creacion: now,
          activa: true,
          total_registros: datosActuales.total_skus,
          hash_datos: datosActuales.hash_datos,
          ultima_carga_datos: new Date()
        });
        insertadas++;
        
        // Solo agregar si no es una recarga
        if (!ubicacionesRecargadas.find(r => r.ubicacion === ubi)) {
          cambios.push({
            ubicacion: ubi,
            tipo_cambio: 'NUEVA',
            desc_ubicacion: datosActuales.desc,
            fecha_cambio: new Date(),
            procesado: false
          });
        }
        
        writeToLog(`\t   NUEVA: ${ubi} - ${datosActuales.desc}`);
        
      } else if (guardadasMap.get(ubi).Desc_Ubicacion !== datosActuales.desc) {
        // UBICACIÓN ACTUALIZADA (cambió descripción)
        // *** CORRECCIÓN: NO incluir _id en el $set ***
        await ubisSavedCollection.updateOne(
          { Ubicacion: ubi }, 
          { 
            $set: { 
              Desc_Ubicacion: datosActuales.desc,
              fecha_actualizacion: now,
              activa: true,
              total_registros: datosActuales.total_skus,
              hash_datos: datosActuales.hash_datos,
              ultima_carga_datos: new Date()
            } 
          }
        );
        actualizadas++;
        
        // Solo agregar si no es una recarga
        if (!ubicacionesRecargadas.find(r => r.ubicacion === ubi)) {
          cambios.push({
            ubicacion: ubi,
            tipo_cambio: 'ACTUALIZADA',
            desc_ubicacion: datosActuales.desc,
            desc_anterior: guardadasMap.get(ubi).Desc_Ubicacion,
            fecha_cambio: new Date(),
            procesado: false
          });
        }
        
        writeToLog(`\t   ACTUALIZADA: ${ubi} - "${guardadasMap.get(ubi).Desc_Ubicacion}" -> "${datosActuales.desc}"`);
        
      } else {
        // UBICACIÓN EXISTENTE - VERIFICAR DATOS NUEVOS
        const ubicacionGuardada = guardadasMap.get(ubi);
        const datosNuevos = await verificarDatosNuevosEnUbicacion(db, ubi, ubicacionGuardada);
        
        if (datosNuevos.hayNuevosDatos && !ubicacionesRecargadas.find(r => r.ubicacion === ubi)) {
          writeToLog(`\t   DATOS NUEVOS EN UBICACIÓN EXISTENTE: ${ubi} - ${datosNuevos.descripcion}`);
          
          // Actualizar información en ubis_saved
          // *** CORRECCIÓN: NO incluir _id en el $set ***
          await ubisSavedCollection.updateOne(
            { Ubicacion: ubi }, 
            { 
              $set: { 
                activa: true,
                fecha_ultima_vista: now,
                ultima_carga_datos: datosNuevos.fechaCarga,
                total_registros: datosNuevos.totalRegistros,
                hash_datos: datosNuevos.hashDatos
              } 
            }
          );
          
          // Registrar cambio para modo incremental
          cambios.push({
            ubicacion: ubi,
            tipo_cambio: 'DATOS_NUEVOS',
            desc_ubicacion: datosActuales.desc,
            fecha_cambio: new Date(),
            procesado: false,
            detalles_cambio: {
              registros_anteriores: datosNuevos.registrosAnteriores,
              registros_actuales: datosNuevos.totalRegistros,
              diferencia: datosNuevos.totalRegistros - datosNuevos.registrosAnteriores
            }
          });
          
        } else {
          // UBICACIÓN SIN CAMBIOS - Solo actualizar metadatos
          // *** CORRECCIÓN: NO incluir _id en el $set ***
          await ubisSavedCollection.updateOne(
            { Ubicacion: ubi }, 
            { 
              $set: { 
                activa: true,
                fecha_ultima_vista: now,
                total_registros: datosActuales.total_skus,
                hash_datos: datosActuales.hash_datos
              } 
            }
          );
        }
      }
    }

    // MARCAR COMO INACTIVAS LAS UBICACIONES QUE YA NO ESTÁN EN SKU ACTUAL
    const ubicacionesActuales = [...ubicacionesSKUMap.keys()];
    const ubicacionesAInactivar = [...guardadasMap.keys()].filter(ubi => !ubicacionesActuales.includes(ubi));
    
    if (ubicacionesAInactivar.length > 0) {
      const resultadoInactivas = await ubisSavedCollection.updateMany(
        { Ubicacion: { $in: ubicacionesAInactivar } },
        { 
          $set: { 
            activa: false,
            fecha_inactivacion: now 
          } 
        }
      );
      marcadasInactivas = resultadoInactivas.modifiedCount;
      
      // Registrar cambios de inactivación
      for (const ubi of ubicacionesAInactivar) {
        cambios.push({
          ubicacion: ubi,
          tipo_cambio: 'INACTIVA',
          desc_ubicacion: guardadasMap.get(ubi)?.Desc_Ubicacion || '',
          fecha_cambio: new Date(),
          procesado: false
        });
        
        writeToLog(`\t   INACTIVA: ${ubi} - ${guardadasMap.get(ubi)?.Desc_Ubicacion || ''}`);
      }
    }

    // OBTENER CAMBIOS EXISTENTES NO PROCESADOS
    writeToLog(`\n\t=== MANEJANDO CAMBIOS INCREMENTALES ===`);
    const cambiosExistentes = await cambiosCollection.find({ procesado: false }).toArray();
    
    // *** CORRECCIÓN: Crear un Map sin el _id para comparaciones ***
    const cambiosExistentesMap = new Map(
      cambiosExistentes.map(c => {
        const { _id, ...cambioSinId } = c;
        return [c.ubicacion, cambioSinId];
      })
    );
    const ubicacionesConCambiosExistentes = new Set(cambiosExistentes.map(c => c.ubicacion));
    
    writeToLog(`\tCambios existentes no procesados: ${cambiosExistentes.length}`);

    // SOLO AGREGAR CAMBIOS NUEVOS (no duplicar existentes)
    const cambiosNuevos = cambios.filter(cambio => {
      const yaExiste = ubicacionesConCambiosExistentes.has(cambio.ubicacion);
      
      if (yaExiste) {
        const cambioExistente = cambiosExistentesMap.get(cambio.ubicacion);
        
        // PRIORIDAD: RECARGA > DATOS_NUEVOS > NUEVA > ACTUALIZADA > INACTIVA
        const prioridades = { 'RECARGA': 5, 'DATOS_NUEVOS': 4, 'NUEVA': 3, 'ACTUALIZADA': 2, 'INACTIVA': 1 };
        const prioridadNueva = prioridades[cambio.tipo_cambio] || 0;
        const prioridadExistente = prioridades[cambioExistente.tipo_cambio] || 0;
        
        if (prioridadNueva > prioridadExistente) {
          return true; // Agregar el nuevo y reemplazar
        }
        
        return false; // No duplicar
      }
      
      return true; // Agregar cambio nuevo
    });

    if (cambiosNuevos.length > 0) {
      await cambiosCollection.insertMany(cambiosNuevos);
      writeToLog(`\tAgregados ${cambiosNuevos.length} cambios nuevos en 'cambios_ubicaciones_temp':`);
      
      // Contar por tipo de cambio
      const conteoTiposNuevos = cambiosNuevos.reduce((acc, c) => {
        acc[c.tipo_cambio] = (acc[c.tipo_cambio] || 0) + 1;
        return acc;
      }, {});
      
      for (const [tipo, cantidad] of Object.entries(conteoTiposNuevos)) {
        const ubicaciones = cambiosNuevos.filter(c => c.tipo_cambio === tipo).map(c => c.ubicacion);
        writeToLog(`\t  ${tipo}: ${cantidad} [${ubicaciones.join(', ')}]`);
      }
    } else {
      writeToLog(`\tNo hay cambios nuevos que agregar`);
    }

    // ACTUALIZAR CAMBIOS REEMPLAZADOS
    const cambiosParaReemplazar = cambios.filter(cambio => {
      const cambioExistente = cambiosExistentesMap.get(cambio.ubicacion);
      if (!cambioExistente) return false;
      
      const prioridades = { 'RECARGA': 5, 'DATOS_NUEVOS': 4, 'NUEVA': 3, 'ACTUALIZADA': 2, 'INACTIVA': 1 };
      const prioridadNueva = prioridades[cambio.tipo_cambio] || 0;
      const prioridadExistente = prioridades[cambioExistente.tipo_cambio] || 0;
      
      return prioridadNueva > prioridadExistente;
    });

    if (cambiosParaReemplazar.length > 0) {
      for (const cambio of cambiosParaReemplazar) {
        // *** CORRECCIÓN: Remover _id del objeto antes de replaceOne ***
        const { _id, ...cambioSinId } = cambio;
        
        await cambiosCollection.replaceOne(
          { ubicacion: cambio.ubicacion, procesado: false },
          cambioSinId
        );
        writeToLog(`\t   REEMPLAZADO: ${cambio.ubicacion} (${cambio.tipo_cambio})`);
      }
    }

    // RESUMEN FINAL
    writeToLog(`\n\tRESUMEN ACTUALIZACIÓN UBICACIONES:`);
    writeToLog(`\t  Ubicaciones insertadas en 'ubis_saved': ${insertadas}`);
    writeToLog(`\t  Ubicaciones actualizadas en 'ubis_saved': ${actualizadas}`);
    writeToLog(`\t  Ubicaciones marcadas como inactivas: ${marcadasInactivas}`);
    writeToLog(`\t  Ubicaciones recargadas (datos limpiados): ${ubicacionesRecargadas.length}`);
    writeToLog(`\t  Total cambios registrados: ${cambios.length}`);

    if (ubicacionesRecargadas.length > 0) {
      writeToLog(`\n\t   UBICACIONES RECARGADAS:`);
      for (const recarga of ubicacionesRecargadas) {
        writeToLog(`\t    ${recarga.ubicacion}: ${recarga.razon}`);
        writeToLog(`\t      ${recarga.detalles}`);
      }
    }

    // VERIFICAR ESTADO FINAL
    const totalUbisSaved = await ubisSavedCollection.countDocuments();
    const ubisSavedActivas = await ubisSavedCollection.countDocuments({ activa: true });
    const totalCambios = await cambiosCollection.countDocuments();
    
    writeToLog(`\n\tESTADO FINAL:`);
    writeToLog(`\t  Total ubicaciones en 'ubis_saved': ${totalUbisSaved}`);
    writeToLog(`\t  Ubicaciones activas: ${ubisSavedActivas}`);
    writeToLog(`\t  Ubicaciones inactivas: ${totalUbisSaved - ubisSavedActivas}`);
    writeToLog(`\t  Registros en 'cambios_ubicaciones_temp': ${totalCambios}`);

    // MOSTRAR UBICACIONES QUE ACTIVARÁN MODO INCREMENTAL
    const cambiosParaIncremental = await cambiosCollection.find({
      tipo_cambio: { $in: ['NUEVA', 'ACTUALIZADA', 'RECARGA', 'DATOS_NUEVOS'] }
    }).toArray();
    
    if (cambiosParaIncremental.length > 0) {
      const ubicacionesIncremental = cambiosParaIncremental.map(c => c.ubicacion);
      writeToLog(`\n\t   MODO INCREMENTAL ACTIVADO para ubicaciones: [${ubicacionesIncremental.join(', ')}]`);
      
      // Mostrar desglose por tipo
      const tiposCambios = cambiosParaIncremental.reduce((acc, c) => {
        acc[c.tipo_cambio] = (acc[c.tipo_cambio] || []).concat(c.ubicacion);
        return acc;
      }, {});
      
      for (const [tipo, ubicaciones] of Object.entries(tiposCambios)) {
        writeToLog(`\t    ${tipo}: [${ubicaciones.join(', ')}]`);
      }
    } else {
      writeToLog(`\n\t    MODO INCREMENTAL NO ACTIVADO - No hay ubicaciones nuevas o actualizadas`);
    }

    client.close();
    writeToLog(`\tPaso 08 completado exitosamente\n`);

  } catch (error) {
    writeToLog(`${now} - Error en 'ubis_saved': ${error}`);
    writeToLog(`Stack trace: ${error.stack}`);
    console.error(error);
    throw error;
  }
}

// *** NUEVA FUNCIÓN: VERIFICAR SI ES UNA RECARGA ***
async function verificarSiEsRecarga(ubicacionGuardada, datosActuales, ubicacion) {
  try {
    const totalRegistrosAnterior = ubicacionGuardada.total_registros || 0;
    const totalRegistrosActual = datosActuales.total_skus;
    const hashAnterior = ubicacionGuardada.hash_datos || '';
    const hashActual = datosActuales.hash_datos;
    const fechaUltimaCarga = ubicacionGuardada.ultima_carga_datos || new Date(0);
    const tiempoTranscurrido = (new Date() - fechaUltimaCarga) / (1000 * 60); // minutos
    
    // CRITERIOS PARA DETECTAR RECARGA:
    
    // 1. CAMBIO SIGNIFICATIVO EN CANTIDAD DE REGISTROS (±20% o más de 100 registros)
    const diferenciaPorcentual = totalRegistrosAnterior > 0 ? 
      Math.abs(totalRegistrosActual - totalRegistrosAnterior) / totalRegistrosAnterior * 100 : 100;
    const diferenciaAbsoluta = Math.abs(totalRegistrosActual - totalRegistrosAnterior);
    
    if (diferenciaPorcentual >= 20 || diferenciaAbsoluta >= 100) {
      return {
        esRecarga: true,
        razon: 'CAMBIO_SIGNIFICATIVO_DATOS',
        detalles: `Registros: ${totalRegistrosAnterior} → ${totalRegistrosActual} (${diferenciaPorcentual.toFixed(1)}% cambio)`
      };
    }
    
    // 2. HASH DE DATOS COMPLETAMENTE DIFERENTE (indica cambio en SKUs)
    if (hashAnterior && hashActual && hashAnterior !== hashActual) {
      // Verificar que no sea solo un pequeño cambio
      if (diferenciaPorcentual >= 10 || diferenciaAbsoluta >= 50) {
        return {
          esRecarga: true,
          razon: 'DATOS_COMPLETAMENTE_DIFERENTES',
          detalles: `Hash cambió + variación significativa en registros (${diferenciaPorcentual.toFixed(1)}%)`
        };
      }
    }
    
    // 3. PRIMERA CARGA DESPUÉS DE MUCHO TIEMPO (más de 24 horas) CON CAMBIOS
    if (tiempoTranscurrido > (24 * 60) && (diferenciaPorcentual >= 5 || diferenciaAbsoluta >= 20)) {
      return {
        esRecarga: true,
        razon: 'RECARGA_DESPUES_TIEMPO_PROLONGADO',
        detalles: `Primera carga en ${(tiempoTranscurrido / 60).toFixed(1)} horas con cambios significativos`
      };
    }
    
    // 4. PARÁMETRO MANUAL PARA FORZAR RECARGA
    const FORCE_RELOAD = process.argv.includes('--force-reload');
    if (FORCE_RELOAD) {
      return {
        esRecarga: true,
        razon: 'RECARGA_FORZADA',
        detalles: `Recarga forzada por parámetro --force-reload`
      };
    }
    
    return {
      esRecarga: false,
      razon: 'SIN_CAMBIOS_SIGNIFICATIVOS',
      detalles: `Registros: ${totalRegistrosAnterior} → ${totalRegistrosActual} (${diferenciaPorcentual.toFixed(1)}% cambio)`
    };
    
  } catch (err) {
    writeToLog(`\tError verificando recarga para ${ubicacion}: ${err.message}`);
    return {
      esRecarga: false,
      razon: 'ERROR_VERIFICACION',
      detalles: `Error: ${err.message}`
    };
  }
}

// *** NUEVA FUNCIÓN: LIMPIAR DATOS DE UBICACIONES RECARGADAS ***
async function limpiarDatosUbicacionesRecargadas(db, ubicacionesALimpiar) {
  writeToLog(`\t  Iniciando limpieza de datos para ${ubicacionesALimpiar.length} ubicaciones...`);
  
  let totalDocsBorrados = 0;
  const inicioLimpieza = Date.now();
  
  for (const ubicacion of ubicacionesALimpiar) {
    writeToLog(`\t    Limpiando ubicación: ${ubicacion}`);
    let docsBorradosUbicacion = 0;
    
    for (const coleccion of COLECCIONES_CALCULO) {
      try {
        // Verificar si la colección existe
        const collections = await db.listCollections({ name: coleccion }).toArray();
        if (collections.length === 0) {
          writeToLog(`\t        Colección '${coleccion}' no existe - omitiendo`);
          continue;
        }
        
        // Verificar si la colección tiene documentos con esta ubicación
        const coll = db.collection(coleccion);
        const countAntes = await coll.countDocuments({ Ubicacion: ubicacion });
        
        if (countAntes > 0) {
          // BORRAR TODOS LOS DOCUMENTOS DE ESTA UBICACIÓN
          const resultado = await coll.deleteMany({ Ubicacion: ubicacion });
          docsBorradosUbicacion += resultado.deletedCount;
          
          writeToLog(`\t        ${coleccion}: ${resultado.deletedCount} docs eliminados`);
        } else {
          writeToLog(`\t       ${coleccion}: ya limpia (0 docs)`);
        }
        
      } catch (err) {
        writeToLog(`\t       Error limpiando ${coleccion}: ${err.message}`);
      }
    }
    
    totalDocsBorrados += docsBorradosUbicacion;
    writeToLog(`\t     Ubicación ${ubicacion} limpiada: ${docsBorradosUbicacion} documentos eliminados`);
  }
  
  const duracionLimpieza = ((Date.now() - inicioLimpieza) / 1000).toFixed(2);
  writeToLog(`\t   LIMPIEZA COMPLETADA:`);
  writeToLog(`\t    Ubicaciones procesadas: ${ubicacionesALimpiar.length}`);
  writeToLog(`\t    Total documentos eliminados: ${totalDocsBorrados}`);
  writeToLog(`\t    Duración: ${duracionLimpieza} segundos`);
  writeToLog(`\t    Colecciones limpiadas: ${COLECCIONES_CALCULO.length}`);
  
  // REGISTRAR LIMPIEZA EN COLECCIÓN DE AUDITORÍA
  try {
    const auditoriaCollection = db.collection('auditoria_limpiezas');
    await auditoriaCollection.insertOne({
      tipo_limpieza: 'UBICACIONES_RECARGADAS',
      ubicaciones_limpiadas: ubicacionesALimpiar,
      colecciones_afectadas: COLECCIONES_CALCULO,
      documentos_eliminados: totalDocsBorrados,
      fecha_limpieza: new Date(),
      duracion_segundos: parseFloat(duracionLimpieza),
      ejecutado_por: 'P08_actualizarUbisSaved'
    });
    writeToLog(`\t     Auditoría de limpieza registrada`);
  } catch (err) {
    writeToLog(`\t      Error registrando auditoría: ${err.message}`);
  }
}

// *** FUNCIÓN PARA VERIFICAR DATOS NUEVOS EN UBICACIÓN ***
async function verificarDatosNuevosEnUbicacion(db, ubicacion, ubicacionGuardada) {
  try {
    const skuCollection = db.collection('sku');
    
    // CONTAR REGISTROS ACTUALES EN SKU PARA ESTA UBICACIÓN
    const registrosActuales = await skuCollection.countDocuments({ Ubicacion: ubicacion });
    const registrosAnteriores = ubicacionGuardada?.total_registros || 0;
    
    // OBTENER HASH DE DATOS ACTUALES (basado en los SKUs)
    const skusActuales = await skuCollection.find(
      { Ubicacion: ubicacion }, 
      { projection: { SKU: 1, Desc_SKU: 1 } }
    ).sort({ SKU: 1 }).toArray();
    
    const datosParaHash = skusActuales.map(s => `${s.SKU}|${s.Desc_SKU}`).join('');
    const hashActual = crypto.createHash('md5').update(datosParaHash).digest('hex');
    const hashAnterior = ubicacionGuardada?.hash_datos || '';
    
    // DETERMINAR SI HAY DATOS NUEVOS (criterio más estricto para evitar recargas innecesarias)
    const diferenciaRegistros = Math.abs(registrosActuales - registrosAnteriores);
    const hayNuevosDatos = diferenciaRegistros >= 10 || // Mínimo 10 registros de diferencia
                          (hashAnterior && hashActual !== hashAnterior && diferenciaRegistros > 0);
    
    let descripcion = '';
    if (registrosActuales > registrosAnteriores) {
      descripcion = `+${registrosActuales - registrosAnteriores} registros nuevos (${registrosAnteriores} → ${registrosActuales})`;
    } else if (registrosActuales < registrosAnteriores) {
      descripcion = `${registrosAnteriores - registrosActuales} registros eliminados (${registrosAnteriores} → ${registrosActuales})`;
    } else if (hashAnterior && hashActual !== hashAnterior) {
      descripcion = `Datos modificados (misma cantidad, contenido diferente)`;
    }
    
    return {
      hayNuevosDatos,
      descripcion,
      totalRegistros: registrosActuales,
      registrosAnteriores,
      hashDatos: hashActual,
      fechaCarga: new Date()
    };
    
  } catch (err) {
    writeToLog(`\tError verificando datos nuevos para ubicación ${ubicacion}: ${err.message}`);
    return {
      hayNuevosDatos: false,
      descripcion: `Error en verificación: ${err.message}`,
      totalRegistros: 0,
      registrosAnteriores: 0,
      hashDatos: '',
      fechaCarga: new Date()
    };
  }
}

actualizarUbisSaved();