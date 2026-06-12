/**
 * run_montecarlo_meta.js
 *
 * Monte Carlo META usando distribucion_demanda_diaria:
 * - Servicio = Cycle Service Level (% de ciclos sin stockout)
 * - Score compuesto configurable SIN fill rate
 * - Nuevo componente: severidad de faltante vs demanda
 * - Limpia resultados_simulaciones antes de insertar
 * - Paraleliza CPU con worker_threads
 * - Cachea evaluaciones por SKU
 * - Usa distribuciones de demanda clasificadas por SKU:
 *      NO_HISTORY / ZERO_ONLY / ZINB / NB / POISSON
 * - Fallback robusto a normal truncada cuando aplique
 *
 * Uso:
 *   node run_montecarlo_meta.js <parametroUsuario>
 */

const { MongoClient } = require("mongodb");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { isMainThread, Worker, parentPort } = require("worker_threads");

// =============================
// CONFIG PRINCIPAL
// =============================
const CFG = {
  nReplications: 200,
  coarseReplications: 40,
  horizonDays: 6000,

  kStdClamp: 2,
  minMeta: 0,
  maxMeta: 1e9,
  rounding: "round",

  numWorkers: Math.min(Math.max(os.cpus().length - 1, 2), 8),
  bulkFlushSize: 500,

  exportCsv: false,
  cleanResultsCollection: true,

  scoring: {
    weights: {
      service: 0.55,
      shortage: 0.3,
      overstock: 0.15,
    },
    serviceTolerance: 0.1,
    topKCoarse: 4,
    penalizeMetaFarAboveNeed: true,
  },
};

// =============================
// Colecciones
// =============================
const POLICY_COLLECTION = "ui_all_pol_inv";
const RESULTS_COLLECTION = "resultados_simulaciones";
const DISTRIBUTION_COLLECTION = "distribucion_demanda_diaria";

// =============================
// Helpers generales
// =============================
function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function normalizeServiceLevel(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  if (v > 1.0001) return v / 100;
  return v;
}

