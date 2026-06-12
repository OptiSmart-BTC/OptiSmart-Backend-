// P23_Identifica_Cambios_Ubicaciones_Semanal.js - VERSIÓN SEMANAL PARA RECARGAS BASADA EN UBIS_SAVED
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const { host, puerto } = require('../Configuraciones/ConexionDB');

// VALIDAR ARGUMENTOS
if (process.argv.length < 5) {
  console.error("Uso: node P23_Identifica_Cambios_Ubicaciones_Semanal.js <dbName> <DBUser> <DBPassword>");
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

// SUFIJO PARA COLECCIONES SEMANALES
const SUFIJO_SEMANAL = '_sem';

async function identificarCambiosSemanales() {
    console.log('INICIANDO P23 SEMANAL - Identificación de Cambios Semanales basada en ubis_saved');
    writeToLog(`P23 SEMANAL - Identificación de Cambios Semanales basada en ubis_saved`);
    
    let client;
    try {
        client = await MongoClient.connect(mongoUri, { 
            useNewUrlParser: true, 
            useUnifiedTopology: true 
        });
        
        const db = client.db(dbName);
        
        // PASO 1: OBTENER UBICACIONES ACTUALES
        const ubicacionesActuales = await obtenerUbicacionesActuales(db);
        
        writeToLog(`Ubicaciones en SKU actual: ${ubicacionesActuales.length}`);
        
        // PASO 2: DETECTAR CAMBIOS BASADO EN UBIS_SAVED
        const cambiosDetectados = await detectarTiposDeCambios(db, ubicacionesActuales);
        
        // PASO 3: CREAR TABLA DE CAMBIOS SEMANAL
        await crearTablaCambiosSemanal(db, cambiosDetectados);
        
        // PASO 4: ACTUALIZAR REGISTRO DE ÚLTIMA EJECUCIÓN SEMANAL
        await actualizarUbicacionesGuardadasSemanal(db, ubicacionesActuales);
        
        // PASO 5: MOSTRAR ESTADÍSTICAS SEMANALES
        await mostrarEstadisticasSemanales(db);
        
        writeToLog(`P23 SEMANAL COMPLETADO - Total cambios detectados: ${cambiosDetectados.length}`);
        console.log(`P23 SEMANAL completado - ${cambiosDetectados.length} cambios detectados`);
        
    } catch (err) {
        writeToLog(`ERROR en P23 SEMANAL: ${err.message}`);
        console.error('ERROR en P23 SEMANAL:', err);
        throw err;
    } finally {
        if (client) {
            await client.close();
        }
    }
}

async function obtenerUbicacionesActuales(db) {
    const skuCollection = db.collection('sku');
    const ubicaciones = await skuCollection.distinct('Ubicacion', {
        $or: [
            { Ignorar: { $exists: false } },
            { Ignorar: 0 },
            { Ignorar: "0" },
            { Ignorar: false }
        ]
    });
    
    writeToLog(`Ubicaciones válidas encontradas en SKU: [${ubicaciones.join(', ')}]`);
    return ubicaciones.sort();
}

async function detectarTiposDeCambios(db, ubicacionesActuales) {
    const cambios = [];
    
    // CONSULTAR UBIS_SAVED PARA DETERMINAR TIPO DE CAMBIO
    const ubicacionesEnUbisSaved = await obtenerUbicacionesDeUbisSaved(db);
    const setUbisSaved = new Set(ubicacionesEnUbisSaved);
    
    // CONSULTAR CAMBIOS DIARIOS RECIENTES PARA OPTIMIZAR DETECCIÓN
    const cambiosRecientesDiarios = await obtenerCambiosRecientesDiarios(db);
    const ubicacionesConCambiosDiarios = new Set(cambiosRecientesDiarios);
    
    writeToLog(`\nANALISIS DE UBICACIONES SEMANALES`);
    writeToLog(`Ubicaciones actuales en SKU: [${ubicacionesActuales.join(', ')}]`);
    writeToLog(`Ubicaciones en historial ubis_saved: [${ubicacionesEnUbisSaved.join(', ')}]`);
    writeToLog(`Ubicaciones con cambios diarios recientes: [${Array.from(ubicacionesConCambiosDiarios).join(', ')}]`);
    
    // PROCESAR CADA UBICACIÓN ACTUAL
    for (const ubicacion of ubicacionesActuales) {
        if (setUbisSaved.has(ubicacion)) {
            // UBICACIÓN YA EXISTE EN UBIS_SAVED = RECARGA SEMANAL
            const detallesRecarga = await analizarRecargaSemanalUbicacion(db, ubicacion, ubicacionesConCambiosDiarios.has(ubicacion));
            
            cambios.push({
                ubicacion: ubicacion,
                tipo_cambio: 'RECARGA_SEMANAL',
                fecha_cambio: new Date(),
                descripcion: 'Ubicación recargada semanalmente (ya existía previamente)',
                razon_recarga: detallesRecarga.razon,
                detalles_recarga: detallesRecarga.detalles,
                tuvo_cambios_diarios: ubicacionesConCambiosDiarios.has(ubicacion),
                requiere_limpieza_completa_sem: true,
                procesado: false,
                periodo: 'SEMANAL'
            });
            
            writeToLog(`   RECARGA_SEMANAL: ${ubicacion} - ${detallesRecarga.razon}`);
            writeToLog(`      ${detallesRecarga.detalles}`);
            if (ubicacionesConCambiosDiarios.has(ubicacion)) {
                writeToLog(`        Ubicación con actividad diaria reciente`);
            }
            
        } else {
            // UBICACIÓN NO EXISTE EN UBIS_SAVED = NUEVA SEMANAL
            cambios.push({
                ubicacion: ubicacion,
                tipo_cambio: 'NUEVA_SEMANAL',
                fecha_cambio: new Date(),
                descripcion: 'Ubicación nueva detectada en proceso semanal',
                es_primera_vez: true,
                procesado: false,
                periodo: 'SEMANAL'
            });
            
            writeToLog(`   NUEVA_SEMANAL: ${ubicacion} - Primera vez detectada en proceso semanal`);
        }
    }
    
    // UBICACIONES QUE YA NO ESTÁN EN LOS DATOS ACTUALES
    const ubicacionesInactivas = ubicacionesEnUbisSaved.filter(u => !ubicacionesActuales.includes(u));
    
    if (ubicacionesInactivas.length > 0) {
        writeToLog(`\n   Ubicaciones INACTIVAS en proceso semanal: [${ubicacionesInactivas.join(', ')}]`);
        writeToLog(`   Estas permanecerán en ubis_saved como inactivas`);
    }
    
    // LOG DE RESUMEN
    const ubicacionesNuevas = cambios.filter(c => c.tipo_cambio === 'NUEVA_SEMANAL');
    const ubicacionesRecargadas = cambios.filter(c => c.tipo_cambio === 'RECARGA_SEMANAL');
    const conActividadDiaria = cambios.filter(c => c.tuvo_cambios_diarios);
    
    writeToLog(`\nRESUMEN DE CAMBIOS SEMANALES DETECTADOS`);
    writeToLog(`Ubicaciones NUEVAS SEMANALES: ${ubicacionesNuevas.length} [${ubicacionesNuevas.map(c => c.ubicacion).join(', ')}]`);
    writeToLog(`Ubicaciones RECARGADAS SEMANALES: ${ubicacionesRecargadas.length} [${ubicacionesRecargadas.map(c => c.ubicacion).join(', ')}]`);
    writeToLog(`Ubicaciones con actividad diaria reciente: ${conActividadDiaria.length} [${conActividadDiaria.map(c => c.ubicacion).join(', ')}]`);
    writeToLog(`Total cambios semanales para procesar: ${cambios.length}`);
    
    if (cambios.length === 0) {
        writeToLog(`\n   No se detectaron ubicaciones para procesar semanalmente`);
        cambios.push({
            ubicacion: 'NINGUNA',
            tipo_cambio: 'NO_CAMBIOS_SEMANAL',
            fecha_cambio: new Date(),
            descripcion: 'No hay ubicaciones nuevas ni recargas semanales detectadas',
            procesado: false,
            periodo: 'SEMANAL'
        });
    }
    
    return cambios;
}

async function obtenerUbicacionesDeUbisSaved(db) {
    try {
        const ubisSavedCollection = db.collection('ubis_saved');
        
        // Verificar si existe la colección
        const collections = await db.listCollections({ name: 'ubis_saved' }).toArray();
        if (collections.length === 0) {
            writeToLog(`   Colección 'ubis_saved' no existe - todas las ubicaciones serán NUEVAS_SEMANAL`);
            return [];
        }
        
        // Obtener TODAS las ubicaciones (activas e inactivas) que alguna vez se cargaron
        const ubicaciones = await ubisSavedCollection.distinct('Ubicacion');
        
        writeToLog(`   Ubicaciones encontradas en ubis_saved: ${ubicaciones.length}`);
        return ubicaciones.sort();
        
    } catch (err) {
        writeToLog(`   Error consultando ubis_saved: ${err.message}`);
        return [];
    }
}

async function obtenerCambiosRecientesDiarios(db) {
    try {
        const cambiosCollection = db.collection('cambios_ubicaciones_temp');
        
        // Verificar si existe la colección
        const collections = await db.listCollections({ name: 'cambios_ubicaciones_temp' }).toArray();
        if (collections.length === 0) {
            writeToLog(`   Colección 'cambios_ubicaciones_temp' no existe - no hay cambios diarios recientes`);
            return [];
        }
        
        // Obtener cambios de los últimos 7 días
        const fechaLimite = new Date();
        fechaLimite.setDate(fechaLimite.getDate() - 7);
        
        const cambiosRecientes = await cambiosCollection.distinct('ubicacion', {
            fecha_cambio: { $gte: fechaLimite },
            tipo_cambio: { $in: ['NUEVA', 'RECARGA', 'ACTUALIZADA', 'DATOS_NUEVOS'] }
        });
        
        writeToLog(`   Ubicaciones con cambios diarios recientes (últimos 7 días): ${cambiosRecientes.length}`);
        return cambiosRecientes.sort();
        
    } catch (err) {
        writeToLog(`   Error consultando cambios diarios recientes: ${err.message}`);
        return [];
    }
}

async function analizarRecargaSemanalUbicacion(db, ubicacion, tuvoCambiosDiarios) {
    try {
        const ubisSavedCollection = db.collection('ubis_saved');
        const skuCollection = db.collection('sku');
        
        // Obtener información histórica de la ubicación
        const ubicacionHistorica = await ubisSavedCollection.findOne({ Ubicacion: ubicacion });
        
        if (!ubicacionHistorica) {
            return {
                razon: 'Recarga semanal detectada',
                detalles: 'Ubicación encontrada en datos actuales para proceso semanal'
            };
        }
        
        // Contar SKUs actuales
        const skusActuales = await skuCollection.countDocuments({ 
            Ubicacion: ubicacion,
            $or: [
                { Ignorar: { $exists: false } },
                { Ignorar: 0 },
                { Ignorar: "0" },
                { Ignorar: false }
            ]
        });
        
        const registrosAnteriores = ubicacionHistorica.total_registros || 0;
        const estabaActiva = ubicacionHistorica.activa || false;
        const fechaUltimaCarga = ubicacionHistorica.ultima_carga_datos || ubicacionHistorica.fecha_creacion;
        
        // Calcular tiempo transcurrido
        const tiempoTranscurrido = fechaUltimaCarga ? 
            Math.round((new Date() - new Date(fechaUltimaCarga)) / (1000 * 60)) : 0; // minutos
        
        // Determinar tipo de recarga semanal
        let razon = 'Recarga semanal de ubicación existente';
        let detalles = '';
        
        if (tuvoCambiosDiarios) {
            razon = 'Recarga semanal con actividad diaria reciente';
            const diferencia = skusActuales - registrosAnteriores;
            const signo = diferencia > 0 ? '+' : '';
            detalles = `${skusActuales} SKUs actuales (${signo}${diferencia} vs histórico), con cambios diarios recientes`;
        } else if (!estabaActiva) {
            razon = 'Reactivación semanal de ubicación inactiva';
            detalles = `Ubicación estaba inactiva, ahora tiene ${skusActuales} SKUs para proceso semanal`;
        } else if (Math.abs(skusActuales - registrosAnteriores) > 0) {
            razon = 'Recarga semanal con cambios en datos';
            const diferencia = skusActuales - registrosAnteriores;
            const signo = diferencia > 0 ? '+' : '';
            detalles = `Registros: ${registrosAnteriores} → ${skusActuales} (${signo}${diferencia}) para cálculos semanales`;
        } else {
            razon = 'Recarga semanal rutinaria';
            detalles = `${skusActuales} SKUs, procesamiento semanal programado (última carga hace ${Math.round(tiempoTranscurrido/60)} horas)`;
        }
        
        return { razon, detalles };
        
    } catch (err) {
        return {
            razon: 'Error analizando recarga semanal',
            detalles: `Error: ${err.message}`
        };
    }
}

async function crearTablaCambiosSemanal(db, cambios) {
    const cambiosCollectionSemanal = db.collection(`cambios_ubicaciones_temp${SUFIJO_SEMANAL}`);
    
    // Limpiar tabla anterior semanal
    await cambiosCollectionSemanal.deleteMany({});
    writeToLog(`Tabla cambios_ubicaciones_temp${SUFIJO_SEMANAL} limpiada`);
    
    if (cambios.length === 0) {
        // Insertar registro de "no hay cambios"
        await cambiosCollectionSemanal.insertOne({
            tipo_cambio: 'NO_CAMBIOS_SEMANAL',
            fecha_cambio: new Date(),
            descripcion: 'No se detectaron cambios semanales en las ubicaciones',
            procesado: false,
            periodo: 'SEMANAL'
        });
        writeToLog(`No hay cambios semanales - registro NO_CAMBIOS_SEMANAL insertado`);
        return;
    }
    
    // Insertar cambios detectados
    await cambiosCollectionSemanal.insertMany(cambios.map(cambio => ({
        ...cambio,
        procesado: false,
        fecha_deteccion: new Date(),
        id_sesion: `P23_SEMANAL_${moment().format('YYYYMMDD_HHmmss')}`,
        periodo: 'SEMANAL'
    })));
    
    writeToLog(`Tabla cambios_ubicaciones_temp${SUFIJO_SEMANAL} creada con ${cambios.length} registros`);
    
    // Log detallado de cada tipo de cambio
    const tiposCambios = {};
    cambios.forEach(cambio => {
        if (!tiposCambios[cambio.tipo_cambio]) {
            tiposCambios[cambio.tipo_cambio] = 0;
        }
        tiposCambios[cambio.tipo_cambio]++;
    });
    
    writeToLog(`Resumen por tipo de cambio semanal:`);
    Object.entries(tiposCambios).forEach(([tipo, cantidad]) => {
        writeToLog(`   ${tipo}: ${cantidad}`);
    });
}

async function actualizarUbicacionesGuardadasSemanal(db, ubicacionesActuales) {
    const ubicacionesCollection = db.collection(`ubicaciones_guardadas${SUFIJO_SEMANAL}`);
    
    // Guardar información de la ejecución semanal
    const documento = {
        _id: 'ultima_ejecucion_semanal',
        ubicaciones: ubicacionesActuales.sort(),
        fecha_actualizacion: new Date(),
        total_ubicaciones: ubicacionesActuales.length,
        version_script: 'P23_SEMANAL_v1.0_recarga_por_ubis_saved',
        nota: 'Las ubicaciones semanales se clasifican como NUEVA_SEMANAL o RECARGA_SEMANAL basándose en ubis_saved',
        periodo_ejecucion: 'SEMANAL',
        semana_iso: moment().isoWeek(),
        año: moment().year()
    };
    
    await ubicacionesCollection.replaceOne(
        { _id: 'ultima_ejecucion_semanal' },
        documento,
        { upsert: true }
    );
    
    writeToLog(`\nACTUALIZACIÓN DE REGISTRO SEMANAL`);
    writeToLog(`Ubicaciones de esta ejecución semanal guardadas: ${ubicacionesActuales.length}`);
    writeToLog(`Lista actual semanal: [${ubicacionesActuales.join(', ')}]`);
    writeToLog(`Semana ISO: ${momento().isoWeek()}/${moment().year()}`);
    writeToLog(`Nota: El historial completo se mantiene en 'ubis_saved'`);
}

async function mostrarEstadisticasSemanales(db) {
    try {
        writeToLog(`\n=== ESTADÍSTICAS SEMANALES ===`);
        
        // Contar ubicaciones en tabla de cambios semanal
        const cambiosCollection = db.collection(`cambios_ubicaciones_temp${SUFIJO_SEMANAL}`);
        const totalCambiosSemanales = await cambiosCollection.countDocuments();
        const nuevasSemanales = await cambiosCollection.countDocuments({ tipo_cambio: 'NUEVA_SEMANAL' });
        const recargasSemanales = await cambiosCollection.countDocuments({ tipo_cambio: 'RECARGA_SEMANAL' });
        const conActividadDiaria = await cambiosCollection.countDocuments({ tuvo_cambios_diarios: true });
        
        writeToLog(`Total registros en cambios semanales: ${totalCambiosSemanales}`);
        writeToLog(`  - Ubicaciones nuevas semanales: ${nuevasSemanales}`);
        writeToLog(`  - Ubicaciones recargadas semanales: ${recargasSemanales}`);
        writeToLog(`  - Con actividad diaria reciente: ${conActividadDiaria}`);
        
        // Información de ubis_saved
        const ubisSavedCollection = db.collection('ubis_saved');
        const collections = await db.listCollections({ name: 'ubis_saved' }).toArray();
        
        if (collections.length > 0) {
            const totalUbisSaved = await ubisSavedCollection.countDocuments();
            const activas = await ubisSavedCollection.countDocuments({ activa: true });
            const inactivas = totalUbisSaved - activas;
            
            writeToLog(`Estado en ubis_saved:`);
            writeToLog(`  - Total ubicaciones históricas: ${totalUbisSaved}`);
            writeToLog(`  - Ubicaciones activas: ${activas}`);
            writeToLog(`  - Ubicaciones inactivas: ${inactivas}`);
        }
        
        writeToLog(`===========================`);
        
    } catch (err) {
        writeToLog(`Error mostrando estadísticas semanales: ${err.message}`);
    }
}

function writeToLog(message) {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    const logMessage = `[${timestamp}] P23_SEMANAL: ${message}`;
    
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
    identificarCambiosSemanales()
        .then(() => {
            writeToLog('P23 SEMANAL completado exitosamente');
            process.exit(0);
        })
        .catch((err) => {
            writeToLog(`P23 SEMANAL falló: ${err.message}`);
            console.error(err);
            process.exit(1);
        });
}

module.exports = { identificarCambiosSemanales };