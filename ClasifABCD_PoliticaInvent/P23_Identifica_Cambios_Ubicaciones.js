// P23_Identifica_Cambios_Ubicaciones.js - VERSIÓN MODIFICADA PARA RECARGA BASADA EN UBIS_SAVED
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const { host, puerto } = require('../Configuraciones/ConexionDB');

// VALIDAR ARGUMENTOS
if (process.argv.length < 5) {
  console.error("Uso: node P23_script.js <dbName> <DBUser> <DBPassword>");
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
const logFile = `../../${parametroFolder}/log/Incremental_Only.log`;

async function identificarCambiosConRecargas() {
    console.log('INICIANDO P23 - Identificación de Cambios basada en ubis_saved');
    writeToLog(`P23 - Identificación de Cambios basada en ubis_saved`);
    
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
        
        // PASO 3: CREAR TABLA DE CAMBIOS
        await crearTablaCambios(db, cambiosDetectados);
        
        // PASO 4: ACTUALIZAR REGISTRO DE ÚLTIMA EJECUCIÓN
        await actualizarUbicacionesGuardadas(db, ubicacionesActuales);
        
        writeToLog(`P23 COMPLETADO - Total cambios detectados: ${cambiosDetectados.length}`);
        console.log(`P23 completado - ${cambiosDetectados.length} cambios detectados`);
        
    } catch (err) {
        writeToLog(`ERROR en P23: ${err.message}`);
        console.error('ERROR en P23:', err);
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
    
    writeToLog(`\nANALISIS DE UBICACIONES`);
    writeToLog(`Ubicaciones actuales en SKU: [${ubicacionesActuales.join(', ')}]`);
    writeToLog(`Ubicaciones en historial ubis_saved: [${ubicacionesEnUbisSaved.join(', ')}]`);
    
    // PROCESAR CADA UBICACIÓN ACTUAL
    for (const ubicacion of ubicacionesActuales) {
        if (setUbisSaved.has(ubicacion)) {
            // UBICACIÓN YA EXISTE EN UBIS_SAVED = RECARGA
            const detallesRecarga = await analizarRecargaUbicacion(db, ubicacion);
            
            cambios.push({
                ubicacion: ubicacion,
                tipo_cambio: 'RECARGA',
                fecha_cambio: new Date(),
                descripcion: 'Ubicación recargada (ya existía previamente)',
                razon_recarga: detallesRecarga.razon,
                detalles_recarga: detallesRecarga.detalles,
                requiere_limpieza_completa: true,
                procesado: false
            });
            
            writeToLog(`   RECARGA: ${ubicacion} - ${detallesRecarga.razon}`);
            writeToLog(`      ${detallesRecarga.detalles}`);
            
        } else {
            // UBICACIÓN NO EXISTE EN UBIS_SAVED = NUEVA
            cambios.push({
                ubicacion: ubicacion,
                tipo_cambio: 'NUEVA',
                fecha_cambio: new Date(),
                descripcion: 'Ubicación nueva (primera vez detectada)',
                es_primera_vez: true,
                procesado: false
            });
            
            writeToLog(`   NUEVA: ${ubicacion} - Primera vez detectada`);
        }
    }
    
    // UBICACIONES QUE YA NO ESTÁN EN LOS DATOS ACTUALES
    const ubicacionesInactivas = ubicacionesEnUbisSaved.filter(u => !ubicacionesActuales.includes(u));
    
    if (ubicacionesInactivas.length > 0) {
        writeToLog(`\n   Ubicaciones que NO están en datos actuales: [${ubicacionesInactivas.join(', ')}]`);
        writeToLog(`   Estas permanecerán en ubis_saved como inactivas`);
    }
    
    // LOG DE RESUMEN
    const ubicacionesNuevas = cambios.filter(c => c.tipo_cambio === 'NUEVA');
    const ubicacionesRecargadas = cambios.filter(c => c.tipo_cambio === 'RECARGA');
    
    writeToLog(`\nRESUMEN DE CAMBIOS DETECTADOS`);
    writeToLog(`Ubicaciones NUEVAS: ${ubicacionesNuevas.length} [${ubicacionesNuevas.map(c => c.ubicacion).join(', ')}]`);
    writeToLog(`Ubicaciones RECARGADAS: ${ubicacionesRecargadas.length} [${ubicacionesRecargadas.map(c => c.ubicacion).join(', ')}]`);
    writeToLog(`Total cambios para procesar: ${cambios.length}`);
    
    if (cambios.length === 0) {
        writeToLog(`\n   No se detectaron ubicaciones para procesar`);
        cambios.push({
            ubicacion: 'NINGUNA',
            tipo_cambio: 'NO_CAMBIOS',
            fecha_cambio: new Date(),
            descripcion: 'No hay ubicaciones nuevas ni recargas detectadas',
            procesado: false
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
            writeToLog(`   Colección 'ubis_saved' no existe - todas las ubicaciones serán NUEVAS`);
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

async function analizarRecargaUbicacion(db, ubicacion) {
    try {
        const ubisSavedCollection = db.collection('ubis_saved');
        const skuCollection = db.collection('sku');
        
        // Obtener información histórica de la ubicación
        const ubicacionHistorica = await ubisSavedCollection.findOne({ Ubicacion: ubicacion });
        
        if (!ubicacionHistorica) {
            return {
                razon: 'Recarga detectada',
                detalles: 'Ubicación encontrada en datos actuales'
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
        
        // Determinar tipo de recarga
        let razon = 'Recarga de ubicación existente';
        let detalles = '';
        
        if (!estabaActiva) {
            razon = 'Reactivación de ubicación inactiva';
            detalles = `Ubicación estaba inactiva, ahora tiene ${skusActuales} SKUs`;
        } else if (Math.abs(skusActuales - registrosAnteriores) > 0) {
            razon = 'Recarga con cambios en datos';
            const diferencia = skusActuales - registrosAnteriores;
            const signo = diferencia > 0 ? '+' : '';
            detalles = `Registros: ${registrosAnteriores} → ${skusActuales} (${signo}${diferencia})`;
        } else {
            razon = 'Recarga de ubicación activa';
            detalles = `${skusActuales} SKUs, última carga hace ${Math.round(tiempoTranscurrido/60)} horas`;
        }
        
        return { razon, detalles };
        
    } catch (err) {
        return {
            razon: 'Error analizando recarga',
            detalles: `Error: ${err.message}`
        };
    }
}

async function crearTablaCambios(db, cambios) {
    const cambiosCollection = db.collection('cambios_ubicaciones_temp');
    
    // Limpiar tabla anterior
    await cambiosCollection.deleteMany({});
    writeToLog(`Tabla cambios_ubicaciones_temp limpiada`);
    
    if (cambios.length === 0) {
        // Insertar registro de "no hay cambios"
        await cambiosCollection.insertOne({
            tipo_cambio: 'NO_CAMBIOS',
            fecha_cambio: new Date(),
            descripcion: 'No se detectaron cambios en las ubicaciones',
            procesado: false
        });
        writeToLog(`No hay cambios - registro NO_CAMBIOS insertado`);
        return;
    }
    
    // Insertar cambios detectados
    await cambiosCollection.insertMany(cambios.map(cambio => ({
        ...cambio,
        procesado: false,
        fecha_deteccion: new Date(),
        id_sesion: `P23_${moment().format('YYYYMMDD_HHmmss')}`
    })));
    
    writeToLog(`Tabla cambios_ubicaciones_temp creada con ${cambios.length} registros`);
    
    // Log detallado de cada tipo de cambio
    const tiposCambios = {};
    cambios.forEach(cambio => {
        if (!tiposCambios[cambio.tipo_cambio]) {
            tiposCambios[cambio.tipo_cambio] = 0;
        }
        tiposCambios[cambio.tipo_cambio]++;
    });
    
    writeToLog(`Resumen por tipo de cambio:`);
    Object.entries(tiposCambios).forEach(([tipo, cantidad]) => {
        writeToLog(`   ${tipo}: ${cantidad}`);
    });
}

async function actualizarUbicacionesGuardadas(db, ubicacionesActuales) {
    const ubicacionesCollection = db.collection('ubicaciones_guardadas');
    
    // Simplificar: solo guardar la última ejecución (ubis_saved maneja el historial)
    const documento = {
        _id: 'ultima_ejecucion',
        ubicaciones: ubicacionesActuales.sort(),
        fecha_actualizacion: new Date(),
        total_ubicaciones: ubicacionesActuales.length,
        version_script: 'P23_v3.0_recarga_por_ubis_saved',
        nota: 'Las ubicaciones se clasifican como NUEVA o RECARGA basándose en ubis_saved'
    };
    
    await ubicacionesCollection.replaceOne(
        { _id: 'ultima_ejecucion' },
        documento,
        { upsert: true }
    );
    
    writeToLog(`\nACTUALIZACIÓN DE REGISTRO`);
    writeToLog(`Ubicaciones de esta ejecución guardadas: ${ubicacionesActuales.length}`);
    writeToLog(`Lista actual: [${ubicacionesActuales.join(', ')}]`);
    writeToLog(`Nota: El historial completo se mantiene en 'ubis_saved'`);
}

function writeToLog(message) {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    const logMessage = `[${timestamp}] P23: ${message}`;
    
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
    identificarCambiosConRecargas()
        .then(() => {
            writeToLog('P23 completado exitosamente');
            process.exit(0);
        })
        .catch((err) => {
            writeToLog(`P23 falló: ${err.message}`);
            console.error(err);
            process.exit(1);
        });
}