const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require('moment');
const { host, puerto } = require("../Configuraciones/ConexionDB");

// ---------- ARGS ----------
if (process.argv.length < 5) {
  console.error("Uso: node P21_UneTablas.js <dbName> <DBUser> <DBPassword> [uiCollectionName]");
  process.exit(1);
}
const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const providedUiArg = process.argv[5]; // puede venir una Ubicación por P24

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

// ---------- LOG ----------
const parte = (dbName.split("_").pop() || '').toUpperCase();
const logFile = path.resolve(__dirname, `../../${parte}/log/ClasABCD_PolInvent.log`);
function nowStr(){ return moment().format('YYYY-MM-DD HH:mm:ss'); }
function writeToLog(msg){
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `[${nowStr()}] P21: ${msg}\n`);
  } catch { console.log(`[${nowStr()}] P21: ${msg}`); }
}

// ---------- UTILS ----------
function normalizeUbicacion(u){
  if (u == null) return null;
  return String(u).normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
}
function withNumericVariants(values) {
  const out = new Set();
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const s = String(v);
    out.add(s);              // como string
    const n = Number(s);
    if (!Number.isNaN(n)) out.add(n); // como número si aplica
  }
  return [...out];
}

async function resolveUiCollectionName(db, arg){
  const fallback = 'ui_politica_inventarios';
  if (!arg) return fallback;
  const exists = await db.listCollections({ name: arg }, { nameOnly:true }).hasNext();
  if (exists) return arg;
  writeToLog(`El 4º argumento NO es una colección válida ("${arg}"). Uso default "${fallback}".`);
  return fallback;
}

async function detectarUbicacionesObjetivo(db){
  // 1) ENV directa
  const envUbi = normalizeUbicacion(process.env.UBICACION || '');
  if (envUbi) return [envUbi];

  // 2) cambios_ubicaciones_temp
  const hasCambios = await db.listCollections({ name:'cambios_ubicaciones_temp' }).hasNext();
  if (hasCambios) {
    const cambios = await db.collection('cambios_ubicaciones_temp').find({
      $or: [ { tipo_cambio:'NUEVA' }, { tipo_cambio:'ACTUALIZADA' } ]
    }, { projection:{ ubicacion:1, _id:0 } }).toArray();
    const ubis = [...new Set(cambios.map(c => normalizeUbicacion(c.ubicacion)).filter(Boolean))];
    if (ubis.length) return ubis;
  }

  // 3) temp de P24 (si existe)
  const tempName = process.env.UBIS_TEMP_COLLECTION || 'ubis_a_procesar_temp';
  const hasTemp = await db.listCollections({ name: tempName }).hasNext();
  if (hasTemp) {
    const ubis = (await db.collection(tempName).distinct('Ubicacion'))
      .map(normalizeUbicacion)
      .filter(Boolean);
    if (ubis.length) return ubis;
  }

  // 4) nada -> full run
  return [];
}

// ---------- MERGE HELPERS ----------
async function mergeFuenteIncremental(db, targetCollection, ubicaciones, fuente, prefix, extras=[]) {
  const ubisFilter = withNumericVariants(ubicaciones);
  const pipeline = [
    { $match: { Ubicacion: { $in: ubisFilter } } },
    {
      $lookup: {
        from: fuente,
        let: { sku: "$SKU", ubi: "$Ubicacion" },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ["$SKU", "$$sku"] },
            { $eq: ["$Ubicacion", "$$ubi"] }
          ]}}}
        ],
        as: "joined",
      },
    },
    { $unwind: { path: "$joined", preserveNullAndEmptyArrays: true } },
    {
      $set: Object.assign(
        {
          [`${prefix}_SS`]: "$joined.SS",
          [`${prefix}_Demanda_LT`]: "$joined.Demanda_LT",
          [`${prefix}_MOQ`]: "$joined.MOQ",
          [`${prefix}_ROQ`]: "$joined.ROQ",
          [`${prefix}_ROP`]: "$joined.ROP",
          [`${prefix}_META`]: "$joined.META",
          [`${prefix}_Inventario_Promedio`]: "$joined.Inventario_Promedio",
        },
        extras.length ? {
          [`${prefix}_Vida_Util_Dias`]: "$joined.Vida_Util_Dias",
          [`${prefix}_Tolerancia_Vida_Util_Dias`]: "$joined.Tolerancia_Vida_Util_Dias",
          [`${prefix}_ROP_Alto`]: "$joined.ROP_Alto",
          [`${prefix}_SobreInventario_Dias`]: "$joined.SobreInventario_Dias",
        } : {}
      ),
    },
  ];

  const results = await targetCollection.aggregate(pipeline, { allowDiskUse:true }).toArray();
  if (!results.length) { writeToLog(`Merge ${fuente}: 0 filas`); return; }

  let updated = 0;
  for (const doc of results) {
    const update = {
      $set: Object.assign(
        {
          [`${prefix}_SS`]: doc[`${prefix}_SS`] ?? 0,
          [`${prefix}_Demanda_LT`]: doc[`${prefix}_Demanda_LT`] ?? 0,
          [`${prefix}_MOQ`]: doc[`${prefix}_MOQ`] ?? 0,
          [`${prefix}_ROQ`]: doc[`${prefix}_ROQ`] ?? 0,
          [`${prefix}_ROP`]: doc[`${prefix}_ROP`] ?? 0,
          [`${prefix}_META`]: doc[`${prefix}_META`] ?? 0,
          [`${prefix}_Inventario_Promedio`]: doc[`${prefix}_Inventario_Promedio`] ?? 0,
        },
        extras.length ? {
          [`${prefix}_Vida_Util_Dias`]: doc[`${prefix}_Vida_Util_Dias`] ?? 0,
          [`${prefix}_Tolerancia_Vida_Util_Dias`]: doc[`${prefix}_Tolerancia_Vida_Util_Dias`] ?? 0,
          [`${prefix}_ROP_Alto`]: doc[`${prefix}_ROP_Alto`] ?? "NO",
          [`${prefix}_SobreInventario_Dias`]: doc[`${prefix}_SobreInventario_Dias`] ?? 0,
        } : {}
      )
    };
    const r = await targetCollection.updateOne({ SKU: doc.SKU, Ubicacion: doc.Ubicacion }, update);
    if (r.modifiedCount) updated++;
  }
  writeToLog(`Merge ${fuente}: ${updated} actualizados`);
}

