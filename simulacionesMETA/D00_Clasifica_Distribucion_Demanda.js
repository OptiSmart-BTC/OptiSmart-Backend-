/**
 * D00_Clasifica_Distribucion_Demanda.js
 *
 * Clasifica la distribución de demanda diaria por SKU (Ubicacion + Producto)
 * usando como universo base los SKUs de ui_all_pol_inv.
 *
 * Clasificaciones:
 *   - NO_HISTORY : no existe histórico para el SKU
 *   - ZERO_ONLY  : sí existe histórico, pero toda la serie está en cero
 *   - ZINB       : p0 >= 0.30
 *   - NB         : p0 < 0.30 y variance >= 1.2 * mu
 *   - POISSON    : p0 < 0.30 y variance < 1.2 * mu
 *
 * INPUTS:
 *   - historico_demanda
 *   - ui_all_pol_inv
 *
 * OUTPUT:
 *   - distribucion_demanda_diaria
 *
 * Uso:
 *   node D00_Clasifica_Distribucion_Demanda.js <dbName>
 *
 * Ejemplo:
 *   node D00_Clasifica_Distribucion_Demanda.js btc_opti_lol
 */

const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";

const HIST_COLLECTION = "historico_demanda";
const POLICY_COLLECTION = "ui_all_pol_inv";
const OUTPUT_COLLECTION = "distribucion_demanda_diaria";

function normPart(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function buildKey(ubicacion, producto) {
  const u = normPart(ubicacion);
  const p = normPart(producto);
  if (!u || !p) return null;
  return `${u}_${p}`;
}

function parsePolicySku(sku) {
  const s = normPart(sku);
  if (!s) return null;

  // Formato típico en ui_all_pol_inv: Producto@Ubicacion
  if (s.includes("@")) {
    const parts = s.split("@");
    if (parts.length === 2) {
      const producto = normPart(parts[0]);
      const ubicacion = normPart(parts[1]);
      if (ubicacion && producto) {
        return {
          key: `${ubicacion}_${producto}`,
          Ubicacion: ubicacion,
          Producto: producto,
        };
      }
    }
  }

  // Formato alterno: Ubicacion_Producto
  if (s.includes("_")) {
    const parts = s.split("_");
    if (parts.length === 2) {
      const ubicacion = normPart(parts[0]);
      const producto = normPart(parts[1]);
      if (ubicacion && producto) {
        return {
          key: `${ubicacion}_${producto}`,
          Ubicacion: ubicacion,
          Producto: producto,
        };
      }
    }
  }

  return null;
}

function normalizeDate(value) {
  if (!value) return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    // dd/mm/yyyy
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]) - 1;
      const year = Number(match[3]);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }
    }

    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }

  if (typeof value === "number") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }

  return null;
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function diffDaysInclusive(start, end) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((end - start) / msPerDay) + 1;
}

function mean(arr) {
  if (!arr.length) return 0;
  let sum = 0;
  for (const x of arr) sum += x;
  return sum / arr.length;
}

function variancePopulation(arr, mu) {
  if (!arr.length) return 0;
  let sumSq = 0;
  for (const x of arr) {
    const diff = x - mu;
    sumSq += diff * diff;
  }
  return sumSq / arr.length;
}

function classifyDistribution({ hasHistory, mu, variance, p0, totalDemand }) {
  if (!hasHistory) return "NO_HISTORY";
  if (totalDemand === 0) return "ZERO_ONLY";
  if (p0 >= 0.30) return "ZINB";
  if (variance >= 1.2 * mu) return "NB";
  return "POISSON";
}

