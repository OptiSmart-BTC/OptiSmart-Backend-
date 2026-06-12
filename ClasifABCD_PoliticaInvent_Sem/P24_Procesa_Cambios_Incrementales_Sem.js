const { exec } = require("child_process");
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const crypto = require('crypto');

const { host, puerto } = require('../Configuraciones/ConexionDB');

// VALIDAR ARGUMENTOS
if (process.argv.length < 5) {
  console.error("Uso: node P24_script.js <dbName> <DBUser> <DBPassword>");
  process.exit(1);
}

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

// CONFIGURACIÓN DE LOGS
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/Incremental_Semanal.log`;

async function procesaCambiosIncrementales() {
    console.log('INICIANDO P24 - Procesamiento Incremental de Ubicaciones');
    writeToLog(`P24 - Procesamiento Incremental de Ubicaciones`);
    writeToLog(`Parametros: dbName=${dbName}, DBUser=${DBUser}`);
    writeToLog(`MongoDB URI: ${mongoUri.replace(DBPassword, '***')}`);

    let client;
    try {
        writeToLog(`Conectando a MongoDB...`);
        client = await MongoClient.connect(mongoUri, { 
            useNewUrlParser: true, 
            useUnifiedTopology: true 
        });
        writeToLog(`Conexión exitosa a MongoDB`);
        const db = client.db(dbName);

        const cambiosCollection = db.collection('cambios_ubicaciones_temp_sem');
        const skuCollection = db.collection('sku');

        // VERIFICAR SI P24 YA SE EJECUTÓ PARA ESTOS CAMBIOS (CON RECARGAS)
        const yaEjecutado = await verificarSiYaSeEjecutoConRecargas(db);
        if (yaEjecutado) {
            writeToLog(`P24 YA EJECUTADO PARA ESTOS CAMBIOS - SALTANDO`);
            console.log('P24: Ya ejecutado para estos cambios');
            return;
        }

        // OBTENER CAMBIOS PENDIENTES
        writeToLog(`Obteniendo cambios pendientes...`);
        const cambiosPendientes = await cambiosCollection.find().toArray();
        writeToLog(`Total cambios encontrados: ${cambiosPendientes.length}`);

        if (cambiosPendientes.length === 0 || 
            (cambiosPendientes.length === 1 && cambiosPendientes[0].tipo_cambio === 'NO_CAMBIOS')) {
            writeToLog(`No hay cambios reales que procesar - P24 terminado`);
            console.log('P24: No hay cambios que procesar');
            return;
        }

        // FILTRAR UBICACIONES INCLUYENDO RECARGAS
        const ubicacionesAProcesar = cambiosPendientes
            .filter(c => 
                c.tipo_cambio === 'NUEVA' || 
                c.tipo_cambio === 'ACTUALIZADA' || 
                c.tipo_cambio === 'RECARGA'
            )
            .map(c => c.ubicacion);

        const ubicacionesAEliminar = cambiosPendientes
            .filter(c => c.tipo_cambio === 'ELIMINADA')
            .map(c => c.ubicacion);

        // LOGGING ESPECÍFICO PARA RECARGAS
        const recargas = cambiosPendientes.filter(c => c.tipo_cambio === 'RECARGA');
        if (recargas.length > 0) {
            writeToLog(`RECARGAS DETECTADAS EN P24:`);
            writeToLog(`   ${recargas.length} ubicaciones recargadas para procesar`);
            for (const recarga of recargas) {
                writeToLog(`   ${recarga.ubicacion}: ${recarga.razon_recarga || 'Recarga detectada'}`);
                if (recarga.detalles_recarga) {
                    writeToLog(`      ${recarga.detalles_recarga}`);
                }
            }
        }

        writeToLog(`Ubicaciones a procesar: ${ubicacionesAProcesar.length} [${ubicacionesAProcesar.join(', ')}]`);
        writeToLog(`Ubicaciones a eliminar: ${ubicacionesAEliminar.length} [${ubicacionesAEliminar.join(', ')}]`);

        if (ubicacionesAProcesar.length === 0 && ubicacionesAEliminar.length === 0) {
            writeToLog(`No hay ubicaciones que procesar - P24 terminado`);
            return;
        }

        // MARCAR INICIO DE PROCESAMIENTO P24
        await marcarInicioProcesamientoP24(db, ubicacionesAProcesar, ubicacionesAEliminar);

        // PASO 1: PROCESAR ELIMINACIONES
        if (ubicacionesAEliminar.length > 0) {
            writeToLog(`\nPROCESANDO ELIMINACIONES...`);
            await procesarEliminaciones(db, ubicacionesAEliminar);
        }

        // PASO ESPECIAL: PROCESAR RECARGAS
        const recargasDetectadas = cambiosPendientes.filter(c => c.tipo_cambio === 'RECARGA');
        if (recargasDetectadas.length > 0) {
            const ubicacionesConRecargas = recargasDetectadas.map(c => c.ubicacion);
            writeToLog(`\nPROCESANDO RECARGAS ESPECIALES...`);
            await procesarRecargasEspeciales(db, ubicacionesConRecargas);
        }

        // PASO 2: VERIFICAR SKUs PARA LAS UBICACIONES NUEVAS
        if (ubicacionesAProcesar.length > 0) {
            writeToLog(`VERIFICANDO DATOS PARA UBICACIONES NUEVAS...`);
            const skusEnUbicaciones = await skuCollection.find({
                Ubicacion: { $in: ubicacionesAProcesar },
                $or: [
                    { Ignorar: { $exists: false } },
                    { Ignorar: 0 },
                    { Ignorar: "0" },
                    { Ignorar: false }
                ]
            }).toArray();

            writeToLog(`SKUs válidos encontrados para ubicaciones nuevas: ${skusEnUbicaciones.length}`);
            
            if (skusEnUbicaciones.length === 0) {
                writeToLog(`No se encontraron SKUs válidos para las ubicaciones nuevas`);
                writeToLog(`Ubicaciones sin SKUs válidos: [${ubicacionesAProcesar.join(', ')}]`);
                console.log('P24: No hay SKUs válidos para procesar');
                
                if (ubicacionesAEliminar.length > 0) {
                    await marcarCambiosComoProcesadosConCoordinacionConRecargas(db, []);
                }
                return;
            }

            // PASO 3: PREPARAR DATOS INCREMENTALES
            writeToLog(`PREPARANDO PROCESAMIENTO INCREMENTAL...`);
            await prepararDatosIncrementales(db, ubicacionesAProcesar, skusEnUbicaciones);

            try {
                // PASO 4: EJECUTAR SCRIPTS DE CLASIFICACIÓN
                writeToLog(`EJECUTANDO SCRIPTS DE CLASIFICACIÓN INCREMENTAL...`);
                await ejecutarScriptsClasificacion();

                // PASO 5: EJECUTAR SCRIPTS DE POLÍTICAS  
                writeToLog(`EJECUTANDO SCRIPTS DE POLÍTICAS INCREMENTAL...`);
                await ejecutarScriptsPoliticas();

                // PASO 6: CREAR TABLA FINAL politica_inventarios_01
                writeToLog(`CREANDO TABLA FINAL politica_inventarios_01...`);
                await ejecutarScript('P22_Crea_Politica_Final_Sem.js');

            } finally {
                // RESTAURAR SKUs ORIGINALES SIEMPRE
                writeToLog(`RESTAURANDO SKUs ORIGINALES...`);
                await restaurarSkusOriginales(db);
            }
        }

        // CAMBIO CRÍTICO: MARCAR COMO PROCESADOS CON MEJOR COORDINACIÓN Y RECARGAS
        await marcarCambiosComoProcesadosConCoordinacionConRecargas(db, ubicacionesAProcesar);

        // MARCAR ESTADO INCREMENTAL COMPLETADO CON COORDINACIÓN P22
        await marcarEstadoIncrementalCompletadoConCoordinacion(db, ubicacionesAProcesar);

        // VERIFICAR SI P22 DEBE EJECUTARSE
        await verificarYPrepararP22(db, ubicacionesAProcesar);

        writeToLog(`P24 COMPLETADO EXITOSAMENTE`);
        writeToLog(`Ubicaciones procesadas: ${ubicacionesAProcesar.length}`);
        writeToLog(`Ubicaciones eliminadas: ${ubicacionesAEliminar.length}`);
        if (recargas.length > 0) {
            writeToLog(`Recargas procesadas: ${recargas.length}`);
        }
        console.log(`P24 completado - ${ubicacionesAProcesar.length} ubicaciones procesadas`);

        // FINALIZACIÓN CON VERIFICACIÓN DE P22
        await finalizarP24ConVerificacion(db, ubicacionesAProcesar);

    } catch (err) {
        const errorMsg = `ERROR en P24: ${err.message}`;
        writeToLog(errorMsg);
        console.error('ERROR en P24:', err.message);
        console.error('Stack trace:', err.stack);
        
        // Intentar restaurar SKUs en caso de error
        if (client) {
            try {
                const db = client.db(dbName);
                await restaurarSkusOriginales(db);
                writeToLog(`SKUs originales restaurados tras error`);
            } catch (restoreErr) {
                writeToLog(`Error restaurando SKUs: ${restoreErr.message}`);
            }
        }
        
        throw err;
    } finally {
        if (client) {
            writeToLog(`Cerrando conexión a MongoDB...`);
            await client.close();
            writeToLog(`Conexión cerrada`);
            console.log('P24: Conexión MongoDB cerrada');
        }
    }
}

// FUNCIÓN MEJORADA: VERIFICAR SI YA SE EJECUTÓ CON RECARGAS
async function verificarSiYaSeEjecutoConRecargas(db) {
    try {
        // VERIFICAR RECARGAS PRIMERO
        const cambiosCollection = db.collection('cambios_ubicaciones_temp');
        const recargasPendientes = await cambiosCollection.find({
            tipo_cambio: 'RECARGA',
            procesado: false
        }).toArray();
        
        if (recargasPendientes.length > 0) {
            writeToLog(`RECARGAS DETECTADAS EN P24:`);
            writeToLog(`   ${recargasPendientes.length} ubicaciones recargadas requieren procesamiento`);
            for (const recarga of recargasPendientes) {
                writeToLog(`   ${recarga.ubicacion}: ${recarga.razon_recarga || 'Datos recargados'}`);
            }
            writeToLog(`   FORZANDO EJECUCIÓN P24 - Las recargas tienen máxima prioridad`);
            return false; // Permitir ejecución
        }
        
        // Lógica original para verificar ejecuciones recientes...
        const estadoCollection = db.collection('estado_procesamiento_p24');
        const estadoReciente = await estadoCollection.findOne({
            _id: 'ultimo_procesamiento_incremental'
        });
        
        if (!estadoReciente) {
            writeToLog(`No existe estado previo de P24`);
            return false;
        }
        
        const minutosTranscurridos = (new Date() - estadoReciente.fecha_completado) / (1000 * 60);
        const VENTANA_PROTECCION = 5; // 5 minutos
        
        if (minutosTranscurridos < VENTANA_PROTECCION && estadoReciente.completado) {
            writeToLog(`P24 EJECUTADO RECIENTEMENTE:`);
            writeToLog(`   Fecha: ${estadoReciente.fecha_completado}`);
            writeToLog(`   Minutos transcurridos: ${minutosTranscurridos.toFixed(1)}`);
            writeToLog(`   Ubicaciones procesadas: [${(estadoReciente.ubicaciones_procesadas || []).join(', ')}]`);
            
            // Verificar si es el mismo hash de ubicaciones
            const cambiosActuales = await cambiosCollection.find({
                $or: [
                    { tipo_cambio: 'NUEVA' },
                    { tipo_cambio: 'ACTUALIZADA' },
                    { tipo_cambio: 'RECARGA' }
                ]
            }).toArray();
            
            if (cambiosActuales.length > 0) {
                const ubicacionesActuales = cambiosActuales.map(c => c.ubicacion).sort();
                const hashActual = crypto.createHash('md5').update(ubicacionesActuales.join(',')).digest('hex');
                
                if (estadoReciente.hash_ubicaciones === hashActual) {
                    // VERIFICAR SI HAY RECARGAS EN EL HASH ACTUAL
                    const hayRecargas = cambiosActuales.some(c => c.tipo_cambio === 'RECARGA');
                    if (hayRecargas) {
                        writeToLog(`   RECARGAS EN HASH ACTUAL - PERMITIENDO EJECUCIÓN`);
                        return false;
                    }
                    
                    writeToLog(`   MISMO HASH DETECTADO - P24 ya procesó estos cambios`);
                    return true;
                }
            }
        }
        
        return false;
        
    } catch (err) {
        writeToLog(`Error verificando estado previo P24: ${err.message}`);
        return false;
    }
}

// FUNCIÓN PARA PROCESAR RECARGAS ESPECIALES
async function procesarRecargasEspeciales(db, ubicacionesConRecargas) {
    if (ubicacionesConRecargas.length === 0) return;
    
    writeToLog(`PROCESAMIENTO ESPECIAL DE RECARGAS...`);
    writeToLog(`   Ubicaciones con recarga: [${ubicacionesConRecargas.join(', ')}]`);
    
    // Las recargas requieren limpieza completa de datos previos
    const targetCollection = db.collection('politica_inventarios_01_sem');
    
    writeToLog(`   Limpiando datos previos de ubicaciones recargadas...`);
    for (const ubicacion of ubicacionesConRecargas) {
        const resultado = await targetCollection.deleteMany({
            Ubicacion: ubicacion
        });
        writeToLog(`   Ubicación ${ubicacion}: ${resultado.deletedCount} registros previos eliminados`);
    }
    
    // También limpiar de tablas UI
    const coleccionesUI = [
      'ui_sem_all_pol_inv',
      'ui_sem_pol_inv_costo', 
      'ui_sem_pol_inv_dias_cobertura',
      'ui_sem_pol_inv_pallets',
      'ui_sem_pol_inv_uom',
      'ui_sem_politica_inventarios'
    ];
    
    for (const nombreCol of coleccionesUI) {
        try {
            const collections = await db.listCollections({ name: nombreCol }).toArray();
            if (collections.length > 0) {
                const col = db.collection(nombreCol);
                const resultado = await col.deleteMany({
                    Ubicacion: { $in: ubicacionesConRecargas }
                });
                writeToLog(`   Limpiado ${nombreCol}: ${resultado.deletedCount} registros`);
            }
        } catch (err) {
            writeToLog(`   Error limpiando ${nombreCol}: ${err.message}`);
        }
    }
    
    writeToLog(`Limpieza de recargas completada - listas para recálculo completo`);
}

// FUNCIÓN PARA MARCAR INICIO DE PROCESAMIENTO
async function marcarInicioProcesamientoP24(db, ubicacionesAProcesar, ubicacionesAEliminar) {
    try {
        const estadoCollection = db.collection('estado_procesamiento_p24');
        
        const hashUbicaciones = ubicacionesAProcesar.length > 0 ? 
            crypto.createHash('md5').update(ubicacionesAProcesar.sort().join(',')).digest('hex') : 
            null;
        
        const estadoInicio = {
            _id: 'procesamiento_en_curso',
            estado: 'INICIANDO',
            fecha_inicio: new Date(),
            ubicaciones_a_procesar: ubicacionesAProcesar,
            ubicaciones_a_eliminar: ubicacionesAEliminar,
            hash_ubicaciones: hashUbicaciones,
            sesion_id: `P24_${Date.now()}`,
            completado: false
        };
        
        await estadoCollection.replaceOne(
            { _id: 'procesamiento_en_curso' },
            estadoInicio,
            { upsert: true }
        );
        
        writeToLog(`Estado inicial P24 marcado - Sesión: ${estadoInicio.sesion_id}`);
        
    } catch (err) {
        writeToLog(`Error marcando inicio P24: ${err.message}`);
    }
}

async function procesarEliminaciones(db, ubicacionesAEliminar) {
    writeToLog(`Eliminando políticas de ubicaciones inactivas...`);
    
    const politicaCollection = db.collection('politica_inventarios_01_sem');
    const resultadoEliminacion = await politicaCollection.deleteMany({
        Ubicacion: { $in: ubicacionesAEliminar }
    });
    
    writeToLog(`Políticas eliminadas: ${resultadoEliminacion.deletedCount}`);
    
    // También eliminar de otras colecciones de UI si existen
    const coleccionesUI = [
        'ui_sem_all_pol_inv',
        'ui_sem_pol_inv_costo', 
        'ui_sem_pol_inv_dias_cobertura',
        'ui_sem_pol_inv_pallets',
        'ui_sem_pol_inv_uom',
        'ui_sem_politica_inventarios'
    ];
    
    for (const nombreCol of coleccionesUI) {
        try {
            const collections = await db.listCollections({ name: nombreCol }).toArray();
            if (collections.length > 0) {
                const col = db.collection(nombreCol);
                const resultado = await col.deleteMany({
                    Ubicacion: { $in: ubicacionesAEliminar }
                });
                writeToLog(`Eliminados de ${nombreCol}: ${resultado.deletedCount} registros`);
            } else {
                writeToLog(`Colección ${nombreCol} no existe, saltando eliminación`);
            }
        } catch (err) {
            writeToLog(`Error eliminando de ${nombreCol}: ${err.message}`);
        }
    }
}

async function prepararDatosIncrementales(db, ubicacionesAProcesar, skusEnUbicaciones) {
    const skuCollection = db.collection('sku');
    
    // BACKUP DE SKUs ORIGINALES
    writeToLog(`Creando backup de SKUs originales...`);
    const todosSkusOriginales = await skuCollection.find().toArray();
    await db.collection('sku_backup_incremental').deleteMany({});
    if (todosSkusOriginales.length > 0) {
        await db.collection('sku_backup_incremental').insertMany(todosSkusOriginales);
        writeToLog(`Backup creado: ${todosSkusOriginales.length} SKUs`);
    }

    // REEMPLAZAR COLECCIÓN SKU CON SOLO LAS UBICACIONES A PROCESAR
    writeToLog(`Filtrando SKUs a solo ubicaciones nuevas...`);
    await skuCollection.deleteMany({});
    await skuCollection.insertMany(skusEnUbicaciones);
    writeToLog(`SKUs filtrados insertados: ${skusEnUbicaciones.length}`);

    // LIMPIAR COLECCIONES TEMPORALES
    writeToLog(`Limpiando colecciones temporales...`);
    const coleccionesALimpiar = [
        'demanda_abcd_01_sem',
        'demanda_porcentaje_01_sem', 
        'demanda_ordenada_01_sem',
        'demanda_acumulada_01_sem',
        'clasificacion_dmd_01_sem',
        'demanda_abc_01_sem'
    ];

    for (const coleccion of coleccionesALimpiar) {
        try {
            const collections = await db.listCollections({ name: coleccion }).toArray();
            if (collections.length > 0) {
                const resultado = await db.collection(coleccion).deleteMany({});
                writeToLog(`Limpiada ${coleccion}: ${resultado.deletedCount} registros`);
            } else {
                writeToLog(`Colección ${coleccion} no existe, creándose automáticamente`);
            }
        } catch (err) {
            writeToLog(`Error limpiando ${coleccion}: ${err.message}`);
        }
    }
}

async function ejecutarScriptsClasificacion() {
    writeToLog(`Ejecutando scripts de clasificación para ubicaciones nuevas...`);
    
    const scriptsClasificacion = [
      'CS00_limpiaTablasProcesos.js',
      'CS01_Actualiza_HistDMD_Week_Year.js',
      'CS02_Calcula_FechasHorizontes.js',
      'CS03_AgrupaHistDMD_v2.js',
      'CS04_Calcula_Demanda_Costo_v2.js',
      'CS05_Calcula_Demanda_Porcentaje.js',
      'CS06_OrdenaDemanda.js',
      'CS06.1_Obtiene_SKU_Fuera_de_Rango.js',
      'CS07_CalculaDemanda_Acumulada.js',
      'CS08_CalculaClasificacionDMD.js',
      'CS09_CalculaDemanda_ABCD_v2.js',
      'CS09.1_Actualiza_Datos_SKU.js',
      // 'CS10_CalculaErrorCuadrado_HistDMD.js',
      // 'CS11_Calcula_Variabilidad_Demanda_v2.js',
      // 'CS12_Calcula_DS_Demanda.js',
      'CS12.1_Calcula_STDEV.js',
      'CS13_Calcula_Coeficiente_Variabilidad_v2.js',
      'CS14_Calcula_Clasificacion_Variabilidad.js',
      'CS15_Calcula_Margen_Unitario.js',
      'CS16_Calcula_Calificacion_Margen.js',
      'CS17.0_Calcula_Override_SI_NO.js',
      'CS17.1_Calcula_Clasificación_ABCD_v3.js',
      'CS18_Formatea_TablaUI.js',
      'CS19_Inserta_LastUpdate.js',
    ];

    for (const script of scriptsClasificacion) {
        await ejecutarScript(script);
    }
}

async function ejecutarScriptsPoliticas() {
    writeToLog(`Ejecutando scripts de políticas para ubicaciones nuevas...`);
    
    const scriptsPoliticas = [
      'PS00_limpia_politica_inv.js',
      'PS01_Calcula_ValorZ.js',
      'PS02_Calcula_Campos_Iniciales_v3.js',
      'PS02.1_Actualiza_Datos_SKU.js',
      'PS03_Calcula_Demanda_Promedio_Semanal.js',
      // 'PS04_CalculaErrorCuadrado_HistDMD.js',
      // 'PS05_Calcula_Variabilidad_Demanda_Cantidad_v2.js',
      'PS05.1_Calcula_DS.js',
      'PS06_Calcula_Nivel_Servicio.js',
      'PS07_Calcula_CamposSKU_v3.js',
      'PS08_Calcula_Prom_LT.js',
      'PS09_Calcula_DS_LT.js',
      // 'PS09.2_Calcula_DS_LT_v2.js',
      'PS09.1_Calcula_Stat_SS.js',
      'PS10_Calcula_SS_Cantidad_v4.js',
      'PS10.1_Calcula_Override_SI_NO.js',
      'PS11_Calcula_Demanda_LT.js',
      'PS12_Calcula_ROQ.js',
      'PS13_Calcula_ROP_v2.js',
      'PS14_Calcula_META.js',
      'PS15_Calcula_Inventario_Promedio.js',
      'PS16_Formatea_TablaUI.js',
      'PS17_Calcula_Dias_Cobertura.js',
      'PS17.1_Calcula_VidaUtilDias_ROPAlto_SobreinventarioDias.js',
      'PS18_Calcula_Pallets.js',
      'PS19_Calcula_Costo.js',
      'PS19.1_Calcula_UOM.js',
      'PS20_Formatea_TablasUI_Costos.js',
      'PS21_UneTablas.js',
    ];

    for (const script of scriptsPoliticas) {
        await ejecutarScript(script);
    }
}

async function ejecutarScript(nombreScript) {
    const inicio = moment();
    const comando = `node ${nombreScript} ${dbName} ${DBUser} ${DBPassword}`;
    
    writeToLog(`Iniciando ${nombreScript}...`);
    
    try {
        await ejecutarComando(comando);
        const duracion = moment.duration(moment().diff(inicio)).asSeconds().toFixed(2);
        writeToLog(`${nombreScript} completado - Duración: ${duracion}s`);
    } catch (error) {
        const duracion = moment.duration(moment().diff(inicio)).asSeconds().toFixed(2);
        writeToLog(`Error en ${nombreScript} tras ${duracion}s: ${error.message}`);
        throw error;
    }
}

function ejecutarComando(comando) {
    return new Promise((resolve, reject) => {
        exec(comando, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                writeToLog(`Error ejecutando comando: ${error.message}`);
                if (stderr) writeToLog(`STDERR: ${stderr}`);
                reject(error);
            } else {
                if (stdout) writeToLog(`STDOUT: ${stdout.trim()}`);
                resolve(stdout);
            }
        });
    });
}

async function restaurarSkusOriginales(db) {
    writeToLog(`Restaurando SKUs originales completos...`);
    
    try {
        const skuCollection = db.collection('sku');
        const backupCollection = db.collection('sku_backup_incremental');
        
        const collections = await db.listCollections({ name: 'sku_backup_incremental' }).toArray();
        if (collections.length === 0) {
            writeToLog(`No existe backup de SKUs para restaurar`);
            return;
        }
        
        const skusOriginales = await backupCollection.find().toArray();
        
        if (skusOriginales.length > 0) {
            await skuCollection.deleteMany({});
            
            const batchSize = 1000;
            for (let i = 0; i < skusOriginales.length; i += batchSize) {
                const batch = skusOriginales.slice(i, i + batchSize);
                await skuCollection.insertMany(batch);
            }
            
            writeToLog(`SKUs originales restaurados: ${skusOriginales.length}`);
            
            await backupCollection.deleteMany({});
            writeToLog(`Backup de SKUs limpiado`);
        } else {
            writeToLog(`Backup de SKUs está vacío`);
        }
    } catch (err) {
        writeToLog(`Error restaurando SKUs originales: ${err.message}`);
        throw err;
    }
}

// FUNCIÓN MEJORADA: MARCAR CAMBIOS COMO PROCESADOS CON COORDINACIÓN Y RECARGAS
async function marcarCambiosComoProcesadosConCoordinacionConRecargas(db, ubicacionesProcesadas) {
    writeToLog(`MARCANDO CAMBIOS COMO PROCESADOS (con coordinación P22 y recargas)...`);
    try {
        const cambiosCollection = db.collection('cambios_ubicaciones_temp_sem');
        
        // Identificar recargas procesadas
        const recargasProcesadas = await cambiosCollection.find({
            tipo_cambio: 'RECARGA',
            ubicacion: { $in: ubicacionesProcesadas }
        }).toArray();
        
        const hashUbicaciones = ubicacionesProcesadas.length > 0 ? 
            crypto.createHash('md5').update(ubicacionesProcesadas.sort().join(',')).digest('hex') : 
            null;
        
        // Marcar con información específica sobre recargas
        const updateData = {
            procesado: true,
            fecha_procesado: new Date(),
            procesado_por: 'P24',
            sesion_procesamiento: `P24_${moment().format('YYYYMMDD_HHmmss')}`,
            listo_para_p22: true,
            hash_ubicaciones: hashUbicaciones,
            ubicaciones_procesadas: ubicacionesProcesadas
        };
        
        // Información adicional para recargas
        if (recargasProcesadas.length > 0) {
            updateData.recargas_procesadas = recargasProcesadas.length;
            updateData.ubicaciones_recargadas = recargasProcesadas.map(r => r.ubicacion);
            updateData.tipo_procesamiento = 'RECARGA_COMPLETA';
        }
        
        const resultado = await cambiosCollection.updateMany(
            { procesado: { $ne: true } }, 
            { $set: updateData }
        );
        
        writeToLog(`Cambios marcados como procesados: ${resultado.modifiedCount}`);
        if (recargasProcesadas.length > 0) {
            writeToLog(`   Incluye ${recargasProcesadas.length} recargas: [${recargasProcesadas.map(r => r.ubicacion).join(', ')}]`);
        }
        writeToLog(`   Hash ubicaciones: ${hashUbicaciones}`);
        
        // CREAR SEÑAL ESPECÍFICA PARA P22
        const cambiosPendientesP22 = await cambiosCollection.find({
            procesado: true,
            listo_para_p22: true,
            $or: [
                { tipo_cambio: 'NUEVA' },
                { tipo_cambio: 'ACTUALIZADA' },
                { tipo_cambio: 'RECARGA' }
            ]
        }).toArray();
        
        if (cambiosPendientesP22.length > 0) {
            writeToLog(`Cambios listos para P22: ${cambiosPendientesP22.length}`);
            
            const ubicacionesParaP22 = [...new Set(cambiosPendientesP22.map(c => c.ubicacion))];
            writeToLog(`   Ubicaciones para P22: [${ubicacionesParaP22.join(', ')}]`);
            
            const signalData = {
                _id: 'incremental_ready',
                ready: true,
                ubicaciones: ubicacionesParaP22,
                created_by: 'P24',
                created_at: new Date(),
                processed_by_p22: false,
                hash_ubicaciones: hashUbicaciones,
                sesion_p24: `P24_${moment().format('YYYYMMDD_HHmmss')}`
            };
            
            // Información adicional si hay recargas
            if (recargasProcesadas.length > 0) {
                signalData.incluye_recargas = true;
                signalData.cantidad_recargas = recargasProcesadas.length;
                signalData.ubicaciones_recargadas = recargasProcesadas.map(r => r.ubicacion);
            }
            
            await db.collection('p22_signals').replaceOne(
                { _id: 'incremental_ready' },
                signalData,
                { upsert: true }
            );
            
            writeToLog(`Señal creada para P22 - ubicaciones listas para integración final`);
            if (recargasProcesadas.length > 0) {
                writeToLog(`   Incluye ${recargasProcesadas.length} recargas procesadas`);
            }
        }
        
    } catch (err) {
        writeToLog(`Error marcando cambios procesados: ${err.message}`);
    }
}

// NUEVA FUNCIÓN: MARCAR ESTADO INCREMENTAL COMPLETADO CON COORDINACIÓN
async function marcarEstadoIncrementalCompletadoConCoordinacion(db, ubicacionesProcesadas) {
    try {
        writeToLog(`Marcando estado incremental completado con coordinación P22...`);
        
        const estadoCollection = db.collection('estado_procesamiento_p24');
        
        const hashUbicaciones = ubicacionesProcesadas.length > 0 ? 
            crypto.createHash('md5').update(ubicacionesProcesadas.sort().join(',')).digest('hex') : 
            null;
        
        const estadoActual = {
            _id: 'ultimo_procesamiento_incremental',
            tipo_procesamiento: 'INCREMENTAL',
            fecha_completado: new Date(),
            ubicaciones_procesadas: ubicacionesProcesadas,
            completado: true,
            version_ejecucion: moment().format('YYYYMMDD_HHmmss'),
            usuario: process.env.USER || 'system',
            ejecutado_por: 'P24',
            
            // CAMPOS DE COORDINACIÓN CON P22
            listo_para_p22: true,
            p22_debe_ejecutar: ubicacionesProcesadas.length > 0,
            hash_ubicaciones: hashUbicaciones,
            sesion_id: `P24_${Date.now()}`,
            
            // ESTADO DE INTEGRACIÓN
            requiere_integracion_final: true,
            datos_temporales_listos: true,
            ui_all_pol_inv_actualizada: true
        };
        
        await estadoCollection.replaceOne(
            { _id: 'ultimo_procesamiento_incremental' },
            estadoActual,
            { upsert: true }
        );
        
        writeToLog(`Estado incremental guardado - Sesión: ${estadoActual.sesion_id}`);
        writeToLog(`   Ubicaciones: [${ubicacionesProcesadas.join(', ')}]`);
        writeToLog(`   Listo para P22: ${estadoActual.listo_para_p22}`);
        writeToLog(`   Hash ubicaciones: ${hashUbicaciones}`);
        
        // CREAR LOCK TEMPORAL PARA COORDINAR CON P22
        await crearLockTemporalP22(db, ubicacionesProcesadas, hashUbicaciones);
        
    } catch (err) {
        writeToLog(`Error guardando estado incremental: ${err.message}`);
    }
}

// FUNCIÓN PARA CREAR LOCK TEMPORAL P22
async function crearLockTemporalP22(db, ubicacionesProcesadas, hashUbicaciones) {
    try {
        const lockCollection = db.collection('p22_execution_lock');
        
        const lockData = {
            _id: 'p22_incremental_lock',
            ubicaciones_pendientes: ubicacionesProcesadas,
            fecha_creacion: new Date(),
            creado_por: 'P24',
            activo: true,
            hash_ubicaciones: hashUbicaciones,
            expira_en: new Date(Date.now() + 10 * 60 * 1000), // 10 minutos
            motivo: 'Proteger integración incremental P22'
        };
        
        await lockCollection.replaceOne(
            { _id: 'p22_incremental_lock' },
            lockData,
            { upsert: true }
        );
        
        writeToLog(`Lock temporal creado para P22 - expira en 10 minutos`);
        writeToLog(`   Ubicaciones protegidas: [${ubicacionesProcesadas.join(', ')}]`);
        
    } catch (err) {
        writeToLog(`Error creando lock temporal P22: ${err.message}`);
    }
}

// FUNCIÓN PARA VERIFICAR Y PREPARAR P22
async function verificarYPrepararP22(db, ubicacionesProcesadas) {
    try {
        writeToLog(`\nVERIFICANDO PREPARACIÓN PARA P22...`);
        
        // 1. VERIFICAR QUE ui_all_pol_inv TIENE DATOS
        const uiAllPolInv = db.collection('ui_all_pol_inv');
        const datosUI = await uiAllPolInv.find({
            Ubicacion: { $in: ubicacionesProcesadas }
        }).toArray();
        
        if (datosUI.length === 0) {
            writeToLog(`ADVERTENCIA: No hay datos en ui_all_pol_inv para ubicaciones procesadas`);
            writeToLog(`   P22 no podrá integrar - verificar scripts de políticas`);
            return;
        }
        
        writeToLog(`ui_all_pol_inv tiene ${datosUI.length} registros para integración`);
        
        // 2. CREAR METADATA PARA P22
        await db.collection('p22_integration_metadata').replaceOne(
            { _id: 'incremental_ready' },
            {
                _id: 'incremental_ready',
                ubicaciones_listas: ubicacionesProcesadas,
                registros_ui_disponibles: datosUI.length,
                fecha_preparacion: new Date(),
                preparado_por: 'P24',
                hash_ubicaciones: crypto.createHash('md5').update(ubicacionesProcesadas.sort().join(',')).digest('hex'),
                listo_para_integracion: true,
                
                // RESUMEN DE DATOS
                skus_por_ubicacion: ubicacionesProcesadas.reduce((acc, ub) => {
                    acc[ub] = datosUI.filter(d => d.Ubicacion === ub).length;
                    return acc;
                }, {})
            },
            { upsert: true }
        );
        
        writeToLog(`Metadata de integración creada para P22`);
        writeToLog(`   SKUs por ubicación: ${JSON.stringify(ubicacionesProcesadas.reduce((acc, ub) => {
            acc[ub] = datosUI.filter(d => d.Ubicacion === ub).length;
            return acc;
        }, {}))}`);
        
    } catch (err) {
        writeToLog(`Error verificando preparación P22: ${err.message}`);
    }
}

// FUNCIÓN PARA VERIFICAR SI P22 YA PROCESÓ
async function verificarP22CompletadoParaUbicaciones(db, ubicaciones) {
    try {
        const estadoP22 = await db.collection('estado_procesamiento_p22').findOne({
            _id: 'ultimo_procesamiento'
        });
        
        if (!estadoP22) {
            writeToLog(`No se encontró estado de P22 previo`);
            return false;
        }
        
        const hashUbicaciones = crypto.createHash('md5').update(ubicaciones.sort().join(',')).digest('hex');
        
        const esMismoHash = estadoP22.hash_ubicaciones === hashUbicaciones;
        const esReciente = (new Date() - estadoP22.fecha_completado) < (10 * 60 * 1000); // 10 minutos
        
        writeToLog(`Verificación P22 para ubicaciones [${ubicaciones.join(', ')}]:`);
        writeToLog(`   Hash actual: ${hashUbicaciones}`);
        writeToLog(`   Hash P22: ${estadoP22.hash_ubicaciones || 'N/A'}`);
        writeToLog(`   Coincide hash: ${esMismoHash}`);
        writeToLog(`   Es reciente: ${esReciente}`);
        writeToLog(`   Estado P22: ${estadoP22.completado ? 'completado' : 'incompleto'}`);
        
        return esMismoHash && esReciente && estadoP22.completado;
        
    } catch (err) {
        writeToLog(`Error verificando estado P22: ${err.message}`);
        return false;
    }
}

// FUNCIÓN PARA FINALIZACIÓN CON VERIFICACIÓN
async function finalizarP24ConVerificacion(db, ubicacionesAProcesar) {
    try {
        writeToLog(`\nVERIFICACIÓN FINAL DE P24...`);
        
        // ACTUALIZAR ESTADO A COMPLETADO
        await db.collection('estado_procesamiento_p24').updateOne(
            { _id: 'procesamiento_en_curso' },
            {
                $set: {
                    estado: 'COMPLETADO',
                    fecha_finalizacion: new Date(),
                    ubicaciones_finalizadas: ubicacionesAProcesar
                }
            }
        );
        
        // ESPERAR UN MOMENTO PARA P22
        writeToLog(`Esperando 3 segundos para coordinación con P22...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // VERIFICAR SI P22 YA PROCESÓ ESTAS UBICACIONES
        const p22Completado = await verificarP22CompletadoParaUbicaciones(db, ubicacionesAProcesar);
        
        if (p22Completado) {
            writeToLog(`P22 YA PROCESÓ ESTAS UBICACIONES - PROCESO COMPLETAMENTE TERMINADO`);
            
            // LIMPIAR SEÑALES Y LOCKS
            await db.collection('p22_signals').deleteOne({ _id: 'incremental_ready' });
            await db.collection('p22_execution_lock').deleteOne({ _id: 'p22_incremental_lock' });
            await db.collection('p22_integration_metadata').deleteOne({ _id: 'incremental_ready' });
            
            writeToLog(`Señales, locks y metadata limpiados`);
            writeToLog(`PROCESO INCREMENTAL 100% COMPLETADO`);
            
        } else {
            writeToLog(`P22 AÚN DEBE PROCESAR ESTAS UBICACIONES`);
            writeToLog(`   P24 terminó correctamente - ubicaciones listas para P22`);
            writeToLog(`   Señales y metadata preservados para P22`);
            
            // PROGRAMAR LIMPIEZA AUTOMÁTICA EN CASO DE QUE P22 NO SE EJECUTE
            setTimeout(async () => {
                try {
                    const client = await MongoClient.connect(mongoUri);
                    const dbLimpieza = client.db(dbName);
                    
                    const p22EjecutadoDespues = await verificarP22CompletadoParaUbicaciones(dbLimpieza, ubicacionesAProcesar);
                    
                    if (!p22EjecutadoDespues) {
                        writeToLog(`LIMPIEZA AUTOMÁTICA: P22 no se ejecutó en 20 minutos`);
                        await dbLimpieza.collection('p22_signals').deleteOne({ _id: 'incremental_ready' });
                        await dbLimpieza.collection('p22_execution_lock').deleteOne({ _id: 'p22_incremental_lock' });
                        await dbLimpieza.collection('p22_integration_metadata').deleteOne({ _id: 'incremental_ready' });
                        writeToLog(`Señales expiradas limpiadas automáticamente`);
                    }
                    
                    await client.close();
                } catch (err) {
                    writeToLog(`Error en limpieza automática: ${err.message}`);
                }
            }, 20 * 60 * 1000); // 20 minutos
        }
        
    } catch (err) {
        writeToLog(`Error en verificación final: ${err.message}`);
    }
}

function writeToLog(message) {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    const logMessage = `[${timestamp}] P24: ${message}`;
    
    try {
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

// EJECUTAR SOLO SI ES EL ARCHIVO PRINCIPAL
if (require.main === module) {
    procesaCambiosIncrementales()
        .then(() => {
            writeToLog('P24 completado exitosamente');
            process.exit(0);
        })
        .catch((err) => {
            writeToLog(`P24 falló: ${err.message}`);
            console.error(err);
            process.exit(1);
        });
}