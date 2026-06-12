const fs = require('fs');
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

async function diagnosticarEstado() {
    console.log('🔍 DIAGNÓSTICO DEL ESTADO ACTUAL');
    writeToLog(`\n=== DIAGNÓSTICO DEL ESTADO ACTUAL ===`);
    
    let client;
    try {
        client = await MongoClient.connect(mongoUri);
        const db = client.db(dbName);
        
        const demandaCollection = db.collection('demanda_abcd_01');
        const politicaCollection = db.collection('politica_inventarios_01');
        const ubisCollection = db.collection('ubis_saved');
        const cambiosCollection = db.collection('cambios_ubicaciones_temp');

        // 1. VERIFICAR UBICACIONES EN ubis_saved
        console.log('\n📍 UBICACIONES EN ubis_saved:');
        writeToLog(`\n1. VERIFICANDO ubis_saved:`);
        
        const todasUbicaciones = await ubisCollection.find({}).toArray();
        const ubicacionesActivas = todasUbicaciones.filter(u => u.activa === true);
        const ubicacionesInactivas = todasUbicaciones.filter(u => u.activa === false);
        
        console.log(`   Total ubicaciones: ${todasUbicaciones.length}`);
        console.log(`   Activas: ${ubicacionesActivas.length}`);
        console.log(`   Inactivas: ${ubicacionesInactivas.length}`);
        
        writeToLog(`   Total ubicaciones: ${todasUbicaciones.length}`);
        writeToLog(`   Activas: ${ubicacionesActivas.length} - [${ubicacionesActivas.map(u => u.Ubicacion).join(', ')}]`);
        writeToLog(`   Inactivas: ${ubicacionesInactivas.length} - [${ubicacionesInactivas.map(u => u.Ubicacion).join(', ')}]`);
        
        // Mostrar detalles de cada ubicación
        todasUbicaciones.forEach(ubi => {
            console.log(`     ${ubi.Ubicacion}: ${ubi.activa ? '✅ ACTIVA' : '❌ INACTIVA'} - ${ubi.Desc_Ubicacion || 'Sin descripción'}`);
        });

        // 2. VERIFICAR UBICACIONES CON POLÍTICAS
        console.log('\n📋 UBICACIONES CON POLÍTICAS:');
        writeToLog(`\n2. VERIFICANDO politica_inventarios_01:`);
        
        const totalPoliticas = await politicaCollection.countDocuments();
        const ubicacionesConPoliticas = await politicaCollection.distinct('Ubicacion');
        
        console.log(`   Total registros en políticas: ${totalPoliticas}`);
        console.log(`   Ubicaciones con políticas: ${ubicacionesConPoliticas.length}`);
        
        writeToLog(`   Total registros: ${totalPoliticas}`);
        writeToLog(`   Ubicaciones con políticas: ${ubicacionesConPoliticas.length} - [${ubicacionesConPoliticas.sort().join(', ')}]`);
        
        ubicacionesConPoliticas.forEach(ubi => {
            console.log(`     ${ubi}: tiene políticas`);
        });

        // 3. VERIFICAR UBICACIONES EN DEMANDA
        console.log('\n📊 UBICACIONES EN DEMANDA:');
        writeToLog(`\n3. VERIFICANDO demanda_abcd_01:`);
        
        const totalDemanda = await demandaCollection.countDocuments();
        const ubicacionesEnDemanda = await demandaCollection.distinct('Ubicacion');
        
        console.log(`   Total registros en demanda: ${totalDemanda}`);
        console.log(`   Ubicaciones en demanda: ${ubicacionesEnDemanda.length}`);
        
        writeToLog(`   Total registros: ${totalDemanda}`);
        writeToLog(`   Ubicaciones en demanda: ${ubicacionesEnDemanda.length} - [${ubicacionesEnDemanda.sort().join(', ')}]`);

        // 4. ANÁLISIS DE DISCREPANCIAS
        console.log('\n🔍 ANÁLISIS DE DISCREPANCIAS:');
        writeToLog(`\n4. ANÁLISIS DE DISCREPANCIAS:`);
        
        const ubicacionesActivasSet = new Set(ubicacionesActivas.map(u => u.Ubicacion));
        const ubicacionesConPoliticasSet = new Set(ubicacionesConPoliticas);
        const ubicacionesEnDemandaSet = new Set(ubicacionesEnDemanda);
        
        // Ubicaciones activas SIN políticas (deberían procesarse)
        const ubicacionesSinPoliticas = [...ubicacionesActivasSet].filter(u => !ubicacionesConPoliticasSet.has(u));
        console.log(`\n   🆕 Ubicaciones ACTIVAS SIN políticas (deberían ser NUEVAS): ${ubicacionesSinPoliticas.length}`);
        ubicacionesSinPoliticas.forEach(ubi => {
            const tienedemanda = ubicacionesEnDemandaSet.has(ubi) ? '✅ Con demanda' : '❌ Sin demanda';
            console.log(`      ${ubi} - ${tienedemanda}`);
        });
        writeToLog(`   Ubicaciones activas SIN políticas: ${ubicacionesSinPoliticas.length} - [${ubicacionesSinPoliticas.join(', ')}]`);
        
        // Ubicaciones con políticas pero NO activas (podrían eliminarse)
        const ubicacionesConPoliticasInactivas = [...ubicacionesConPoliticasSet].filter(u => !ubicacionesActivasSet.has(u));
        console.log(`\n   🗑️  Ubicaciones CON políticas pero NO activas: ${ubicacionesConPoliticasInactivas.length}`);
        ubicacionesConPoliticasInactivas.forEach(ubi => {
            console.log(`      ${ubi} - debería eliminarse si está inactiva`);
        });
        writeToLog(`   Ubicaciones con políticas pero inactivas: ${ubicacionesConPoliticasInactivas.length} - [${ubicacionesConPoliticasInactivas.join(', ')}]`);

        // 5. VERIFICAR TABLA DE CAMBIOS ACTUAL
        console.log('\n📝 VERIFICAR cambios_ubicaciones_temp:');
        writeToLog(`\n5. VERIFICANDO cambios_ubicaciones_temp:`);
        
        const cambiosExistentes = await cambiosCollection.find({}).toArray();
        console.log(`   Cambios en tabla temporal: ${cambiosExistentes.length}`);
        
        if (cambiosExistentes.length > 0) {
            cambiosExistentes.forEach((cambio, index) => {
                console.log(`      ${index + 1}. ${cambio.ubicacion} - ${cambio.tipo_cambio} - ${cambio.fecha_identificacion}`);
                writeToLog(`      ${cambio.ubicacion} - ${cambio.tipo_cambio} - ${cambio.descripcion}`);
            });
        } else {
            console.log('      ❌ NO HAY CAMBIOS REGISTRADOS');
            writeToLog('      NO HAY CAMBIOS REGISTRADOS - aquí está el problema');
        }

        // 6. SIMULAR LO QUE DEBERÍA HACER P23
        console.log('\n🧮 SIMULACIÓN DE LÓGICA P23:');
        writeToLog(`\n6. SIMULACIÓN DE LÓGICA P23:`);
        
        console.log(`   Ubicaciones activas: ${ubicacionesActivasSet.size}`);
        console.log(`   Ubicaciones con políticas: ${ubicacionesConPoliticasSet.size}`);
        console.log(`   Diferencia (nuevas): ${ubicacionesSinPoliticas.length}`);
        
        if (ubicacionesSinPoliticas.length > 0) {
            console.log(`   ✅ DEBERÍAN IDENTIFICARSE ${ubicacionesSinPoliticas.length} UBICACIONES NUEVAS`);
            writeToLog(`   RESULTADO ESPERADO: ${ubicacionesSinPoliticas.length} ubicaciones nuevas`);
            
            // Crear los cambios que P23 debería haber creado
            console.log(`\n🔧 CREANDO CAMBIOS FALTANTES...`);
            const cambiosFaltantes = ubicacionesSinPoliticas.map(ubicacion => ({
                ubicacion: ubicacion,
                tipo_cambio: 'NUEVA',
                fecha_identificacion: now,
                descripcion: 'Ubicación nueva activa en ubis_saved sin políticas existentes (creado por diagnóstico)'
            }));
            
            await cambiosCollection.deleteMany({}); // Limpiar primero
            const insertResult = await cambiosCollection.insertMany(cambiosFaltantes);
            
            console.log(`   ✅ Insertados ${insertResult.insertedCount} cambios faltantes`);
            writeToLog(`   Insertados ${insertResult.insertedCount} cambios en cambios_ubicaciones_temp`);
            
            console.log(`\n🚀 AHORA PUEDES EJECUTAR P24 NUEVAMENTE`);
        } else {
            console.log(`   ✅ No hay ubicaciones nuevas que procesar`);
            writeToLog(`   No hay ubicaciones nuevas que procesar`);
        }

        // 7. RESUMEN FINAL
        console.log('\n📊 RESUMEN:');
        writeToLog(`\n7. RESUMEN:`);
        console.log(`   📍 Ubicaciones activas en ubis_saved: ${ubicacionesActivas.length}`);
        console.log(`   📋 Ubicaciones con políticas: ${ubicacionesConPoliticas.length}`);
        console.log(`   📊 Ubicaciones en demanda: ${ubicacionesEnDemanda.length}`);
        console.log(`   🆕 Ubicaciones nuevas a procesar: ${ubicacionesSinPoliticas.length}`);
        console.log(`   🗑️  Ubicaciones a eliminar: ${ubicacionesConPoliticasInactivas.length}`);
        
        writeToLog(`RESUMEN FINAL:`);
        writeToLog(`   Ubicaciones activas: ${ubicacionesActivas.length}`);
        writeToLog(`   Ubicaciones con políticas: ${ubicacionesConPoliticas.length}`);
        writeToLog(`   Nuevas a procesar: ${ubicacionesSinPoliticas.length}`);
        writeToLog(`   A eliminar: ${ubicacionesConPoliticasInactivas.length}`);

    } catch (err) {
        console.error('❌ Error en diagnóstico:', err.message);
        writeToLog(`Error en diagnóstico: ${err.message}`);
    } finally {
        if (client) {
            await client.close();
        }
    }
}

function writeToLog(message) {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    const logMessage = `[${timestamp}] ${message}`;
    
    // Escribir al archivo de log
    fs.appendFileSync(logFile, logMessage + '\n');
    
    // También mostrar en consola para depuración inmediata
    console.log(logMessage);
}

// Ejecutar diagnóstico
diagnosticarEstado().catch(console.error);