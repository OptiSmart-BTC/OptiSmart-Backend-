const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parte = dbName.substring(dbName.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/Copia_NivelOA_Debug.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

async function copiarYCalcularNivelOA() {
  console.log('\n=== INICIO: Copia, Cálculo y Verificación de Nivel_OA ===\n');
  
  // Limpiar log anterior
  if (fs.existsSync(logFile)) {
    fs.unlinkSync(logFile);
  }
  
  writeToLog(`=== COPIA Y CÁLCULO DE NIVEL_OA - ${now} ===\n`);

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const planRepo = db.collection('plan_reposicion_01_sem');

    // ============================================================
    // PASO 1: COPIAR NIVELES DESDE COLECCIÓN SKU
    // ============================================================
    writeToLog(`\n${'='.repeat(80)}`);
    writeToLog(`PASO 1: COPIAR NIVEL_OA DESDE COLECCIÓN SKU`);
    writeToLog(`${'='.repeat(80)}`);
    
    const skuData = await db.collection('sku').find({}).toArray();
    writeToLog(` Total documentos en colección 'sku': ${skuData.length}`);
    
    const skusConNivel = skuData.filter(s => s.Nivel_OA !== undefined && s.Nivel_OA !== null);
    writeToLog(` SKUs con Nivel_OA en colección origen: ${skusConNivel.length}`);
    
    // Crear mapeo de SKU
    const skuMap = new Map();
    skusConNivel.forEach(sku => {
      const producto = String(sku.Producto || '').padStart(5, '0').trim();
      const ubicacion = String(sku.Ubicacion || '').padStart(4, '0').trim();
      
      const variantes = [
        sku.SKU?.trim().toUpperCase(),
        `${producto}@${ubicacion}`,
        `${sku.Producto}@${sku.Ubicacion}`,
        `${producto}@${sku.Ubicacion}`,
        `${sku.Producto}@${ubicacion}`
      ].filter(Boolean);
      
      const origenAbasto = sku.Origen_Abasto && 
                          sku.Origen_Abasto !== 'Default Value' && 
                          sku.Origen_Abasto !== 'null' && 
                          sku.Origen_Abasto !== 'N/A'
        ? String(sku.Origen_Abasto).trim()
        : null;
      
      const datosNivel = {
        Nivel_OA: sku.Nivel_OA,
        Origen_Abasto: origenAbasto,
        Producto: producto,
        Ubicacion: ubicacion
      };
      
      variantes.forEach(v => {
        if (!skuMap.has(v)) {
          skuMap.set(v, datosNivel);
        }
      });
    });
    
    writeToLog(` Variantes de SKU generadas para matching: ${skuMap.size}`);

    // Copiar niveles desde SKU
    const docsEnPlan = await planRepo.find({}).toArray();
    writeToLog(`\n Total documentos en plan_reposicion: ${docsEnPlan.length}`);
    
    let copiados = 0;
    for (const doc of docsEnPlan) {
      const skuOriginal = doc.SKU?.trim().toUpperCase();
      if (!skuOriginal) continue;
      
      let datosNivel = skuMap.get(skuOriginal);
      
      // Búsqueda alternativa si no se encuentra
      if (!datosNivel) {
        const partes = skuOriginal.split('@');
        if (partes.length === 2) {
          const [prod, ubic] = partes;
          const skuAlternativo = `${prod.padStart(5, '0')}@${ubic.padStart(4, '0')}`;
          datosNivel = skuMap.get(skuAlternativo);
        }
      }
      
      if (datosNivel) {
        await planRepo.updateOne(
          { _id: doc._id },
          {
            $set: {
              Nivel_OA: datosNivel.Nivel_OA,
              Origen_Abasto: datosNivel.Origen_Abasto
            }
          }
        );
        copiados++;
      }
    }
    
    writeToLog(` Documentos actualizados desde colección SKU: ${copiados}`);

    // ============================================================
    // PASO 2: CALCULAR NIVELES PARA SKUs SIN NIVEL
    // ============================================================
    writeToLog(`\n${'='.repeat(80)}`);
    writeToLog(`PASO 2: CALCULAR NIVEL_OA PARA DOCUMENTOS SIN NIVEL`);
    writeToLog(`${'='.repeat(80)}`);
    
    // Recargar datos actualizados
    const todosLosDocs = await planRepo.find({}).toArray();
    
    // Limpiar valores inválidos de Origen_Abasto
    const valoresInvalidos = ['Default Value', 'default', 'N/A', 'null', '', 'undefined'];
    todosLosDocs.forEach(doc => {
      if (!doc.Origen_Abasto || 
          valoresInvalidos.includes(String(doc.Origen_Abasto).trim())) {
        doc.Origen_Abasto = null;
      }
    });
    
    // Identificar documentos sin nivel
    const docsSinNivel = todosLosDocs.filter(d => 
      d.Nivel_OA === undefined || d.Nivel_OA === null
    );
    
    writeToLog(` Documentos SIN Nivel_OA a calcular: ${docsSinNivel.length}`);
    
    if (docsSinNivel.length > 0) {
      // Construir relaciones de abastecimiento de TODOS los documentos
      const originToDestinations = {};
      const ubicacionesConOrigen = new Set();
      const ubicacionesQueAbastecen = new Set();
      
      todosLosDocs.forEach(({ Ubicacion, Origen_Abasto }) => {
        if (Origen_Abasto && Origen_Abasto !== null) {
          ubicacionesConOrigen.add(Ubicacion);
          ubicacionesQueAbastecen.add(Origen_Abasto);
          
          if (!originToDestinations[Origen_Abasto]) {
            originToDestinations[Origen_Abasto] = new Set();
          }
          originToDestinations[Origen_Abasto].add(Ubicacion);
        }
      });
      
      writeToLog(`\n Análisis de relaciones de abastecimiento:`);
      writeToLog(`   - Ubicaciones que reciben abasto: ${ubicacionesConOrigen.size}`);
      writeToLog(`   - Ubicaciones que abastecen: ${ubicacionesQueAbastecen.size}`);
      
      // Calcular niveles con la misma lógica del script original
      const levelsCalculados = {};
      const ubicacionesUnicas = [...new Set(todosLosDocs.map(d => d.Ubicacion))];
      
      ubicacionesUnicas.forEach(ubicacion => {
        const abasteceAotros = originToDestinations[ubicacion] !== undefined;
        const esAbastecido = ubicacionesConOrigen.has(ubicacion);

        if (!esAbastecido && abasteceAotros) {
          levelsCalculados[ubicacion] = 3; // Super almacén
        } else if (esAbastecido && abasteceAotros) {
          levelsCalculados[ubicacion] = 2; // Almacén intermedio
        } else {
          levelsCalculados[ubicacion] = 1; // Tienda o punto final
        }
      });
      
      // Asignar niveles calculados a documentos sin nivel
      let asignados = 0;
      for (const doc of docsSinNivel) {
        const nivelCalculado = levelsCalculados[doc.Ubicacion];
        
        if (nivelCalculado) {
          await planRepo.updateOne(
            { _id: doc._id },
            { $set: { Nivel_OA: nivelCalculado } }
          );
          asignados++;
        }
      }
      
      writeToLog(` Niveles asignados mediante cálculo: ${asignados}`);
      
      // Mostrar distribución de niveles calculados
      const conteoCalculados = { 1: 0, 2: 0, 3: 0 };
      Object.values(levelsCalculados).forEach(nivel => conteoCalculados[nivel]++);
      
      writeToLog(`\n Distribución de niveles calculados:`);
      writeToLog(`   - Nivel 3 (Super almacenes): ${conteoCalculados[3]} ubicaciones`);
      writeToLog(`   - Nivel 2 (Almacenes intermedios): ${conteoCalculados[2]} ubicaciones`);
      writeToLog(`   - Nivel 1 (Tiendas/Puntos finales): ${conteoCalculados[1]} ubicaciones`);
    }

    // ============================================================
    // PASO 3: VERIFICACIÓN Y CORRECCIÓN (DOUBLE CHECK)
    // ============================================================
    writeToLog(`\n${'='.repeat(80)}`);
    writeToLog(`PASO 3: VERIFICACIÓN Y CORRECCIÓN DE NIVELES EXISTENTES`);
    writeToLog(`${'='.repeat(80)}`);
    
    // Recargar todos los documentos actualizados
    const docsFinales = await planRepo.find({}).toArray();
    
    // Limpiar valores inválidos nuevamente
    docsFinales.forEach(doc => {
      if (!doc.Origen_Abasto || 
          valoresInvalidos.includes(String(doc.Origen_Abasto).trim())) {
        doc.Origen_Abasto = null;
      }
    });
    
    // Recalcular niveles para verificación
    const originToDestinationsCheck = {};
    const ubicacionesConOrigenCheck = new Set();
    const ubicacionesQueAbastecenCheck = new Set();
    
    docsFinales.forEach(({ Ubicacion, Origen_Abasto }) => {
      if (Origen_Abasto && Origen_Abasto !== null) {
        ubicacionesConOrigenCheck.add(Ubicacion);
        ubicacionesQueAbastecenCheck.add(Origen_Abasto);
        
        if (!originToDestinationsCheck[Origen_Abasto]) {
          originToDestinationsCheck[Origen_Abasto] = new Set();
        }
        originToDestinationsCheck[Origen_Abasto].add(Ubicacion);
      }
    });
    
    // Calcular niveles correctos para verificación
    const nivelesCorrectos = {};
    const ubicacionesUnicasCheck = [...new Set(docsFinales.map(d => d.Ubicacion))];
    
    ubicacionesUnicasCheck.forEach(ubicacion => {
      const abasteceAotros = originToDestinationsCheck[ubicacion] !== undefined;
      const esAbastecido = ubicacionesConOrigenCheck.has(ubicacion);

      if (!esAbastecido && abasteceAotros) {
        nivelesCorrectos[ubicacion] = 3;
      } else if (esAbastecido && abasteceAotros) {
        nivelesCorrectos[ubicacion] = 2;
      } else {
        nivelesCorrectos[ubicacion] = 1;
      }
    });
    
    // Comparar niveles actuales vs niveles correctos
    const discrepancias = [];
    let corregidos = 0;
    
    for (const doc of docsFinales) {
      const nivelActual = doc.Nivel_OA;
      const nivelCorrecto = nivelesCorrectos[doc.Ubicacion];
      
      if (nivelActual !== nivelCorrecto) {
        discrepancias.push({
          SKU: doc.SKU,
          Ubicacion: doc.Ubicacion,
          Origen_Abasto: doc.Origen_Abasto,
          NivelActual: nivelActual,
          NivelCorrecto: nivelCorrecto
        });
        
        // Corregir el nivel
        await planRepo.updateOne(
          { _id: doc._id },
          { $set: { Nivel_OA: nivelCorrecto } }
        );
        corregidos++;
      }
    }
    
    writeToLog(` Discrepancias encontradas: ${discrepancias.length}`);
    writeToLog(` Niveles corregidos: ${corregidos}`);
    
    if (discrepancias.length > 0) {
      writeToLog(`\n --- DETALLE DE CORRECCIONES ---`);
      discrepancias.slice(0, 50).forEach((disc, idx) => {
        writeToLog(`${idx + 1}. SKU: ${disc.SKU}, Ubicación: ${disc.Ubicacion}`);
        writeToLog(`   Nivel Actual: ${disc.NivelActual} → Nivel Correcto: ${disc.NivelCorrecto}`);
        writeToLog(`   Origen_Abasto: ${disc.Origen_Abasto || 'NULL'}`);
      });
      
      if (discrepancias.length > 50) {
        writeToLog(`\n... y ${discrepancias.length - 50} correcciones más`);
      }
      
      // Guardar lista completa de discrepancias
      const discFile = `../../${parametroFolder}/log/Discrepancias_NivelOA.log`;
      fs.writeFileSync(discFile, 
        `Discrepancias de Nivel_OA corregidas - ${now}\n\n` +
        discrepancias.map((d, idx) => 
          `${idx + 1}. SKU: ${d.SKU} | Ubicación: ${d.Ubicacion} | ${d.NivelActual} → ${d.NivelCorrecto} | Origen: ${d.Origen_Abasto || 'NULL'}`
        ).join('\n')
      );
      writeToLog(`\n Lista completa de correcciones guardada en: ${discFile}`);
    }

    // ============================================================
    // RESUMEN FINAL
    // ============================================================
    writeToLog(`\n${'='.repeat(80)}`);
    writeToLog(`RESUMEN FINAL`);
    writeToLog(`${'='.repeat(80)}`);
    
    const docsVerificados = await planRepo.find({}).toArray();
    const conteoFinal = { 1: 0, 2: 0, 3: 0, sinNivel: 0 };
    
    docsVerificados.forEach(doc => {
      const nivel = doc.Nivel_OA;
      if (nivel === 1 || nivel === 2 || nivel === 3) {
        conteoFinal[nivel]++;
      } else {
        conteoFinal.sinNivel++;
      }
    });
    
    writeToLog(` Total documentos procesados: ${docsVerificados.length}`);
    writeToLog(` Documentos copiados desde SKU: ${copiados}`);
    writeToLog(` Documentos calculados: ${docsSinNivel.length > 0 ? asignados : 0}`);
    writeToLog(` Documentos corregidos (double check): ${corregidos}`);
    writeToLog(`\n Distribución final de niveles:`);
    writeToLog(`   - Nivel 1 (Tiendas/Puntos finales): ${conteoFinal[1]} documentos`);
    writeToLog(`   - Nivel 2 (Almacenes intermedios): ${conteoFinal[2]} documentos`);
    writeToLog(`   - Nivel 3 (Super almacenes): ${conteoFinal[3]} documentos`);
    writeToLog(`   - Sin nivel asignado: ${conteoFinal.sinNivel} documentos`);
    
    if (conteoFinal.sinNivel > 0) {
      const sinNivelDocs = docsVerificados.filter(d => !d.Nivel_OA);
      writeToLog(`\n ADVERTENCIA: Documentos que quedaron sin nivel:`);
      sinNivelDocs.slice(0, 20).forEach((doc, idx) => {
        writeToLog(`${idx + 1}. SKU: ${doc.SKU}, Ubicación: ${doc.Ubicacion}, Origen: ${doc.Origen_Abasto || 'NULL'}`);
      });
    }
    
    writeToLog(`\n Relaciones de abastecimiento finales:`);
    for (const [origen, destinos] of Object.entries(originToDestinationsCheck)) {
      const nivelOrigen = nivelesCorrectos[origen] || 'N/A';
      writeToLog(`   Ubicación ${String(origen).padStart(4, '0')} (Nivel ${nivelOrigen}) → [${[...destinos].map(d => String(d).padStart(4, '0')).join(', ')}]`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(` PROCESO COMPLETADO EXITOSAMENTE`);
    console.log(`${'='.repeat(60)}`);
    console.log(` Documentos procesados: ${docsVerificados.length}`);
    console.log(` Copiados: ${copiados}`);
    console.log(` Calculados: ${docsSinNivel.length > 0 ? asignados : 0}`);
    console.log(` Corregidos: ${corregidos}`);
    console.log(` Sin nivel: ${conteoFinal.sinNivel}`);
    console.log(` Log detallado: ${logFile}\n`);

  } catch (error) {
    writeToLog(`\n ERROR CRÍTICO: ${error.message}`);
    writeToLog(`Stack: ${error.stack}`);
    console.error(' ERROR:', error.message);
  } finally {
    await client.close();
  }
}

copiarYCalcularNivelOA();