// ---------- MAIN ----------
async function crearTablaPoliticaInventarios() {
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);

    writeToLog('P21 - Iniciando unión de tablas de políticas');

    // Resolver colección UI base de forma segura (evita que "13" sea tomada como colección)
    const uiBase = await resolveUiCollectionName(db, providedUiArg);
    const isMontecarlo = /montecarlo/i.test(uiBase);
    const allPolInvCollectionName = isMontecarlo ? "ui_all_pol_inv_montecarlo" : "ui_all_pol_inv";

    const baseUI = db.collection(uiBase);
    const target  = db.collection(allPolInvCollectionName);

    // Descubrir ubicaciones objetivo
    const ubicaciones = await detectarUbicacionesObjetivo(db);
    const incremental = ubicaciones.length > 0;

    if (incremental) {
      writeToLog(`MODO INCREMENTAL - Ubicaciones: ${ubicaciones.length} [${ubicaciones.join(', ')}]`);

      // Validar existencia de base UI
      const hasUI = await db.listCollections({ name: uiBase }).hasNext();
      if (!hasUI) throw new Error(`La colección base ${uiBase} no existe`);

      const ubisFilter = withNumericVariants(ubicaciones);

      // Obtener base solo de esas ubicaciones
      const baseDocs = await baseUI.find({ Ubicacion: { $in: ubisFilter } }).toArray();
      writeToLog(`Base UI (${uiBase}) fetched: ${baseDocs.length}`);

      if (!baseDocs.length) {
        writeToLog('No hay datos base para esas ubicaciones. Saliendo sin cambios.');
        return;
      }

      // Limpiar en destino SOLO esas ubicaciones
      await target.deleteMany({ Ubicacion: { $in: ubisFilter } });

      // Formatear base (rellenos 0 como en tu script)
      const formatted = baseDocs.map(doc => ({
        ...doc,
        SS_Cantidad: doc.SS_Cantidad ?? 0,
        DC_SS: 0, DC_Demanda_LT: 0, DC_MOQ: 0, DC_ROQ: 0, DC_ROP: 0, DC_META: 0, DC_Inventario_Promedio: 0,
        DC_Vida_Util_Dias: 0, DC_Tolerancia_Vida_Util_Dias: 0, DC_ROP_Alto: "NO", DC_SobreInventario_Dias: 0,
        P_SS: 0, P_Demanda_LT: 0, P_MOQ: 0, P_ROQ: 0, P_ROP: 0, P_META: 0, P_Inventario_Promedio: 0,
        C_SS: 0, C_Demanda_LT: 0, C_MOQ: 0, C_ROQ: 0, C_ROP: 0, C_META: 0, C_Inventario_Promedio: 0,
        U_SS: 0, U_Demanda_LT: 0, U_MOQ: 0, U_ROQ: 0, U_ROP: 0, U_META: 0, U_Inventario_Promedio: 0,
      }));

      // Insertar en lotes
      const BS = 1000;
      for (let i = 0; i < formatted.length; i += BS) {
        const batch = formatted.slice(i, i + BS);
        await target.insertMany(batch);
      }
      writeToLog(`Insertados ${formatted.length} registros base en ${allPolInvCollectionName}`);

      // Merges incrementales
      const mergeSources = [
        { collection: isMontecarlo ? "ui_pol_inv_dias_cobertura_montecarlo" : "ui_pol_inv_dias_cobertura", prefix:"DC",
          extras:["Vida_Util_Dias","Tolerancia_Vida_Util_Dias","ROP_Alto","SobreInventario_Dias"] },
        { collection: "ui_pol_inv_pallets", prefix:"P" },
        { collection: isMontecarlo ? "ui_pol_inv_costo_montecarlo" : "ui_pol_inv_costo", prefix:"C" },
        { collection: "ui_pol_inv_uom", prefix:"U" },
      ];

      for (const {collection, prefix, extras=[]} of mergeSources) {
        const exists = await db.listCollections({ name: collection }).hasNext();
        if (!exists) { writeToLog(`Colección ${collection} no existe, se omite merge.`); continue; }
        await mergeFuenteIncremental(db, target, ubicaciones, collection, prefix, extras);
      }

      // Resumen
      const totalFinal = await target.countDocuments({ Ubicacion: { $in: ubisFilter } });
      const ubicacionesTotales = await target.distinct('Ubicacion', { Ubicacion: { $in: ubisFilter } });
      writeToLog(`FINAL incremental ${allPolInvCollectionName}: total=${totalFinal}, ubicaciones=${ubicacionesTotales.length}`);

    } else {
      writeToLog('MODO COMPLETO - Reemplazando todas las políticas');

      const hasUI = await db.listCollections({ name: uiBase }).hasNext();
      if (!hasUI) throw new Error(`La colección base ${uiBase} no existe`);

      await target.deleteMany({});
      writeToLog(`Tabla ${allPolInvCollectionName} limpiada`);

      const baseDocs = await baseUI.find().toArray();
      writeToLog(`Base UI (${uiBase}) fetched: ${baseDocs.length}`);
      if (!baseDocs.length) { writeToLog('No hay datos base. Saliendo.'); return; }

      const formatted = baseDocs.map(doc => ({
        ...doc,
        SS_Cantidad: doc.SS_Cantidad ?? 0,
        DC_SS: 0, DC_Demanda_LT: 0, DC_MOQ: 0, DC_ROQ: 0, DC_ROP: 0, DC_META: 0, DC_Inventario_Promedio: 0,
        DC_Vida_Util_Dias: 0, DC_Tolerancia_Vida_Util_Dias: 0, DC_ROP_Alto: "NO", DC_SobreInventario_Dias: 0,
        P_SS: 0, P_Demanda_LT: 0, P_MOQ: 0, P_ROQ: 0, P_ROP: 0, P_META: 0, P_Inventario_Promedio: 0,
        C_SS: 0, C_Demanda_LT: 0, C_MOQ: 0, C_ROQ: 0, C_ROP: 0, C_META: 0, C_Inventario_Promedio: 0,
        U_SS: 0, U_Demanda_LT: 0, U_MOQ: 0, U_ROQ: 0, U_ROP: 0, U_META: 0, U_Inventario_Promedio: 0,
      }));

      const BS = 1000;
      for (let i = 0; i < formatted.length; i += BS) {
        const batch = formatted.slice(i, i + BS);
        await target.insertMany(batch);
      }
      writeToLog(`Insertados ${formatted.length} registros en ${allPolInvCollectionName}`);

      // Merges completos
      const mergeSources = [
        { collection: isMontecarlo ? "ui_pol_inv_dias_cobertura_montecarlo" : "ui_pol_inv_dias_cobertura", prefix:"DC",
          extras:["Vida_Util_Dias","Tolerancia_Vida_Util_Dias","ROP_Alto","SobreInventario_Dias"] },
        { collection: "ui_pol_inv_pallets", prefix:"P" },
        { collection: isMontecarlo ? "ui_pol_inv_costo_montecarlo" : "ui_pol_inv_costo", prefix:"C" },
        { collection: "ui_pol_inv_uom", prefix:"U" },
      ];
      for (const {collection, prefix, extras=[]} of mergeSources) {
        const exists = await db.listCollections({ name: collection }).hasNext();
        if (!exists) { writeToLog(`Colección ${collection} no existe, se omite merge.`); continue; }
        await mergeFuenteIncremental(db, target, [], collection, prefix, extras); // [] -> no filtra, mergea todo
      }

      const totalFinal = await target.countDocuments();
      const ubicacionesTotales = await target.distinct('Ubicacion');
      writeToLog(`FINAL completo ${allPolInvCollectionName}: total=${totalFinal}, ubicaciones=${ubicacionesTotales.length}`);
    }

    writeToLog('P21 completado exitosamente');
  } catch (err) {
    writeToLog(`Error en P21: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    try { await client.close(); } catch {}
  }
}

// ---------- RUN ----------
if (require.main === module) {
  crearTablaPoliticaInventarios()
    .then(() => { writeToLog('🎉 Script completado exitosamente'); process.exit(0); })
    .catch((err) => { writeToLog(`💥 Script falló: ${err.message}`); process.exit(1); });
}
