const path = require('path');
const fs = require("fs");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const providedCollectionArg = process.argv[5]; // ¡ojo! a veces P24 mete aquí la Ubicación

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

// ---------- LOG ----------
function nowStr(){ return moment().format("YYYY-MM-DD HH:mm:ss"); }
function writeToLog(message) {
  const timestamp = nowStr();
  let parametroFolder = 'DEFAULT';
  try {
    const partes = (dbName || '').split("_");
    let parte = partes[partes.length - 1] || '';
    if (/^\d{12,}$/.test(parte)) parte = partes[partes.length - 2] || parte;
    parametroFolder = (parte || 'DEFAULT').toUpperCase();
  } catch {}
  const realLogFile = path.resolve(__dirname, `../../${parametroFolder}/log/ClasABCD_PolInvent.log`);
  try {
    fs.mkdirSync(path.dirname(realLogFile), { recursive: true });
    fs.appendFileSync(realLogFile, `[${timestamp}] ${message}\n`);
  } catch { console.log(`[${timestamp}] ${message}`); }
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
    out.add(s); // string
    const n = Number(s);
    if (!Number.isNaN(n)) out.add(n); // num si aplica
  }
  return [...out];
}
async function resolveBaseCollectionName(db) {
  const defaultName = 'politica_inventarios_01';
  if (!providedCollectionArg) return defaultName;
  const cur = db.listCollections({ name: providedCollectionArg }, { nameOnly: true });
  const exists = await cur.hasNext();
  if (exists) return providedCollectionArg;
  writeToLog(`P18: el 4º argumento no es una colección válida ("${providedCollectionArg}"). Uso default "${defaultName}".`);
  return defaultName;
}

// ---------- MAIN ----------
async function calcularPallets() {
  writeToLog(`\nPaso 18 - Transforamación de datos de salida a pallets`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    // 1) Colección base segura
    const collectionName = await resolveBaseCollectionName(db);
    const baseColl = db.collection(collectionName);

    // 2) Destino (si fuera montecarlo, cambia nombre)
    const targetName = /montecarlo/i.test(collectionName)
      ? "ui_pol_inv_pallets_montecarlo"
      : "ui_pol_inv_pallets";
    const palletsColl = db.collection(targetName);

    // 3) Detectar modo (incremental vs full-run)
    const envUbi = normalizeUbicacion(process.env.UBICACION || '');
    const tempName = process.env.UBIS_TEMP_COLLECTION || 'ubis_a_procesar_temp';

    let ubicacionesObjetivo = [];
    if (envUbi) {
      ubicacionesObjetivo = [envUbi];
    } else {
      try {
        ubicacionesObjetivo = (await db.collection(tempName).distinct('Ubicacion'))
          .map(normalizeUbicacion)
          .filter(Boolean);
      } catch { ubicacionesObjetivo = []; }
    }

    // 4) Armar pipeline con filtro (si aplica) + lookup
    const pipeline = [];
    let ubisFilter = null;

    if (ubicacionesObjetivo.length === 0) {
      writeToLog(`P18: modo FULL-RUN (sin UBICACION ni temp). Se borrará toda la colección destino.`);
      await palletsColl.deleteMany({});
    } else {
      writeToLog(`P18: modo INCREMENTAL. Ubicaciones: ${ubicacionesObjetivo.length} [${ubicacionesObjetivo.join(', ')}]`);
      ubisFilter = withNumericVariants(ubicacionesObjetivo);
      pipeline.push({ $match: { Ubicacion: { $in: ubisFilter } } });
      await palletsColl.deleteMany({ Ubicacion: { $in: ubisFilter } });
    }

    pipeline.push(
      {
        $lookup: {
          from: "sku",
          localField: "SKU",
          foreignField: "SKU",
          as: "skuData",
        },
      },
      { $unwind: "$skuData" },
      { $sort: { Ubicacion: 1, Producto: 1 } }
    );

    // 5) Ejecutar aggregate
    const joinResult = await baseColl.aggregate(pipeline, { allowDiskUse: true }).toArray();
    const total = joinResult.length;
    if (total === 0) {
      writeToLog('P18: 0 registros para pallets; se evita insertMany vacío.');
      return;
    }

    // 6) Transformar y escribir por lotes
    const BATCH_SIZE = 2000;
    const batch = [];
    let insertedTotal = 0;

    for (const inventario of joinResult) {
      const unidadesPallet = Number(inventario?.skuData?.Unidades_Pallet) || 1;
      const toPallets = (v) => Math.ceil((Number(v) || 0) / unidadesPallet);

      batch.push({
        Tipo_Calendario: "Dia",
        SKU: inventario.SKU,
        Producto: inventario.Producto,
        Desc_Producto: inventario.Desc_Producto,
        Familia_Producto: inventario.Familia_Producto,
        Categoria: inventario.Categoria,
        Segmentacion_Producto: inventario.Segmentacion_Producto,
        Presentacion: inventario.Presentacion,
        Ubicacion: inventario.Ubicacion,
        Desc_Ubicacion: inventario.Desc_Ubicacion,
        SS: toPallets(inventario.SS_Cantidad),
        Demanda_LT: toPallets(inventario.Demanda_LT),
        MOQ: toPallets(inventario.MOQ),
        ROQ: toPallets(inventario.ROQ),
        ROP: toPallets(inventario.ROP),
        META: toPallets(inventario.META),
        Inventario_Promedio: toPallets(inventario.Inventario_Promedio),
      });

      if (batch.length >= BATCH_SIZE) {
        await palletsColl.insertMany(batch);
        insertedTotal += batch.length;
        batch.length = 0;
      }
    }

    if (batch.length > 0) {
      await palletsColl.insertMany(batch);
      insertedTotal += batch.length;
    }

    writeToLog(`P18: insertados ${insertedTotal} documentos en ${targetName}. (joinResult=${total})`);
  } catch (error) {
    writeToLog(`${nowStr()} - [ERROR] ${error.message}`);
  } finally {
    try { if (client) await client.close(); } catch {}
  }
}

calcularPallets();
