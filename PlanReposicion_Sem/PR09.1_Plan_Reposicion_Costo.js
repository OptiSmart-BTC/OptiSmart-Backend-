const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const nivelFiltrado = process.argv[5] ? parseInt(process.argv[5]) : null;

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parte = dbName.substring(dbName.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion_Sem.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection1 = 'plan_reposicion_01_sem';
const collection2 = 'sku';

async function actualizarDatos() {
  writeToLog(`\nPaso 09.1 - Calculo del Plan de Reposicion en Costo (Nivel ${nivelFiltrado})`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const col1 = db.collection(collection1);
    const col2 = db.collection(collection2);

    //  FILTRO CORREGIDO: Busca como string Y como número
    let filtro = {};
    if (nivelFiltrado !== null) {
      filtro = {
        $or: [
          { Nivel_OA: nivelFiltrado },        // Como número
          { Nivel_OA: nivelFiltrado.toString() } // Como string
        ]
      };
    }
    
    const docs = await col1.find(filtro).toArray();
    writeToLog(`\t Encontrados ${docs.length} documentos en plan_reposicion_01_sem`);

    //  ANÁLISIS INICIAL DE DATOS
    if (docs.length > 0) {
      const primerDoc = docs[0];
      writeToLog(`\t Estructura del primer documento:`);
      writeToLog(`\t   SKU: ${primerDoc.SKU}`);
      writeToLog(`\t   Plan_Firme_Pallets: ${primerDoc.Plan_Firme_Pallets} (tipo: ${typeof primerDoc.Plan_Firme_Pallets})`);
      writeToLog(`\t   Cantidad_Reponer: ${primerDoc.Cantidad_Reponer} (tipo: ${typeof primerDoc.Cantidad_Reponer})`);
      writeToLog(`\t   Nivel_OA: ${primerDoc.Nivel_OA} (tipo: ${typeof primerDoc.Nivel_OA})`);
      
      const campos = Object.keys(primerDoc);
      writeToLog(`\t   Campos disponibles: ${campos.join(', ')}`);
    }

    //  ANÁLISIS DE Plan_Firme_Pallets
    const distribPlanFirme = {
      null: 0, undefined: 0, zero: 0, positive: 0, negative: 0
    };

    docs.forEach(doc => {
      const valor = doc.Plan_Firme_Pallets;
      if (valor === null) distribPlanFirme.null++;
      else if (valor === undefined) distribPlanFirme.undefined++;
      else if (parseFloat(valor) === 0) distribPlanFirme.zero++;
      else if (parseFloat(valor) > 0) distribPlanFirme.positive++;
      else if (parseFloat(valor) < 0) distribPlanFirme.negative++;
    });

    writeToLog(`\t Distribución de Plan_Firme_Pallets:`);
    writeToLog(`\t   null: ${distribPlanFirme.null}`);
    writeToLog(`\t   undefined: ${distribPlanFirme.undefined}`);
    writeToLog(`\t   cero: ${distribPlanFirme.zero}`);
    writeToLog(`\t   positivos: ${distribPlanFirme.positive}`);
    writeToLog(`\t   negativos: ${distribPlanFirme.negative}`);

    //  ANÁLISIS DE Cantidad_Reponer (por si necesitamos recalcular)
    const distribCantidad = {
      null: 0, undefined: 0, zero: 0, positive: 0, negative: 0
    };

    docs.forEach(doc => {
      const valor = doc.Cantidad_Reponer;
      if (valor === null) distribCantidad.null++;
      else if (valor === undefined) distribCantidad.undefined++;
      else if (parseFloat(valor) === 0) distribCantidad.zero++;
      else if (parseFloat(valor) > 0) distribCantidad.positive++;
      else if (parseFloat(valor) < 0) distribCantidad.negative++;
    });

    writeToLog(`\t Distribución de Cantidad_Reponer:`);
    writeToLog(`\t   null: ${distribCantidad.null}`);
    writeToLog(`\t   undefined: ${distribCantidad.undefined}`);
    writeToLog(`\t   cero: ${distribCantidad.zero}`);
    writeToLog(`\t   positivos: ${distribCantidad.positive}`);
    writeToLog(`\t   negativos: ${distribCantidad.negative}`);

    //  CARGAR Y ANALIZAR DATOS DE SKU
    const skuDocs = await col2.find({}).toArray();
    writeToLog(`\t Encontrados ${skuDocs.length} documentos en colección sku`);
    
    if (skuDocs.length > 0) {
      const primerSku = skuDocs[0];
      writeToLog(`\t Estructura del primer SKU:`);
      writeToLog(`\t   SKU: ${primerSku.SKU}`);
      writeToLog(`\t   Costo_Unidad: ${primerSku.Costo_Unidad} (tipo: ${typeof primerSku.Costo_Unidad})`);
      writeToLog(`\t   Unidades_Pallet: ${primerSku.Unidades_Pallet} (tipo: ${typeof primerSku.Unidades_Pallet})`);
    }

    //  CREAR MAPA DE SKUs PARA BÚSQUEDA RÁPIDA
    const skuMap = new Map();
    skuDocs.forEach(sku => skuMap.set(sku.SKU, sku));
    writeToLog(`\t Mapa de SKUs creado con ${skuMap.size} entradas`);

    //  CONTADORES DE DIAGNÓSTICO
    let stats = {
      procesados: 0,
      sinSku: 0,
      sinCostoValido: 0,
      sinUnidadesValidas: 0,
      sinPlanFirme: 0,
      conCostoCero: 0,
      conCostoPositivo: 0,
      recalculados: 0,
      actualizados: 0
    };

    //  PROCESAMIENTO PRINCIPAL
    const updates = docs.map((doc, index) => {
      stats.procesados++;
      
      //  BUSCAR DATOS DEL SKU
      const skuData = skuMap.get(doc.SKU);
      if (!skuData) {
        if (index < 3) writeToLog(`\t❌ SKU ${doc.SKU} no encontrado en colección sku`);
        stats.sinSku++;
        return null;
      }

      //  VALIDAR COSTO UNITARIO
      const costoUnidad = parseFloat(skuData.Costo_Unidad) || 0;
      if (costoUnidad <= 0) {
        if (index < 3) writeToLog(`\t❌ SKU ${doc.SKU}: Costo_Unidad inválido = ${skuData.Costo_Unidad}`);
        stats.sinCostoValido++;
        return null;
      }

      //  VALIDAR UNIDADES POR PALLET
      const unidadesPallet = Math.max(parseInt(skuData.Unidades_Pallet) || 1, 1);
      if (!skuData.Unidades_Pallet || parseInt(skuData.Unidades_Pallet) <= 0) {
        if (index < 3) writeToLog(`\t⚠️ SKU ${doc.SKU}: Unidades_Pallet = ${skuData.Unidades_Pallet}, usando 1 por defecto`);
        stats.sinUnidadesValidas++;
      }

      //  OBTENER PLAN FIRME DE PALLETS
      let planFirmePallets = parseFloat(doc.Plan_Firme_Pallets) || 0;
      
      //  AUTO-RECÁLCULO SI PLAN_FIRME ES 0 PERO HAY CANTIDAD_REPONER
      if (planFirmePallets === 0 && doc.Cantidad_Reponer && parseFloat(doc.Cantidad_Reponer) > 0) {
        const cantidadReponer = parseFloat(doc.Cantidad_Reponer);
        planFirmePallets = Math.ceil(cantidadReponer / unidadesPallet);
        
        if (index < 3) {
          writeToLog(`\t SKU ${doc.SKU}: Plan_Firme_Pallets era 0, recalculando:`);
          writeToLog(`\t   Cantidad_Reponer: ${cantidadReponer}`);
          writeToLog(`\t   Unidades_Pallet: ${unidadesPallet}`);
          writeToLog(`\t   Nuevo Plan_Firme_Pallets: ${planFirmePallets}`);
        }
        stats.recalculados++;
      }

      if (planFirmePallets <= 0) {
        if (index < 3) writeToLog(`\t SKU ${doc.SKU}: Plan_Firme_Pallets = ${doc.Plan_Firme_Pallets}, sin cantidad a reponer`);
        stats.sinPlanFirme++;
      }

      //  CÁLCULO DEL COSTO TOTAL
      const totalCosto = planFirmePallets * costoUnidad * unidadesPallet;

      if (totalCosto === 0) {
        stats.conCostoCero++;
      } else {
        stats.conCostoPositivo++;
      }

      //  LOG DETALLADO PARA LOS PRIMEROS 3 REGISTROS
      if (index < 3) {
        writeToLog(`\t SKU ${doc.SKU} - Cálculo detallado:`);
        writeToLog(`\t   Plan_Firme_Pallets: ${doc.Plan_Firme_Pallets} → ${planFirmePallets}`);
        writeToLog(`\t   Costo_Unidad: ${skuData.Costo_Unidad} → ${costoUnidad}`);
        writeToLog(`\t   Unidades_Pallet: ${skuData.Unidades_Pallet} → ${unidadesPallet}`);
        writeToLog(`\t   Cálculo: ${planFirmePallets} × ${costoUnidad} × ${unidadesPallet} = ${totalCosto}`);
        writeToLog(`\t   ${totalCosto > 0 ? '✅ EXITOSO' : '⚠️ COSTO = 0'}`);
      }

      stats.actualizados++;

      //  PREPARAR UPDATE (INCLUYE PLAN_FIRME RECALCULADO SI ES NECESARIO)
      const updateFields = {
        Plan_Reposicion_Costo: totalCosto
      };

      // Si recalculamos Plan_Firme_Pallets, también lo actualizamos
      if (stats.recalculados > 0 && planFirmePallets !== parseFloat(doc.Plan_Firme_Pallets)) {
        updateFields.Plan_Firme_Pallets = planFirmePallets;
      }

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: updateFields }
        }
      };
    }).filter(Boolean);

    //  REPORTE DE ESTADÍSTICAS
    writeToLog(`\n RESUMEN DE PROCESAMIENTO:`);
    writeToLog(`\t Total documentos procesados: ${stats.procesados}`);
    writeToLog(`\t Sin SKU en colección sku: ${stats.sinSku}`);
    writeToLog(`\t Sin costo válido: ${stats.sinCostoValido}`);
    writeToLog(`\t Sin unidades pallet válidas: ${stats.sinUnidadesValidas}`);
    writeToLog(`\t Sin plan firme > 0: ${stats.sinPlanFirme}`);
    writeToLog(`\t Plan_Firme_Pallets recalculados: ${stats.recalculados}`);
    writeToLog(`\t Con costo calculado = 0: ${stats.conCostoCero}`);
    writeToLog(`\t Con costo calculado > 0: ${stats.conCostoPositivo}`);
    writeToLog(`\t Updates a ejecutar: ${updates.length}`);

    //  EJECUTAR UPDATES
    if (updates.length > 0) {
      const result = await col1.bulkWrite(updates);
      writeToLog(`\t Operación exitosa:`);
      writeToLog(`\t   Registros coincidentes: ${result.matchedCount}`);
      writeToLog(`\t   Registros modificados: ${result.modifiedCount}`);
      writeToLog(`\t   Errores de escritura: ${result.writeErrors ? result.writeErrors.length : 0}`);
    } else {
      writeToLog(`\t No hay registros para actualizar`);
    }

    //  VERIFICACIÓN POST-ACTUALIZACIÓN
    const verificacion = await col1.find(filtro).limit(5).toArray();
    writeToLog(`\n VERIFICACIÓN POST-ACTUALIZACIÓN (primeros 5):`);
    verificacion.forEach(doc => {
      writeToLog(`\t   SKU ${doc.SKU}: Plan_Reposicion_Costo = ${doc.Plan_Reposicion_Costo}`);
    });

    //  ESTADÍSTICAS FINALES CON AGGREGATION
    const estadisticasFinales = await col1.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: null,
          totalRegistros: { $sum: 1 },
          costoPromedio: { $avg: "$Plan_Reposicion_Costo" },
          costoTotal: { $sum: "$Plan_Reposicion_Costo" },
          costoMinimo: { $min: "$Plan_Reposicion_Costo" },
          costoMaximo: { $max: "$Plan_Reposicion_Costo" },
          registrosConCosto: { 
            $sum: { 
              $cond: [{ $gt: ["$Plan_Reposicion_Costo", 0] }, 1, 0] 
            }
          },
          registrosSinCosto: { 
            $sum: { 
              $cond: [{ $eq: ["$Plan_Reposicion_Costo", 0] }, 1, 0] 
            }
          }
        }
      }
    ]).toArray();

    if (estadisticasFinales.length > 0) {
      const stats = estadisticasFinales[0];
      writeToLog(`\n ESTADÍSTICAS FINALES:`);
      writeToLog(`\t Total registros: ${stats.totalRegistros}`);
      writeToLog(`\t Registros con costo > 0: ${stats.registrosConCosto}`);
      writeToLog(`\t Registros con costo = 0: ${stats.registrosSinCosto}`);
      writeToLog(`\t Costo total: $${stats.costoTotal ? stats.costoTotal.toFixed(2) : '0.00'}`);
      writeToLog(`\t Costo promedio: $${stats.costoPromedio ? stats.costoPromedio.toFixed(2) : '0.00'}`);
      writeToLog(`\t Costo máximo: $${stats.costoMaximo ? stats.costoMaximo.toFixed(2) : '0.00'}`);
      writeToLog(`\t Costo mínimo: $${stats.costoMinimo ? stats.costoMinimo.toFixed(2) : '0.00'}`);
      
      const porcentajeExito = stats.totalRegistros > 0 ? 
        ((stats.registrosConCosto / stats.totalRegistros) * 100).toFixed(1) : 0;
      writeToLog(`\t Porcentaje de éxito: ${porcentajeExito}%`);
    }

    writeToLog(`\n Termina el Calculo del Plan de Reposicion en Costo para Nivel ${nivelFiltrado}`);

  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
    writeToLog(`${now} - [ERROR] Stack: ${error.stack}`);
    console.error('Error completo:', error);
  } finally {
    if (client) {
      await client.close();
      writeToLog(`\t🔌 Conexión a MongoDB cerrada`);
    }
  }
}

function writeToLog(message) {
  const timestamp = moment().format('HH:mm:ss');
  const logMessage = `[${timestamp}] ${message}`;
  fs.appendFileSync(logFile, logMessage + '\n');
  console.log(logMessage);
}

actualizarDatos().catch(console.error);