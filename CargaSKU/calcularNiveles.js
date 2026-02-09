const fs = require('fs');
const csvWriter = require('csv-writer').createObjectCsvWriter;
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const dbName = process.argv[2];
const parametroFolder = process.argv[3];
const AppUser = process.argv[4];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/dbvars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`;
const outputCsvPath = `../../${parametroFolder}/csv/out/sku_con_niveles.csv`;
const debugLogFile = `../../${parametroFolder}/log/Debug_Niveles_OA.log`;

function writeToLog(message) {
  fs.appendFileSync(logFile, `${message}\n`);
}

function writeToDebugLog(message) {
  fs.appendFileSync(debugLogFile, `${message}\n`);
}

async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}

async function calculateLevels() {
  writeToLog(`\nPaso 07 - Cálculo de Niveles OA (con corrección de autoabastecidos)`);
  
  if (fs.existsSync(debugLogFile)) {
    fs.unlinkSync(debugLogFile);
  }
  
  writeToDebugLog(`=== DEBUG NIVELES OA - ${now} ===\n`);
  
  try {
    const passadminDeCripta = await getDecryptedPassadmin();
    const mongoUri = conex.getUrl(DBUser, passadminDeCripta, host, puerto, dbName);

    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = client.db();
    const skuCollection = db.collection('sku');

    // 1. Leer todos los documentos
    const skus = await skuCollection.find({}).toArray();
    writeToLog(`\tTotal SKUs en colección: ${skus.length}`);
    writeToDebugLog(` Total SKUs en colección: ${skus.length}\n`);

    // Verificar formato de SKUs
    writeToDebugLog(`--- VERIFICACIÓN DE FORMATO DE SKUs ---`);
    const skusSinCampo = skus.filter(s => !s.SKU);
    const skusSinFormato = skus.filter(s => s.SKU && !s.SKU.includes('@'));
    
    writeToDebugLog(`SKUs sin campo SKU: ${skusSinCampo.length}`);
    writeToDebugLog(`SKUs sin formato @: ${skusSinFormato.length}`);
    
    if (skusSinCampo.length > 0) {
      writeToDebugLog(`\n  Documentos sin campo SKU (primeros 10):`);
      skusSinCampo.slice(0, 10).forEach(s => {
        writeToDebugLog(`   Producto: ${s.Producto}, Ubicacion: ${s.Ubicacion}`);
      });
    }

    // 2. Normalizar y limpiar valores inválidos de Origen_Abasto
    const valoresInvalidos = ['Default Value', 'default', 'N/A', 'null', '', 'undefined'];
    let skusLimpiados = 0;
    
    skus.forEach(doc => {
      // Asegurar que el SKU tenga el formato correcto
      if (!doc.SKU || !doc.SKU.includes('@')) {
        const producto = String(doc.Producto || '').padStart(5, '0');
        const ubicacion = String(doc.Ubicacion || '').padStart(4, '0');
        doc.SKU = `${producto}@${ubicacion}`;
      }
      
      // Limpiar Origen_Abasto inválido
      if (!doc.Origen_Abasto || 
          valoresInvalidos.includes(String(doc.Origen_Abasto).trim())) {
        if (doc.Origen_Abasto) skusLimpiados++;
        doc.Origen_Abasto = null;
      }
    });
    
    writeToLog(`\tValores inválidos de Origen_Abasto limpiados: ${skusLimpiados}`);
    writeToDebugLog(`\nValores inválidos de Origen_Abasto limpiados: ${skusLimpiados}`);

    // 3. Detectar ubicaciones que se autoabastecen
    const autoabastecidos = skus.filter(doc => 
      doc.Origen_Abasto && doc.Ubicacion === doc.Origen_Abasto
    );
    
    writeToDebugLog(`\n--- AUTOABASTECIMIENTOS DETECTADOS ---`);
    writeToDebugLog(`Total ubicaciones autoabastecidas: ${autoabastecidos.length}`);
    
    const origenes = skus.map(doc => doc.Origen_Abasto).filter(Boolean);
    const setOrigenes = new Set(origenes);

    let corregidos = 0;
    const ubicacionesCorregidas = new Set();
    
    for (const doc of autoabastecidos) {
      if (setOrigenes.has(doc.Ubicacion)) {
        await skuCollection.updateMany(
          { Ubicacion: doc.Ubicacion, Origen_Abasto: doc.Ubicacion },
          { $set: { Origen_Abasto: null } }
        );
        ubicacionesCorregidas.add(doc.Ubicacion);
        corregidos++;
      }
    }
    
    if (ubicacionesCorregidas.size > 0) {
      writeToDebugLog(`Ubicaciones corregidas: ${[...ubicacionesCorregidas].join(', ')}`);
    }
    writeToLog(`\tAutoabastecimientos corregidos: ${corregidos}`);
    writeToDebugLog(`Documentos corregidos: ${corregidos}`);

    // 4. Releer datos ya corregidos
    const skusActualizados = await skuCollection.find({}).toArray();

    // 5. Volver a limpiar valores inválidos después de releer
    skusActualizados.forEach(doc => {
      if (!doc.Origen_Abasto || 
          valoresInvalidos.includes(String(doc.Origen_Abasto).trim())) {
        doc.Origen_Abasto = null;
      }
    });

    // 6. Análisis de relaciones de abastecimiento
    writeToDebugLog(`\n--- ANÁLISIS DE RELACIONES DE ABASTECIMIENTO ---`);
    
    const originToDestinations = {};
    const ubicacionesConOrigen = new Set();
    const ubicacionesQueAbastecen = new Set();
    
    skusActualizados.forEach(({ Ubicacion, Origen_Abasto }) => {
      if (Origen_Abasto && Origen_Abasto !== null) {
        ubicacionesConOrigen.add(Ubicacion);
        ubicacionesQueAbastecen.add(Origen_Abasto);
        
        if (!originToDestinations[Origen_Abasto]) {
          originToDestinations[Origen_Abasto] = new Set();
        }
        originToDestinations[Origen_Abasto].add(Ubicacion);
      }
    });
    
    writeToDebugLog(`Ubicaciones que reciben abasto: ${ubicacionesConOrigen.size}`);
    writeToDebugLog(`Ubicaciones que abastecen: ${ubicacionesQueAbastecen.size}`);
    writeToDebugLog(`Relaciones de abastecimiento: ${Object.keys(originToDestinations).length}`);

    // 7. Calcular niveles OA con lógica corregida
    const levels = {};
    const ubicacionesUnicas = [...new Set(skusActualizados.map(s => s.Ubicacion))];
    
    writeToDebugLog(`\n--- CÁLCULO DE NIVELES ---`);
    writeToDebugLog(`Ubicaciones únicas a procesar: ${ubicacionesUnicas.length}`);
    
    ubicacionesUnicas.forEach(ubicacion => {
      const abasteceAotros = originToDestinations[ubicacion] !== undefined;
      const esAbastecido = ubicacionesConOrigen.has(ubicacion);

      if (!esAbastecido && abasteceAotros) {
        levels[ubicacion] = 3; // Super almacén
      } else if (esAbastecido && abasteceAotros) {
        levels[ubicacion] = 2; // Almacén intermedio
      } else {
        levels[ubicacion] = 1; // Tienda o punto final
      }
    });
    
    const conteoNiveles = { 1: 0, 2: 0, 3: 0 };
    Object.values(levels).forEach(nivel => conteoNiveles[nivel]++);
    
    writeToDebugLog(`\nUbicaciones por nivel:`);
    writeToDebugLog(`  Nivel 3 (Super almacenes): ${conteoNiveles[3]}`);
    writeToDebugLog(`  Nivel 2 (Almacenes intermedios): ${conteoNiveles[2]}`);
    writeToDebugLog(`  Nivel 1 (Tiendas/Puntos finales): ${conteoNiveles[1]}`);

    // 8. Actualizar TODOS los documentos de cada ubicación
    writeToDebugLog(`\n--- ACTUALIZACIÓN EN BASE DE DATOS ---`);
    const bulkOps = [];
    
    for (const [ubicacion, nivel] of Object.entries(levels)) {
      bulkOps.push({
        updateMany: {
          filter: { Ubicacion: ubicacion },
          update: { $set: { Nivel_OA: nivel } }
        }
      });
    }

    const result = await skuCollection.bulkWrite(bulkOps);
    writeToLog(`\tNiveles OA actualizados: ${result.modifiedCount} documentos`);
    writeToDebugLog(`Documentos actualizados en BD: ${result.modifiedCount}`);

    // 9. Verificación post-actualización
    writeToDebugLog(`\n--- VERIFICACIÓN POST-ACTUALIZACIÓN ---`);
    const skusFinales = await skuCollection.find({}).toArray();
    const skusSinNivel = skusFinales.filter(s => s.Nivel_OA === undefined || s.Nivel_OA === null);
    
    writeToDebugLog(`Total SKUs después de actualización: ${skusFinales.length}`);
    writeToDebugLog(`SKUs sin Nivel_OA: ${skusSinNivel.length}`);
    
    if (skusSinNivel.length > 0) {
      writeToDebugLog(`\n  ADVERTENCIA: Hay SKUs sin Nivel_OA:`);
      skusSinNivel.forEach(s => {
        writeToDebugLog(`   SKU: ${s.SKU}, Producto: ${s.Producto}, Ubicacion: ${s.Ubicacion}, Origen: ${s.Origen_Abasto}`);
      });
    }

    // 10. ESCRIBIR DEBUG LOG detallado
    writeToDebugLog(`\n${'='.repeat(80)}`);
    writeToDebugLog(`--- DETALLE POR SKU ---`);
    writeToDebugLog(`SKU\tUbicacion\tOrigen_Abasto\tNivel_OA`);
    writeToDebugLog(`${'='.repeat(80)}`);
    
    const skusSorted = skusFinales.sort((a, b) => {
      if (a.Ubicacion !== b.Ubicacion) return String(a.Ubicacion).localeCompare(String(b.Ubicacion));
      return String(a.Producto).localeCompare(String(b.Producto));
    });
    
    skusSorted.forEach(sku => {
      const skuFormatted = sku.SKU || `${sku.Producto}@${sku.Ubicacion}`;
      const ubicacion = String(sku.Ubicacion).padStart(4, '0');
      const origen = sku.Origen_Abasto ? String(sku.Origen_Abasto).padStart(4, '0') : 'null';
      const nivel = sku.Nivel_OA || 'SIN_NIVEL';
      
      writeToDebugLog(`${skuFormatted}\t${ubicacion}\t${origen}\t${nivel}`);
    });
    
    // Resumen de niveles
    const conteoFinal = { 1: 0, 2: 0, 3: 0, undefined: 0 };
    skusFinales.forEach(sku => {
      const nivel = sku.Nivel_OA;
      conteoFinal[nivel] = (conteoFinal[nivel] || 0) + 1;
    });
    
    writeToDebugLog(`\n${'='.repeat(80)}`);
    writeToDebugLog(`--- RESUMEN FINAL ---`);
    writeToDebugLog(`Nivel 1 (Tiendas/Puntos finales): ${conteoFinal[1] || 0} SKUs`);
    writeToDebugLog(`Nivel 2 (Almacenes intermedios): ${conteoFinal[2] || 0} SKUs`);
    writeToDebugLog(`Nivel 3 (Super almacenes): ${conteoFinal[3] || 0} SKUs`);
    writeToDebugLog(`Sin nivel asignado: ${conteoFinal[undefined] || 0} SKUs`);
    writeToDebugLog(`TOTAL: ${skusFinales.length} SKUs`);
    
    // Mostrar relaciones de abastecimiento
    writeToDebugLog(`\n--- RELACIONES DE ABASTECIMIENTO FINAL ---`);
    for (const [origen, destinos] of Object.entries(originToDestinations)) {
      const nivelOrigen = levels[origen] || 'N/A';
      writeToDebugLog(`Ubicación ${String(origen).padStart(4, '0')} (Nivel ${nivelOrigen}) abastece a: [${[...destinos].map(d => String(d).padStart(4, '0')).join(', ')}]`);
    }

    // 11. Exportar CSV de salida
    await generateCsvReport(skusFinales, levels);
    
    client.close();
    
    writeToLog(`\tArchivo de debug generado: ${debugLogFile}`);
    console.log(`\n Proceso completado`);
    console.log(` Log detallado: ${debugLogFile}`);
    console.log(` SKUs procesados: ${skusFinales.length}`);
    console.log(`  SKUs sin nivel: ${skusSinNivel.length}\n`);
    
  } catch (error) {
    writeToLog(`${now} - Error durante el cálculo de niveles: ${error}`);
    writeToDebugLog(`\n ERROR CRÍTICO: ${error.message}`);
    writeToDebugLog(`Stack: ${error.stack}`);
    console.error('Error:', error);
  }
}

async function generateCsvReport(skus, levels) {
  const headers = Object.keys(skus[0]).map((key) => ({ id: key, title: key }));
  
  // Asegurar que Nivel_OA esté en los headers
  if (!headers.find(h => h.id === 'Nivel_OA')) {
    headers.push({ id: 'Nivel_OA', title: 'Nivel_OA' });
  }
  headers.push({ id: 'Nota', title: 'Nota' });

  const csvWriterInstance = csvWriter({
    path: outputCsvPath,
    header: headers,
  });

  const csvData = skus.map((sku) => ({
    ...sku,
    Nivel_OA: sku.Nivel_OA || levels[sku.Ubicacion] || 1,
    Nota: !sku.Origen_Abasto ? 'Sin Origen de Abasto' : '',
  }));

  await csvWriterInstance.writeRecords(csvData);
  writeToLog(`\tArchivo CSV generado: ${outputCsvPath}`);
}

calculateLevels();