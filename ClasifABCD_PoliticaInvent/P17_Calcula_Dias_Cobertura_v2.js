const path = require('path');
const fs = require("fs");
const MongoClient = require("mongodb").MongoClient;
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const providedCollectionArg = process.argv[5]; // OJO: a veces P24 manda aquí la UBICACION

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

// --------- LOG ----------
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

// --------- UTILS ----------
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
  writeToLog(`P17: el 4º argumento no es colección válida ("${providedCollectionArg}"). Uso default "${defaultName}".`);
  return defaultName;
}

// --------- MAIN ----------
async function calcularDiasCobertura() {
  writeToLog(`\nPaso 17 - Transforamación de datos de salida a días de cobertura`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    // 1) Resolver colección base de forma segura
    const collectionName = await resolveBaseCollectionName(db);
    const inventarios01Collection = db.collection(collectionName);

    // 2) Definir colección destino (UI de días)
    const targetCollectionName = /montecarlo/i.test(collectionName)
      ? "ui_pol_inv_dias_cobertura_montecarlo"
      : "ui_pol_inv_dias_cobertura";
    const diasCoberturaCollection = db.collection(targetCollectionName);

    // 3) Detectar modo: incremental vs full-run
    const envUbi = normalizeUbicacion(process.env.UBICACION || '');
    const tempName = process.env.UBIS_TEMP_COLLECTION || 'ubis_a_procesar_temp';

    let ubicacionesObjetivo = [];
    if (envUbi) {
      ubicacionesObjetivo = [envUbi];
    } else {
      // si hay temp (P24), úsala; si no existe, se queda vacío => full-run
      try {
        ubicacionesObjetivo = (await db.collection(tempName).distinct('Ubicacion'))
          .map(normalizeUbicacion)
          .filter(Boolean);
      } catch { ubicacionesObjetivo = []; }
    }

    // 4) Filtro de lectura y borrado previo en destino
    let filtroBase = {};
    if (ubicacionesObjetivo.length === 0) {
      writeToLog('P17: modo FULL-RUN (sin UBICACION ni temp). Se borrará toda la colección destino antes de insertar.');
      await diasCoberturaCollection.deleteMany({});
    } else {
      writeToLog(`P17: modo INCREMENTAL. Ubicaciones objetivo: ${ubicacionesObjetivo.length} [${ubicacionesObjetivo.join(', ')}]`);
      const ubisFilter = withNumericVariants(ubicacionesObjetivo);
      filtroBase = { Ubicacion: { $in: ubisFilter } };
      await diasCoberturaCollection.deleteMany({ Ubicacion: { $in: ubisFilter } });
    }

    // 5) Contar candidatos para evitar lotes vacíos
    const nCandidatos = await inventarios01Collection.countDocuments(filtroBase);
    if (nCandidatos === 0) {
      writeToLog('P17: 0 candidatos para calcular días de cobertura; nada que insertar.');
      return;
    }

    // 6) Cursor, transformar y escribir por lotes
    const cursor = inventarios01Collection.find(filtroBase).sort({ Ubicacion: 1, Producto: 1 });
    const BATCH_SIZE = 2000;
    const batch = [];
    let insertedTotal = 0;

    while (await cursor.hasNext()) {
      const inventario = await cursor.next();
      const dmd = Number(inventario.Demanda_Promedio_Diaria) || 0;

      const toDays = (value) => dmd === 0 ? -1 : Math.ceil((Number(value) || 0) / dmd);

      const doc = {
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

        SS: toDays(inventario.SS_Cantidad),
        Demanda_LT: toDays(inventario.Demanda_LT),
        MOQ: toDays(inventario.MOQ),
        ROQ: toDays(inventario.ROQ),
        ROP: toDays(inventario.ROP),
        META: toDays(inventario.META),
        Inventario_Promedio: toDays(inventario.Inventario_Promedio),

        Vida_Util_Dias: 0,
        Tolerancia_Vida_Util_Dias: 0,
        ROP_Alto: " ",
        SobreInventario_Dias: 0,
      };

      batch.push(doc);
      if (batch.length >= BATCH_SIZE) {
        await diasCoberturaCollection.insertMany(batch);
        insertedTotal += batch.length;
        batch.length = 0;
      }
    }

    if (batch.length > 0) {
      await diasCoberturaCollection.insertMany(batch);
      insertedTotal += batch.length;
    } else if (insertedTotal === 0) {
      writeToLog('P17: no se generaron documentos (0). Se evita insertMany vacío.');
      return;
    }

    writeToLog(`\tTermina la Transforamación a días de cobertura. Insertados ${insertedTotal} docs en ${targetCollectionName}.`);
    console.log("Los datos de días de cobertura se han calculado y guardado correctamente.");
  } catch (error) {
    writeToLog(`${nowStr()} - [ERROR] ${error.message}`);
  } finally {
    // cierra conexión si existe
    try { if (client) await client.close(); } catch {}
  }
}

calcularDiasCobertura();
