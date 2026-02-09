const path = require('path');
const fs = require("fs");
const { MongoClient } = require("mongodb");
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const providedCollectionArg = process.argv[5]; // OJO: puede venir una Ubicación desde P24

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

// Log setup
function nowStr() { return moment().format("YYYY-MM-DD HH:mm:ss"); }
function writeToLog(message) {
  const timestamp = nowStr();
  let parametroFolder = 'DEFAULT';
  try {
    const partes = (dbName || '').split('_');
    let parte = partes[partes.length - 1] || '';
    if (/^\d{12,}$/.test(parte)) parte = partes[partes.length - 2] || parte;
    parametroFolder = (parte || 'DEFAULT').toUpperCase();
  } catch {}
  const realLogFile = path.resolve(__dirname, `../../${parametroFolder}/log/ClasABCD_PolInvent.log`);
  try {
    fs.mkdirSync(path.dirname(realLogFile), { recursive: true });
    fs.appendFileSync(realLogFile, `[${timestamp}] ${message}\n`);
  } catch (e) {
    console.error(`LOG FALLBACK: ${message}`);
  }
}

function normalizeUbicacion(u) {
  if (u == null) return null;
  return String(u).normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
}

function formatearNumero(numero) {
  const n = Number(numero);
  if (!isNaN(n)) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }
  return 0;
}

function formatearNumero2(numero) {
  const n = Number(numero);
  if (!isNaN(n)) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  return 0;
}

async function resolveBaseCollectionName(db) {
  const defaultName = 'politica_inventarios_01';
  if (!providedCollectionArg) return defaultName;

  // ¿Existe realmente una colección con ese nombre?
  const cur = db.listCollections({ name: providedCollectionArg }, { nameOnly: true });
  const exists = await cur.hasNext();
  if (exists) return providedCollectionArg;

  // Si no existe, probablemente era una Ubicación enviada por P24; usa default
  writeToLog(`P16: el 4º argumento no es una colección válida ("${providedCollectionArg}"). Uso default "${defaultName}".`);
  return defaultName;
}

async function copiarDatos() {
  writeToLog(`\nPaso 16 - Formateo de las Tablas Finales para mostrar en UI`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    // 1) Resolver colección base de forma segura
    const baseCollectionName = await resolveBaseCollectionName(db);
    const baseColl = db.collection(baseCollectionName);

    // 2) UI destino según "montecarlo"
    const finalCollectionName = /montecarlo/i.test(baseCollectionName)
      ? 'ui_politica_inventarios_montecarlo'
      : 'ui_politica_inventarios';
    const finalColl = db.collection(finalCollectionName);

    writeToLog(`Colección base: ${baseCollectionName}`);
    writeToLog(`Colección final: ${finalCollectionName}`);

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
      } catch { /* temp puede no existir en full-run */ }
    }

    // ====== MODO FULL-RUN (retrocompatible) ======
    if (ubicacionesObjetivo.length === 0) {
      writeToLog(`P16: modo FULL-RUN (sin UBICACION ni temp). Borrando toda la UI y copiando TODO como antes.`);

      await finalColl.deleteMany({}); // igual que tu código original

      // Copia completa desde la base
      const cursor = baseColl.find(); // MISMA semántica que tu P16 original (sin filtro Es_Actual)
      const batch = [];
      const BATCH_SIZE = 2000;
      let insertedTotal = 0;

      while (await cursor.hasNext()) {
        const d = await cursor.next();
        const out = {
          ...d,
          Valor_Z: formatearNumero(d.Valor_Z),
          Demanda_Promedio_Diaria: formatearNumero(d.Demanda_Promedio_Diaria),
          Variabilidad_Demanda_Cantidad: formatearNumero(d.Variabilidad_Demanda_Cantidad),
          DS_Demanda: formatearNumero(d.DS_Demanda),
          Prom_LT: formatearNumero(d.Prom_LT),
          DS_LT: formatearNumero(d.DS_LT),
          SS_Cantidad: formatearNumero(d.SS_Cantidad),
          Demanda_LT: formatearNumero2(d.Demanda_LT),
          MOQ: formatearNumero2(d.MOQ),
          ROQ: formatearNumero2(d.ROQ),
          ROP: formatearNumero2(d.ROP),
          META: formatearNumero(d.META),
          Inventario_Promedio: formatearNumero2(d.Inventario_Promedio),
          STAT_SS: formatearNumero2(d.STAT_SS),
        };
        batch.push(out);
        if (batch.length >= BATCH_SIZE) {
          await finalColl.insertMany(batch);
          insertedTotal += batch.length;
          batch.length = 0;
        }
      }
      if (batch.length) {
        await finalColl.insertMany(batch);
        insertedTotal += batch.length;
      }
      writeToLog(`P16 FULL-RUN: insertados ${insertedTotal} documentos en ${finalCollectionName}.`);
      return;
    }

    // ====== MODO INCREMENTAL (por ubicación) ======
    writeToLog(`P16: modo INCREMENTAL. Ubicaciones objetivo: ${ubicacionesObjetivo.length} [${ubicacionesObjetivo.join(', ')}]`);

    // Borra solo esas ubicaciones en la UI
    await finalColl.deleteMany({ Ubicacion: { $in: ubicacionesObjetivo } });

    // Trae solo Es_Actual de esas ubicaciones (si tu semántica lo requiere)
    const filtroBase = { Ubicacion: { $in: ubicacionesObjetivo }, Es_Actual: true };
    const nCandidatos = await baseColl.countDocuments(filtroBase);
    if (nCandidatos === 0) {
      writeToLog('P16: 0 candidatos para estas ubicaciones; nada que insertar.');
      return;
    }

    const cursor = baseColl.find(filtroBase);
    const batch = [];
    const BATCH_SIZE = 2000;
    let insertedTotal = 0;

    while (await cursor.hasNext()) {
      const d = await cursor.next();
      const out = {
        ...d,
        Valor_Z: formatearNumero(d.Valor_Z),
        Demanda_Promedio_Diaria: formatearNumero(d.Demanda_Promedio_Diaria),
        Variabilidad_Demanda_Cantidad: formatearNumero(d.Variabilidad_Demanda_Cantidad),
        DS_Demanda: formatearNumero(d.DS_Demanda),
        Prom_LT: formatearNumero(d.Prom_LT),
        DS_LT: formatearNumero(d.DS_LT),
        SS_Cantidad: formatearNumero(d.SS_Cantidad),
        Demanda_LT: formatearNumero2(d.Demanda_LT),
        MOQ: formatearNumero2(d.MOQ),
        ROQ: formatearNumero2(d.ROQ),
        ROP: formatearNumero2(d.ROP),
        META: formatearNumero(d.META),
        Inventario_Promedio: formatearNumero2(d.Inventario_Promedio),
        STAT_SS: formatearNumero2(d.STAT_SS),
      };
      batch.push(out);
      if (batch.length >= BATCH_SIZE) {
        await finalColl.insertMany(batch);
        insertedTotal += batch.length;
        batch.length = 0;
      }
    }
    if (batch.length) {
      await finalColl.insertMany(batch);
      insertedTotal += batch.length;
    }

    writeToLog(`P16 INCREMENTAL: insertados ${insertedTotal} documentos en ${finalCollectionName} para ${ubicacionesObjetivo.length} ubicación(es).`);
  } catch (error) {
    writeToLog(`${nowStr()} - [ERROR] ${error.message}`);
  } finally {
    if (client) try { await client.close(); } catch {}
  }
}

copiarDatos();