async function main() {
  const dbName = process.argv[2];

  if (!dbName) {
    console.error("Uso: node D00_Clasifica_Distribucion_Demanda.js <dbName>");
    process.exit(1);
  }

  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(dbName);

    const historico = db.collection(HIST_COLLECTION);
    const policyCol = db.collection(POLICY_COLLECTION);
    const output = db.collection(OUTPUT_COLLECTION);

    console.log(`Conectado a DB: ${dbName}`);
    console.log(`Leyendo histórico: ${HIST_COLLECTION}`);
    console.log(`Leyendo universo base desde políticas: ${POLICY_COLLECTION}`);
    console.log(`Escribiendo resultados en: ${OUTPUT_COLLECTION}`);

    const totalHist = await historico.countDocuments();
    const totalPolicies = await policyCol.countDocuments();

    console.log(`Total registros en histórico: ${totalHist}`);
    console.log(`Total registros en políticas: ${totalPolicies}`);

    if (totalPolicies === 0) {
      console.log("La colección ui_all_pol_inv está vacía. No hay SKUs base para clasificar.");
      return;
    }

    // =====================================================
    // 1) Construir universo base de SKUs desde ui_all_pol_inv
    // =====================================================
    const policyCursor = policyCol.find(
      { $or: [{ Ignorado: { $exists: false } }, { Ignorado: { $ne: 1 } }] },
      {
        projection: {
          SKU: 1,
          Ubicacion: 1,
          Producto: 1,
          Ignorado: 1,
        },
      }
    );

    const policySkuMap = new Map();
    let policyRead = 0;
    let policyInvalid = 0;

    while (await policyCursor.hasNext()) {
      const doc = await policyCursor.next();
      policyRead++;

      let key = buildKey(doc?.Ubicacion, doc?.Producto);
      let ubicacion = normPart(doc?.Ubicacion);
      let producto = normPart(doc?.Producto);

      if (!key) {
        const parsed = parsePolicySku(doc?.SKU);
        if (parsed) {
          key = parsed.key;
          ubicacion = parsed.Ubicacion;
          producto = parsed.Producto;
        }
      }

      if (!key) {
        policyInvalid++;
        continue;
      }

      if (!policySkuMap.has(key)) {
        policySkuMap.set(key, {
          SKU: key,
          Ubicacion: ubicacion,
          Producto: producto,
        });
      }
    }

    console.log(`Registros de políticas leídos: ${policyRead}`);
    console.log(`Registros de políticas inválidos/omitidos: ${policyInvalid}`);
    console.log(`SKUs únicos base desde políticas: ${policySkuMap.size}`);

    if (policySkuMap.size === 0) {
      console.log("No se pudo construir ningún SKU base desde ui_all_pol_inv.");
      return;
    }

    // =====================================================
    // 2) Leer histórico y agrupar demanda diaria por key
    // =====================================================
    const histCursor = historico.find(
      {},
      {
        projection: {
          Ubicacion: 1,
          Producto: 1,
          Fecha: 1,
          Cantidad: 1,
        },
      }
    );

    const histMap = new Map();
    let histRead = 0;
    let histInvalid = 0;

    while (await histCursor.hasNext()) {
      const doc = await histCursor.next();
      histRead++;

      const ubicacion = normPart(doc?.Ubicacion);
      const producto = normPart(doc?.Producto);
      const fecha = normalizeDate(doc?.Fecha);
      const cantidad = Number(doc?.Cantidad ?? 0);

      const key = buildKey(ubicacion, producto);

      if (!key || !fecha || Number.isNaN(cantidad)) {
        histInvalid++;
        continue;
      }

      if (!histMap.has(key)) {
        histMap.set(key, {
          dailyMap: new Map(),
          minDate: fecha,
          maxDate: fecha,
        });
      }

      const entry = histMap.get(key);
      const dayKey = formatDateKey(fecha);

      entry.dailyMap.set(dayKey, (entry.dailyMap.get(dayKey) || 0) + cantidad);

      if (fecha < entry.minDate) entry.minDate = fecha;
      if (fecha > entry.maxDate) entry.maxDate = fecha;

      if (histRead % 50000 === 0) {
        console.log(`Procesados ${histRead} registros del histórico...`);
      }
    }

    console.log(`Registros históricos leídos: ${histRead}`);
    console.log(`Registros históricos inválidos omitidos: ${histInvalid}`);
    console.log(`SKUs con histórico encontrado: ${histMap.size}`);

    // =====================================================
    // 3) Clasificar TODOS los SKUs base, pero sin calendario global
    // =====================================================
    const results = [];
    let processedSkus = 0;
    let withHistory = 0;
    let withoutHistory = 0;

    for (const [, baseSku] of policySkuMap) {
      const { SKU, Ubicacion, Producto } = baseSku;

      const histEntry = histMap.get(SKU) || null;

      const hasHistory = !!histEntry;
      if (hasHistory) withHistory++;
      else withoutHistory++;

      let nDays = 0;
      let zeroDays = 0;
      let mu = 0;
      let variance = 0;
      let p0 = 1;
      let totalDemand = 0;
      let fechaInicio = null;
      let fechaFin = null;

      if (hasHistory) {
        const { dailyMap, minDate, maxDate } = histEntry;
        fechaInicio = minDate;
        fechaFin = maxDate;
        nDays = diffDaysInclusive(minDate, maxDate);

        const series = [];

        for (
          let d = new Date(minDate.getTime());
          d <= maxDate;
          d.setDate(d.getDate() + 1)
        ) {
          const dayKey = formatDateKey(d);
          const qty = Number(dailyMap.get(dayKey) || 0);
          series.push(qty);
          totalDemand += qty;
          if (qty === 0) zeroDays++;
        }

        mu = mean(series);
        variance = variancePopulation(series, mu);
        p0 = nDays > 0 ? zeroDays / nDays : 1;
      }

      const distribucion = classifyDistribution({
        hasHistory,
        mu,
        variance,
        p0,
        totalDemand,
      });

      let poissonLambda = null;
      let nb_n = null;
      let nb_p = null;

      if (distribucion === "POISSON") {
        poissonLambda = mu;
      } else if (distribucion === "NB" || distribucion === "ZINB") {
        if (variance > mu && mu > 0) {
          nb_n = (mu * mu) / (variance - mu);
          nb_p = nb_n / (nb_n + mu);

          if (!Number.isFinite(nb_n) || nb_n <= 0) nb_n = null;
          if (!Number.isFinite(nb_p) || nb_p <= 0 || nb_p >= 1) nb_p = null;
        }
      }

      results.push({
        SKU,
        Ubicacion,
        Producto,

        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        n_dias: nDays,
        dias_con_cero: zeroDays,

        mu,
        variance,
        p0,
        total_demand: totalDemand,
        distribucion,

        parametros: {
          lambda: poissonLambda,
          nb_n,
          nb_p,
        },

        metadata: {
          tiene_historico: hasHistory,
          horizonte_global: false,
          source_policy_universe: POLICY_COLLECTION,
          source_history: HIST_COLLECTION,
        },

        creado_en: new Date(),
      });

      processedSkus++;
      if (processedSkus % 1000 === 0) {
        console.log(`Clasificados ${processedSkus} SKUs...`);
      }
    }

    console.log(`SKUs clasificados con histórico: ${withHistory}`);
    console.log(`SKUs clasificados sin histórico: ${withoutHistory}`);
    console.log(`Total resultados a guardar: ${results.length}`);

    // =====================================================
    // 4) Reemplazar solo esta colección nueva
    // =====================================================
    await output.drop().catch(() => null);

    if (results.length > 0) {
      const chunkSize = 1000;

      for (let i = 0; i < results.length; i += chunkSize) {
        const chunk = results.slice(i, i + chunkSize);
        await output.insertMany(chunk, { ordered: false });
        console.log(
          `Insertados ${Math.min(i + chunk.length, results.length)} / ${results.length} resultados...`
        );
      }

      await output.createIndex({ SKU: 1 }, { unique: true });
      await output.createIndex({ Ubicacion: 1, Producto: 1 });
      await output.createIndex({ distribucion: 1 });
      await output.createIndex({ "metadata.tiene_historico": 1 });
    }

    // =====================================================
    // 5) Resumen
    // =====================================================
    const resumen = await output
      .aggregate([
        {
          $group: {
            _id: "$distribucion",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ])
      .toArray();

    const resumenHistorico = await output
      .aggregate([
        {
          $group: {
            _id: "$metadata.tiene_historico",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ])
      .toArray();

    console.log("Resumen de clasificación:");
    for (const r of resumen) {
      console.log(` - ${r._id}: ${r.count}`);
    }

    console.log("Resumen por cobertura histórica:");
    for (const r of resumenHistorico) {
      console.log(` - tiene_historico=${r._id}: ${r.count}`);
    }

    console.log("Proceso terminado correctamente.");
    console.log(
      `La colección "${OUTPUT_COLLECTION}" fue creada/actualizada sin afectar otras colecciones.`
    );
  } catch (error) {
    console.error("Error en D00_Clasifica_Distribucion_Demanda.js:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();