function normPart(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function buildUbicacionProductoKey(ubicacion, producto) {
  const u = normPart(ubicacion);
  const p = normPart(producto);
  if (!u || !p) return null;
  return `${u}_${p}`;
}

function parsePolicySkuToKey(sku) {
  const s = normPart(sku);
  if (!s) return null;

  // Formato ui_all_pol_inv: Producto@Ubicacion
  if (s.includes("@")) {
    const parts = s.split("@");
    if (parts.length === 2) {
      const producto = normPart(parts[0]);
      const ubicacion = normPart(parts[1]);
      if (ubicacion && producto) return `${ubicacion}_${producto}`;
    }
  }

  // Formato alterno: Ubicacion_Producto
  if (s.includes("_")) {
    const parts = s.split("_");
    if (parts.length === 2) {
      const ubicacion = normPart(parts[0]);
      const producto = normPart(parts[1]);
      if (ubicacion && producto) return `${ubicacion}_${producto}`;
    }
  }

  return null;
}

function uniqueSortedNumbers(values) {
  return [
    ...new Set(
      values.filter((x) => Number.isFinite(x)).map((x) => Math.round(x)),
    ),
  ]
    .map((x) => Math.max(0, x))
    .sort((a, b) => a - b);
}

// =============================
// Decrypt directo con Java
// =============================
function decryptData(value) {
  const repoRoot = path.resolve(__dirname, "..");
  const input = String(value ?? "").trim();

  console.log(
    `[DeCriptaPassAppDb] Ejecutando: java -cp ${repoRoot} DeCriptaUtil ${input}`,
  );

  const output = execFileSync(
    "java",
    ["-cp", repoRoot, "DeCriptaUtil", input],
    {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  return String(output).trim();
}

// =====================================================
// ===================== WORKER =========================
// =====================================================
if (!isMainThread) {
  function randUniform() {
    return Math.random();
  }

  function randNormal(mean = 0, std = 1) {
    const u1 = Math.max(randUniform(), 1e-12);
    const u2 = randUniform();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + std * z0;
  }

  function samplePoisson(lambda) {
    const lam = Math.max(0, Number(lambda) || 0);
    if (lam <= 0) return 0;

    if (lam < 30) {
      const L = Math.exp(-lam);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= randUniform();
      } while (p > L);
      return k - 1;
    }

    return Math.max(0, Math.round(randNormal(lam, Math.sqrt(lam))));
  }

  function sampleGamma(shape, scale = 1) {
    let k = Number(shape) || 0;
    const theta = Math.max(Number(scale) || 0, 0);

    if (k <= 0 || theta <= 0) return 0;

    if (k < 1) {
      const u = Math.max(randUniform(), 1e-12);
      return sampleGamma(k + 1, theta) * Math.pow(u, 1 / k);
    }

    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x, v;
      do {
        x = randNormal(0, 1);
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = randUniform();

      if (u < 1 - 0.0331 * Math.pow(x, 4)) {
        return d * v * theta;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v * theta;
      }
    }
  }

  /**
   * NB(n,p) con n real vía mezcla Gamma-Poisson
   */
  function sampleNegativeBinomial(n, p) {
    const nn = Number(n);
    const pp = Number(p);

    if (!Number.isFinite(nn) || !Number.isFinite(pp)) return null;
    if (nn <= 0 || pp <= 0 || pp >= 1) return null;

    const scale = (1 - pp) / pp;
    const lambda = sampleGamma(nn, scale);
    return samplePoisson(lambda);
  }

  function sampleDailyDemandNormalFallback(mu, sigma, kStdClamp) {
    const m = Math.max(Number(mu) || 0, 0);
    const s = Math.max(Number(sigma) || 0, 0);

    let d = randNormal(m, Math.max(s, 1e-9));
    const lo = Math.max(0, m - kStdClamp * s);
    const hi = Math.max(0, m + kStdClamp * s);
    d = clamp(d, lo, hi);
    return Math.max(0, d);
  }

  function sampleDailyDemandByDistribution(row, cfg) {
    const dist = row?.distInfo || null;

    if (!dist || !dist.distribucion) {
      return {
        demand: sampleDailyDemandNormalFallback(
          row.Demanda_Promedio_Diaria,
          row.DS_Demanda,
          cfg.kStdClamp,
        ),
        usedDistribution: "NORMAL_FALLBACK",
        distributionFallback: true,
      };
    }

    const type = String(dist.distribucion).toUpperCase();
    const p0 = clamp(Number(dist.p0) || 0, 0, 1);
    const lambda = Math.max(0, Number(dist?.parametros?.lambda) || 0);
    const nb_n = Number(dist?.parametros?.nb_n);
    const nb_p = Number(dist?.parametros?.nb_p);

    if (type === "NO_HISTORY") {
      return {
        demand: sampleDailyDemandNormalFallback(
          row.Demanda_Promedio_Diaria,
          row.DS_Demanda,
          cfg.kStdClamp,
        ),
        usedDistribution: "NO_HISTORY_FALLBACK_NORMAL",
        distributionFallback: true,
      };
    }

    if (type === "ZERO_ONLY") {
      return {
        demand: 0,
        usedDistribution: "ZERO_ONLY",
        distributionFallback: false,
      };
    }

    if (type === "POISSON") {
      if (lambda > 0) {
        return {
          demand: samplePoisson(lambda),
          usedDistribution: "POISSON",
          distributionFallback: false,
        };
      }

      return {
        demand: sampleDailyDemandNormalFallback(
          row.Demanda_Promedio_Diaria,
          row.DS_Demanda,
          cfg.kStdClamp,
        ),
        usedDistribution: "POISSON_FALLBACK_NORMAL",
        distributionFallback: true,
      };
    }

    if (type === "NB") {
      const nb = sampleNegativeBinomial(nb_n, nb_p);
      if (nb != null) {
        return {
          demand: nb,
          usedDistribution: "NB",
          distributionFallback: false,
        };
      }

      return {
        demand: sampleDailyDemandNormalFallback(
          row.Demanda_Promedio_Diaria,
          row.DS_Demanda,
          cfg.kStdClamp,
        ),
        usedDistribution: "NB_FALLBACK_NORMAL",
        distributionFallback: true,
      };
    }

    if (type === "ZINB") {
      if (randUniform() <= p0) {
        return {
          demand: 0,
          usedDistribution: "ZINB",
          distributionFallback: false,
        };
      }

      const nb = sampleNegativeBinomial(nb_n, nb_p);
      if (nb != null) {
        return {
          demand: nb,
          usedDistribution: "ZINB",
          distributionFallback: false,
        };
      }

      return {
        demand: sampleDailyDemandNormalFallback(
          row.Demanda_Promedio_Diaria,
          row.DS_Demanda,
          cfg.kStdClamp,
        ),
        usedDistribution: "ZINB_FALLBACK_NORMAL",
        distributionFallback: true,
      };
    }

    return {
      demand: sampleDailyDemandNormalFallback(
        row.Demanda_Promedio_Diaria,
        row.DS_Demanda,
        cfg.kStdClamp,
      ),
      usedDistribution: "UNKNOWN_FALLBACK_NORMAL",
      distributionFallback: true,
    };
  }

  /**
   * Sin fill rate de proveedor:
   * todo lo ordenado llega completo al arribo.
   */
  function applyDelivery(qty) {
    return Math.max(0, Number(qty) || 0);
  }

  function simulateMetricsByCycle(row, meta, cfg) {
    const S = Math.max(0, meta);
    const R = Math.max(
      1,
      Math.round(Number(row.Frecuencia_Revision_dias) || 1),
    );
    const LT = Math.max(0, Math.round(Number(row.Lead_Time_Abasto) || 0));

    const totalCycles = Math.max(1, Math.floor(cfg.horizonDays / R));

    let onHand = S;
    const pipeline = [];

    let okCycles = 0;
    let stockoutCycles = 0;

    let totalDemand = 0;
    let totalServed = 0;
    let totalOrdered = 0;
    let totalDelivered = 0;
    let totalShortageUnits = 0;

    let endingInventorySum = 0;
    let simulatedDays = 0;

    for (let cycle = 1; cycle <= totalCycles; cycle++) {
      let cycleHadStockout = false;

      for (let d = 1; d <= R; d++) {
        const day = (cycle - 1) * R + d;

        for (let i = pipeline.length - 1; i >= 0; i--) {
          if (pipeline[i].arrivesOnDay === day) {
            const delivered = applyDelivery(pipeline[i].qty);
            onHand += delivered;
            totalDelivered += delivered;
            pipeline.splice(i, 1);
          }
        }

        const sampled = sampleDailyDemandByDistribution(row, cfg);
        const demand = Math.max(0, Number(sampled.demand) || 0);
        totalDemand += demand;

        if (onHand >= demand) {
          onHand -= demand;
          totalServed += demand;
        } else {
          totalServed += onHand;
          totalShortageUnits += demand - onHand;
          onHand = 0;
          cycleHadStockout = true;
        }

        endingInventorySum += onHand;
        simulatedDays++;
      }

      if (!cycleHadStockout) okCycles++;
      else stockoutCycles++;

      const pipelineQty = pipeline.reduce((a, p) => a + p.qty, 0);
      const invPos = onHand + pipelineQty;
      const orderQty = Math.max(0, S - invPos);

      if (orderQty > 0) {
        const arrivesOnDay = cycle * R + LT;
        pipeline.push({ arrivesOnDay, qty: orderQty });
        totalOrdered += orderQty;
      }
    }

    const cycleServiceLevel = okCycles / Math.max(1, totalCycles);
    const customerFillRate = totalServed / Math.max(1, totalDemand);
    const avgEndingInventory = endingInventorySum / Math.max(1, simulatedDays);
    const shortageRatio = totalShortageUnits / Math.max(1, totalDemand);

    return {
      cycleServiceLevel,
      customerFillRate,
      avgEndingInventory,
      totalDemand,
      totalServed,
      totalOrdered,
      totalDelivered,
      totalShortageUnits,
      shortageRatio,
      totalCycles,
      stockoutCycles,
      okCycles,
      simulatedDays,
    };
  }

  function computeCompositeScore(row, meta, metrics, cfg) {
    const weights = cfg.scoring.weights;
    const target = clamp(normalizeServiceLevel(row.Nivel_Servicio), 0, 1);

    // 1) SERVICE SCORE
    const serviceGap = metrics.cycleServiceLevel - target;
    const serviceGapAbs = Math.abs(serviceGap);
    const serviceTolerance = Math.max(
      1e-9,
      Number(cfg.scoring.serviceTolerance) || 0.1,
    );
    const serviceScore = clamp(1 - serviceGapAbs / serviceTolerance, 0, 1);

    // 2) SHORTAGE SCORE
    const shortageUnits = Math.max(
      0,
      Number(metrics.totalShortageUnits) ||
        Math.max(
          0,
          (Number(metrics.totalDemand) || 0) -
            (Number(metrics.totalServed) || 0),
        ),
    );
    const shortageRatio = clamp(
      shortageUnits / Math.max(1, Number(metrics.totalDemand) || 0),
      0,
      1,
    );
    const shortageScore = clamp(1 - shortageRatio, 0, 1);

    // 3) OVERSTOCK SCORE
    const expectedNeed =
      (Number(row.Demanda_Promedio_Diaria) || 1) *
      ((Number(row.Lead_Time_Abasto) || 1) +
        (Number(row.Frecuencia_Revision_dias) || 1));

    const overstockUnits = Math.max(
      0,
      (Number(metrics.avgEndingInventory) || 0) - expectedNeed,
    );
    const overstockRatio = overstockUnits / Math.max(1, expectedNeed);
    const overstockScore = 1 / (1 + overstockRatio);

    let totalScore =
      serviceScore * weights.service +
      shortageScore * weights.shortage +
      overstockScore * weights.overstock;

    const metaToNeedRatio = meta / Math.max(1, expectedNeed);

    if (cfg.scoring.penalizeMetaFarAboveNeed) {
      if (metaToNeedRatio > 10) totalScore *= 0.6;
      if (metaToNeedRatio > 20) totalScore *= 0.3;
      if (metaToNeedRatio > 50) totalScore *= 0.1;
    }

    if (serviceGapAbs > serviceTolerance) {
      totalScore *= 0.25;
    }

    return {
      serviceScore,
      shortageScore,
      overstockScore,
      totalScore,
      totalScorePct: totalScore * 100,
      serviceGap,
      serviceGapAbs,
      serviceTolerance,
      shortageUnits,
      shortageRatio,
      overstockRatio,
      overstockUnits,
      metaToNeedRatio,
      expectedNeed,
    };
  }

  function evaluateMetaScore(row, meta, cfg, repsToUse) {
    const reps = Math.max(1, Math.round(repsToUse || cfg.nReplications));

    const acc = {
      cycleServiceLevel: 0,
      customerFillRate: 0,
      avgEndingInventory: 0,
      totalDemand: 0,
      totalServed: 0,
      totalOrdered: 0,
      totalDelivered: 0,
      totalShortageUnits: 0,
      shortageRatio: 0,
      totalCycles: 0,
      stockoutCycles: 0,
      okCycles: 0,
      simulatedDays: 0,
    };

    for (let i = 0; i < reps; i++) {
      const m = simulateMetricsByCycle(row, meta, cfg);
      acc.cycleServiceLevel += m.cycleServiceLevel;
      acc.customerFillRate += m.customerFillRate;
      acc.avgEndingInventory += m.avgEndingInventory;
      acc.totalDemand += m.totalDemand;
      acc.totalServed += m.totalServed;
      acc.totalOrdered += m.totalOrdered;
      acc.totalDelivered += m.totalDelivered;
      acc.totalShortageUnits += m.totalShortageUnits;
      acc.shortageRatio += m.shortageRatio;
      acc.totalCycles += m.totalCycles;
      acc.stockoutCycles += m.stockoutCycles;
      acc.okCycles += m.okCycles;
      acc.simulatedDays += m.simulatedDays;
    }

    Object.keys(acc).forEach((k) => {
      acc[k] = acc[k] / reps;
    });

    const scores = computeCompositeScore(row, meta, acc, cfg);

    return {
      mean: acc.cycleServiceLevel,
      metrics: acc,
      scores,
      repsUsed: reps,
    };
  }

  function compareEvaluations(a, b, target) {
    if (!a) return b;
    if (!b) return a;

    const scoreA = Number(a.scores?.totalScore) || 0;
    const scoreB = Number(b.scores?.totalScore) || 0;

    if (scoreB > scoreA) return b;
    if (scoreB < scoreA) return a;

    const gapA = Math.abs((Number(a.metrics?.cycleServiceLevel) || 0) - target);
    const gapB = Math.abs((Number(b.metrics?.cycleServiceLevel) || 0) - target);

    if (gapB < gapA) return b;
    if (gapB > gapA) return a;

    const shortageA = Number(a.scores?.shortageRatio) || 0;
    const shortageB = Number(b.scores?.shortageRatio) || 0;
    if (shortageB < shortageA) return b;
    if (shortageB > shortageA) return a;

    const overA = Number(a.scores?.overstockRatio) || 0;
    const overB = Number(b.scores?.overstockRatio) || 0;

    if (overB < overA) return b;
    if (overB > overA) return a;

    const metaA = Number(a.meta) || 0;
    const metaB = Number(b.meta) || 0;

    if (metaB < metaA) return b;
    return a;
  }

  function generateInitialCandidates(row, cfg) {
    const meta0 = clamp(
      Math.round(Number(row.META) || 0),
      cfg.minMeta,
      cfg.maxMeta,
    );

    const dailyDemand = Math.max(0, Number(row.Demanda_Promedio_Diaria) || 0);
    const reviewDays = Math.max(
      1,
      Math.round(Number(row.Frecuencia_Revision_dias) || 1),
    );
    const leadTime = Math.max(0, Math.round(Number(row.Lead_Time_Abasto) || 0));
    const expectedNeed = Math.max(0, dailyDemand * (reviewDays + leadTime));

    const candidates = [
      cfg.minMeta,
      meta0,
      meta0 * 0.25,
      meta0 * 0.5,
      meta0 * 0.75,
      meta0 * 0.9,
      meta0 * 1.1,
      meta0 * 1.25,
      meta0 * 1.5,
      meta0 * 2,
      expectedNeed * 0.25,
      expectedNeed * 0.5,
      expectedNeed * 0.75,
      expectedNeed,
      expectedNeed * 1.25,
      expectedNeed * 1.5,
      expectedNeed * 2,
      expectedNeed * 3,
    ];

    return uniqueSortedNumbers(
      candidates.map((x) => clamp(Math.round(x), cfg.minMeta, cfg.maxMeta)),
    );
  }

  function generateNeighborCandidates(baseMeta, cfg) {
    const m = Math.max(0, Math.round(baseMeta || 0));

    const absSteps = [1, 2, 5, 10, 20, 35, 50, 75, 100];
    const pctSteps = [0.85, 0.9, 0.95, 0.98, 1.02, 1.05, 1.1, 1.15];

    const vals = [m];
    for (const s of absSteps) {
      vals.push(m - s, m + s);
    }
    for (const p of pctSteps) {
      vals.push(m * p);
    }

    return uniqueSortedNumbers(
      vals.map((x) => clamp(Math.round(x), cfg.minMeta, cfg.maxMeta)),
    );
  }

  function optimizeMeta(row, cfg) {
    const target = clamp(normalizeServiceLevel(row.Nivel_Servicio), 0, 1);
    const cache = new Map();
    let iterations = 0;

    function evalCached(meta, reps) {
      const m = clamp(Math.round(meta), cfg.minMeta, cfg.maxMeta);
      const r = Math.max(1, Math.round(reps));
      const key = `${m}|${r}`;

      if (cache.has(key)) return cache.get(key);

      const res = evaluateMetaScore(row, m, cfg, r);
      const full = { meta: m, ...res };
      cache.set(key, full);
      iterations++;
      return full;
    }

    const coarseReps = Math.min(
      cfg.coarseReplications || cfg.nReplications,
      cfg.nReplications,
    );
    const topK = Math.max(1, Math.round(cfg.scoring?.topKCoarse || 4));

    const initialCandidates = generateInitialCandidates(row, cfg);
    let coarseResults = initialCandidates.map((meta) =>
      evalCached(meta, coarseReps),
    );
    coarseResults.sort((a, b) => b.scores.totalScore - a.scores.totalScore);

    let seedMetas = coarseResults.slice(0, topK).map((x) => x.meta);
    if (!seedMetas.includes(Math.round(Number(row.META) || 0))) {
      seedMetas.push(Math.round(Number(row.META) || 0));
    }
    seedMetas = uniqueSortedNumbers(seedMetas);

    const refinedCandidates = uniqueSortedNumbers(
      seedMetas.flatMap((m) => generateNeighborCandidates(m, cfg)),
    );

    const refinedResults = refinedCandidates.map((meta) =>
      evalCached(meta, coarseReps),
    );
    refinedResults.sort((a, b) => b.scores.totalScore - a.scores.totalScore);

    const finalists = refinedResults.slice(0, topK).map((x) => x.meta);
    if (!finalists.includes(Math.round(Number(row.META) || 0))) {
      finalists.push(Math.round(Number(row.META) || 0));
    }

    const finalCandidates = uniqueSortedNumbers(
      finalists.flatMap((m) => generateNeighborCandidates(m, cfg)),
    );

    let best = null;
    for (const meta of finalCandidates) {
      const evaluated = evalCached(meta, cfg.nReplications);
      best = compareEvaluations(best, evaluated, target);
    }

    if (!best) {
      const meta0 = clamp(
        Math.round(Number(row.META) || 0),
        cfg.minMeta,
        cfg.maxMeta,
      );
      best = evalCached(meta0, cfg.nReplications);
    }

    let finalMeta = best.meta;
    if (cfg.rounding === "ceil") finalMeta = Math.ceil(finalMeta);
    else if (cfg.rounding === "round") finalMeta = Math.round(finalMeta);
    else if (cfg.rounding === "floor") finalMeta = Math.floor(finalMeta);

    finalMeta = Math.max(0, finalMeta);

    const distType = String(
      row?.distInfo?.distribucion || "NORMAL_FALLBACK",
    ).toUpperCase();

    const usedFallback =
      !row?.distInfo?.distribucion || distType === "NO_HISTORY";

    return {
      metaInitial: Number(row.META) || 0,
      metaOptimized: finalMeta,
      metaOptimizedRaw: best.meta,
      deltaMeta: finalMeta - (Number(row.META) || 0),

      serviceTarget: target,
      serviceAchieved: best.metrics.cycleServiceLevel,
      serviceGap: best.metrics.cycleServiceLevel - target,
      feasible: best.metrics.cycleServiceLevel >= target,
      serviceFloorMet:
        best.scores.serviceGapAbs <= best.scores.serviceTolerance,

      customerFillRateAchieved: best.metrics.customerFillRate,
      avgEndingInventory: best.metrics.avgEndingInventory,
      avgShortageUnits: best.scores.shortageUnits,
      shortageRatio: best.scores.shortageRatio,
      avgOverstockUnits: best.scores.overstockUnits,
      overstockRatio: best.scores.overstockRatio,
      expectedNeed: best.scores.expectedNeed,

      serviceScore: best.scores.serviceScore,
      shortageScore: best.scores.shortageScore,
      overstockScore: best.scores.overstockScore,
      totalScore: best.scores.totalScore,
      totalScorePct: best.scores.totalScorePct,

      avgTotalDemand: best.metrics.totalDemand,
      avgTotalServed: best.metrics.totalServed,
      avgTotalOrdered: best.metrics.totalOrdered,
      avgTotalDelivered: best.metrics.totalDelivered,
      avgStockoutCycles: best.metrics.stockoutCycles,
      avgOkCycles: best.metrics.okCycles,

      iterations,
      cacheSize: cache.size,
      coarseReplications: coarseReps,
      finalReplications: cfg.nReplications,

      distributionType: distType,
      distributionFallback: usedFallback,

      serviceGapAbs: best.scores.serviceGapAbs,
      metaToNeedRatio: best.scores.metaToNeedRatio,
    };
  }

  parentPort.on("message", (msg) => {
    if (msg?.type === "job") {
      const { jobId, row, cfg } = msg;

      const t0 = Date.now();
      const res = optimizeMeta(row, cfg);
      const ms = Date.now() - t0;

      parentPort.postMessage({
        type: "result",
        jobId,
        ms,
        rowMeta: {
          SKU: row.SKU,
          Clasificacion: row.Clasificacion ?? null,
          distInfo: row.distInfo ?? null,
          distKey: row.distKey ?? null,
          matchSource: row.matchSource ?? null,
          Ubicacion: row.Ubicacion ?? null,
          Producto: row.Producto ?? null,
        },
        res,
      });
    } else if (msg?.type === "shutdown") {
      process.exit(0);
    }
  });

  parentPort.postMessage({ type: "ready" });
  return;
}

// =====================================================
// ===================== MAIN THREAD ====================
// =====================================================

async function main() {
  const [parametroUsuario] = process.argv.slice(2);
  if (!parametroUsuario) {
    console.error("Uso: node run_montecarlo_meta.js <parametroUsuario>");
    process.exit(1);
  }

  const { host, puerto } = require("../Configuraciones/ConexionDB");

  if (!host || !puerto) {
    throw new Error("ConexionDB no trae host/puerto.");
  }

  const { GB_DBName } = require(
    `../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`,
  );
  const parametroFolder = String(GB_DBName).toUpperCase();
  const { DBUser, DBPassword, DBName } = require(
    `../../${parametroFolder}/cfg/dbvars`,
  );
  const dbName = `btc_opti_${DBName}`;

  async function getDecryptedPassadmin() {
    const raw = String(DBPassword ?? "").trim();

    console.log("[DEBUG] parametroUsuario:", parametroUsuario);
    console.log("[DEBUG] GB_DBName:", GB_DBName);
    console.log("[DEBUG] DBName:", DBName);
    console.log("[DEBUG] DBUser:", DBUser);
    console.log("[DEBUG] DBPassword raw:", raw);

    if (!raw) {
      throw new Error("DBPassword viene vacío o indefinido.");
    }

    return decryptData(raw);
  }

  async function connectMongoAuto() {
    const pass = await getDecryptedPassadmin();
    const u = encodeURIComponent(DBUser);
    const p = encodeURIComponent(pass);

    const candidates = [
      {
        uri: `mongodb://${u}:${p}@${host}:${puerto}/?authSource=admin`,
        label: "authSource=admin (root)",
      },
      {
        uri: `mongodb://${u}:${p}@${host}:${puerto}/admin?authSource=admin`,
        label: "path=/admin authSource=admin",
      },
      {
        uri: `mongodb://${u}:${p}@${host}:${puerto}/${dbName}?authSource=${dbName}`,
        label: `authSource=${dbName}`,
      },
      {
        uri: `mongodb://${u}:${p}@${host}:${puerto}/${dbName}?authSource=admin`,
        label: `path=/${dbName} authSource=admin`,
      },
      {
        uri: `mongodb://${u}:${p}@${host}:${puerto}/?authSource=admin&directConnection=true`,
        label: "authSource=admin + directConnection",
      },
    ];

    console.log(
      "[DEBUG] host:",
      host,
      "puerto:",
      puerto,
      "DBUser:",
      DBUser,
      "dbName:",
      dbName,
    );
    console.log(
      "[DEBUG] workers:",
      CFG.numWorkers,
      "replications:",
      CFG.nReplications,
      "coarseReplications:",
      CFG.coarseReplications,
      "horizonDays:",
      CFG.horizonDays,
    );

    let lastErr = null;
    for (const c of candidates) {
      const client = new MongoClient(c.uri, {
        serverSelectionTimeoutMS: 8000,
      });

      try {
        await client.connect();
        try {
          await client.db("admin").command({ ping: 1 });
        } catch {
          await client.db(dbName).command({ ping: 1 });
        }
        console.log("[INFO] Mongo conectado con:", c.label);
        return { client };
      } catch (err) {
        lastErr = err;
        try {
          await client.close();
        } catch {}
        console.warn(
          "[WARN] Falló intento:",
          c.label,
          "|",
          err.codeName || err.message,
        );
      }
    }

    throw (
      lastErr || new Error("No se pudo autenticar con ningún URI candidato.")
    );
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const { client } = await connectMongoAuto();

  try {
    const db = client.db(dbName);
    const policyCol = db.collection(POLICY_COLLECTION);
    const resultsCol = db.collection(RESULTS_COLLECTION);
    const distributionCol = db.collection(DISTRIBUTION_COLLECTION);

    console.log(`[INFO] DB: ${dbName}`);
    console.log(`[INFO] Leyendo políticas: ${POLICY_COLLECTION}`);
    console.log(`[INFO] Leyendo distribuciones: ${DISTRIBUTION_COLLECTION}`);
    console.log(`[INFO] Escribiendo: ${RESULTS_COLLECTION}`);
    console.log(`[INFO] runId: ${runId}`);

    if (CFG.cleanResultsCollection) {
      const del = await resultsCol.deleteMany({});
      console.log(
        `[INFO] Limpieza: borrados ${del.deletedCount} docs en ${RESULTS_COLLECTION}`,
      );
    }

    const rows = await policyCol
      .find(
        { $or: [{ Ignorado: { $exists: false } }, { Ignorado: { $ne: 1 } }] },
        {
          projection: {
            SKU: 1,
            Ubicacion: 1,
            Producto: 1,
            Clasificacion: 1,
            Nivel_Servicio: 1,
            Demanda_Promedio_Diaria: 1,
            DS_Demanda: 1,
            Lead_Time_Abasto: 1,
            Frecuencia_Revision_dias: 1,
            META: 1,
            Ignorado: 1,
          },
        },
      )
      .toArray();

    console.log(`[INFO] SKUs en políticas a procesar: ${rows.length}`);

    const distDocs = await distributionCol
      .find(
        {},
        {
          projection: {
            _id: 0,
            SKU: 1,
            Ubicacion: 1,
            Producto: 1,
            distribucion: 1,
            p0: 1,
            mu: 1,
            variance: 1,
            parametros: 1,
            metadata: 1,
          },
        },
      )
      .toArray();

    const distMap = new Map();
    for (const d of distDocs) {
      const key =
        buildUbicacionProductoKey(d.Ubicacion, d.Producto) || normPart(d.SKU);

      if (key) distMap.set(key, d);
    }

    console.log(`[INFO] SKUs con distribución cargada: ${distMap.size}`);

    let matchedDist = 0;
    let missingDist = 0;
    let matchedByComposite = 0;
    let matchedBySkuParse = 0;

    const enrichedRows = rows.map((row) => {
      const keyByComposite = buildUbicacionProductoKey(
        row.Ubicacion,
        row.Producto,
      );
      const keyBySku = parsePolicySkuToKey(row.SKU);

      let distKey = null;
      let distInfo = null;
      let matchSource = null;

      if (keyByComposite && distMap.has(keyByComposite)) {
        distKey = keyByComposite;
        distInfo = distMap.get(keyByComposite) || null;
        matchSource = "composite";
      } else if (keyBySku && distMap.has(keyBySku)) {
        distKey = keyBySku;
        distInfo = distMap.get(keyBySku) || null;
        matchSource = "sku_parse";
      }

      if (distInfo) {
        matchedDist++;
        if (matchSource === "composite") matchedByComposite++;
        if (matchSource === "sku_parse") matchedBySkuParse++;
      } else {
        missingDist++;
      }

      return {
        ...row,
        distInfo,
        distKey: distKey || keyByComposite || keyBySku || null,
        matchSource,
      };
    });

    console.log(`[INFO] SKUs con match de distribución: ${matchedDist}`);
    console.log(`[INFO]   - match por composite key: ${matchedByComposite}`);
    console.log(`[INFO]   - match por parse de SKU: ${matchedBySkuParse}`);
    console.log(
      `[INFO] SKUs sin distribución (fallback normal): ${missingDist}`,
    );

    const workers = [];
    const idleWorkers = [];
    const pending = new Map();
    let jobSeq = 0;
    let idx = 0;
    let processed = 0;

    const bulk = [];

    function flushBulkIfNeeded(force = false) {
      if (!bulk.length) return Promise.resolve();
      if (!force && bulk.length < CFG.bulkFlushSize) return Promise.resolve();
      const ops = bulk.splice(0, bulk.length);
      return resultsCol.bulkWrite(ops, { ordered: false });
    }

    function startWorker() {
      const w = new Worker(__filename);

      w.on("message", (m) => {
        if (m?.type === "ready") {
          idleWorkers.push(w);
          pump();
          return;
        }

        if (m?.type === "result") {
          const { jobId, ms, rowMeta, res } = m;
          const p = pending.get(jobId);
          pending.delete(jobId);
          if (p) p.resolve({ ms, rowMeta, res });

          idleWorkers.push(w);
          pump();
        }
      });

      w.on("error", (e) => {
        console.error("[WORKER ERROR]", e);
      });

      w.on("exit", (code) => {
        if (code !== 0) console.warn("[WORKER EXIT]", code);
      });

      workers.push(w);
    }

    for (let i = 0; i < CFG.numWorkers; i++) startWorker();

    async function handleResult(result) {
      const { ms, rowMeta, res } = result;

      bulk.push({
        insertOne: {
          document: {
            runId,
            startedAt,
            finishedAt: new Date(),
            ms,

            SKU: rowMeta.SKU,
            Clasificacion: rowMeta.Clasificacion,
            Ubicacion: rowMeta.Ubicacion,
            Producto: rowMeta.Producto,
            distKey: rowMeta.distKey,
            matchSource: rowMeta.matchSource,

            distribucion_demanda:
              rowMeta?.distInfo?.distribucion ||
              res.distributionType ||
              "NORMAL_FALLBACK",
            distribucion_fallback: res.distributionFallback,
            distribucion_parametros: rowMeta?.distInfo?.parametros || null,
            distribucion_p0: rowMeta?.distInfo?.p0 ?? null,
            distribucion_mu: rowMeta?.distInfo?.mu ?? null,
            distribucion_variance: rowMeta?.distInfo?.variance ?? null,
            distribucion_metadata: rowMeta?.distInfo?.metadata || null,

            metaInitial: res.metaInitial,
            metaOptimized: res.metaOptimized,
            metaOptimizedRaw: res.metaOptimizedRaw,
            deltaMeta: res.deltaMeta,

            serviceTarget: res.serviceTarget,
            serviceAchieved: res.serviceAchieved,
            serviceGap: res.serviceGap,
            feasible: res.feasible,
            serviceFloorMet: res.serviceFloorMet,

            customerFillRateAchieved: res.customerFillRateAchieved,
            avgEndingInventory: res.avgEndingInventory,
            avgShortageUnits: res.avgShortageUnits,
            shortageRatio: res.shortageRatio,
            avgOverstockUnits: res.avgOverstockUnits,
            overstockRatio: res.overstockRatio,
            expectedNeed: res.expectedNeed,

            scoreComponents: {
              serviceScore: res.serviceScore,
              shortageScore: res.shortageScore,
              overstockScore: res.overstockScore,
            },

            totalScore: res.totalScore,
            totalScorePct: res.totalScorePct,

            avgTotalDemand: res.avgTotalDemand,
            avgTotalServed: res.avgTotalServed,
            avgTotalOrdered: res.avgTotalOrdered,
            avgTotalDelivered: res.avgTotalDelivered,
            avgStockoutCycles: res.avgStockoutCycles,
            avgOkCycles: res.avgOkCycles,

            iterations: res.iterations,
            cacheSize: res.cacheSize,
            coarseReplications: res.coarseReplications,
            finalReplications: res.finalReplications,

            config: {
              replications: CFG.nReplications,
              coarseReplications: CFG.coarseReplications,
              horizonDays: CFG.horizonDays,
              clampK: CFG.kStdClamp,
              metric: "composite_score",
              rule: "maximize_weighted_score",
              note: "Score = service + shortage + overstock ponderados. Fill rate removido del score y de la simulación de entrega.",
              workers: CFG.numWorkers,
              demandModelSource: DISTRIBUTION_COLLECTION,
              scoringWeights: CFG.scoring.weights,
              serviceTolerance: CFG.scoring.serviceTolerance,
            },
          },
        },
      });

      processed++;
      if (processed % 200 === 0) {
        console.log(`[INFO] Procesados ${processed}/${enrichedRows.length}`);
      }

      await flushBulkIfNeeded(false);
    }

    function sendJob(w, row) {
      const jobId = ++jobSeq;
      return new Promise((resolve, reject) => {
        pending.set(jobId, { resolve, reject });
        w.postMessage({ type: "job", jobId, row, cfg: CFG });
      });
    }

    function pump() {
      while (idleWorkers.length > 0 && idx < enrichedRows.length) {
        const w = idleWorkers.pop();
        const row = enrichedRows[idx++];

        if (!row?.SKU || row.META == null || row.Nivel_Servicio == null) {
          idleWorkers.push(w);
          continue;
        }

        sendJob(w, row)
          .then(handleResult)
          .catch((e) => console.error("[JOB ERROR]", e));
      }

      if (idx >= enrichedRows.length && pending.size === 0) {
        (async () => {
          await flushBulkIfNeeded(true);

          console.log(
            `[INFO] FINALIZADO. RunID: ${runId} | Total SKUs: ${processed}`,
          );

          if (CFG.exportCsv) {
            await exportResultsCsv(db, runId, RESULTS_COLLECTION);
          }

          for (const w of workers) w.postMessage({ type: "shutdown" });
          await client.close();
        })().catch((e) => console.error("[FINALIZE ERROR]", e));
      }
    }

    async function exportResultsCsv(db, runId, collectionName) {
      const col = db.collection(collectionName);
      const docs = await col
        .find({ runId }, { projection: { _id: 0 } })
        .sort({ SKU: 1 })
        .toArray();

      const header = [
        "runId",
        "SKU",
        "Ubicacion",
        "Producto",
        "Clasificacion",
        "distKey",
        "distribucion_demanda",
        "distribucion_fallback",
        "metaInitial",
        "metaOptimized",
        "deltaMeta",
        "serviceTarget",
        "serviceAchieved",
        "serviceGap",
        "customerFillRateAchieved",
        "avgEndingInventory",
        "avgShortageUnits",
        "shortageRatio",
        "avgOverstockUnits",
        "overstockRatio",
        "serviceScore",
        "shortageScore",
        "overstockScore",
        "totalScore",
        "feasible",
        "serviceFloorMet",
        "iterations",
        "ms",
      ];

      function toFixedSafe(x, n = 2) {
        const v = Number(x);
        if (!Number.isFinite(v)) return "";
        return v.toFixed(n);
      }

      function pct(x, n = 2) {
        const v = Number(x);
        if (!Number.isFinite(v)) return "";
        return (v * 100).toFixed(n) + "%";
      }

      const csvRows = docs.map((d) => {
        return [
          d.runId ?? "",
          d.SKU ?? "",
          d.Ubicacion ?? "",
          d.Producto ?? "",
          d.Clasificacion ?? "",
          d.distKey ?? "",
          d.distribucion_demanda ?? "",
          d.distribucion_fallback ? "true" : "false",
          toFixedSafe(d.metaInitial, 2),
          toFixedSafe(d.metaOptimized, 2),
          toFixedSafe(d.deltaMeta, 2),
          pct(d.serviceTarget, 2),
          pct(d.serviceAchieved, 2),
          pct(d.serviceGap, 4),
          pct(d.customerFillRateAchieved, 2),
          toFixedSafe(d.avgEndingInventory, 2),
          toFixedSafe(d.avgShortageUnits, 2),
          toFixedSafe(d.shortageRatio, 4),
          toFixedSafe(d.avgOverstockUnits, 2),
          toFixedSafe(d.overstockRatio, 4),
          toFixedSafe(d.scoreComponents?.serviceScore, 4),
          toFixedSafe(d.scoreComponents?.shortageScore, 4),
          toFixedSafe(d.scoreComponents?.overstockScore, 4),
          toFixedSafe(d.totalScore, 4),
          d.feasible ? "true" : "false",
          d.serviceFloorMet ? "true" : "false",
          d.iterations ?? "",
          d.ms ?? "",
        ].join(",");
      });

      const content = header.join(",") + "\n" + csvRows.join("\n");
      const filename = `resultados_simulaciones_META_${runId}.csv`;
      fs.writeFileSync(filename, content, "utf8");
      console.log(`[INFO] CSV bonito generado: ${filename}`);
    }

    console.log("[INFO] Iniciando simulación Montecarlo META (multi-core)...");
    pump();
  } catch (e) {
    console.error("[ERROR]", e);
    try {
      await client.close();
    } catch {}
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[FATAL]", e?.stack || e?.message || e);
  process.exit(1);
});
