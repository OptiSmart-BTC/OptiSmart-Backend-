/**
 * run_montecarlo_meta.js
 * Nuevo desarrollo: optimiza META para alcanzar Nivel_Servicio
 * Lee de: ui_all_pol_inv (en btc_opti_${DBName})
 * Escribe en: resultados_simulaciones (en btc_opti_${DBName})
 *
 * Uso:
 *   node run_montecarlo_meta.js <parametroUsuario>
 */

const { MongoClient } = require("mongodb");
const crypto = require("crypto");

// ==== MISMAS DEPENDENCIAS/CONFIG QUE TU PROYECTO ====
const { decryptData } = require("./DeCriptaPassAppDb");
const { host, puerto } = require("../Configuraciones/ConexionDB");

// =============================
// Parámetros
// =============================
const [parametroUsuario] = process.argv.slice(2);

if (!parametroUsuario) {
  console.error("Uso: node run_montecarlo_meta.js <parametroUsuario>");
  process.exit(1);
}

const { GB_DBName } = require(
  `../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`,
);
const parametroFolder = GB_DBName.toUpperCase();

const { DBUser, DBPassword, DBName } = require(
  `../../${parametroFolder}/cfg/dbvars`,
);

// Base de datos completa (igual que tu script)
const dbName = `btc_opti_${DBName}`;

// Colecciones
const POLICY_COLLECTION = "ui_all_pol_inv";
const RESULTS_COLLECTION = "resultados_simulaciones";

// =============================
// Config simulación
// =============================
const CFG = {
  horizonDays: 365,
  nReplications: 200,
  kStdClamp: 2,
  epsilonService: 0.002,
  maxIterations: 25,
  metaStepInit: 50,
  minMeta: 0,
  maxMeta: 1e9,
  supplierMode: "bernoulli", // Fill_Rate como prob de que llegue bien el pedido completo
  rounding: "ceil", // ceil para no quedarnos cortos
};

// =============================
// Utils: desencriptar pass y armar URI
// =============================
async function getDecryptedPassadmin() {
  return decryptData(`${DBPassword}`);
}

async function buildMongoUri() {
  const pass = await getDecryptedPassadmin();
  // igual que tu proyecto
  return `mongodb://${encodeURIComponent(DBUser)}:${encodeURIComponent(pass)}@${host}:${puerto}/?authSource=admin`;
}

// =============================
// RNG
// =============================
function randUniform() {
  return Math.random();
}

function randNormal(mean = 0, std = 1) {
  const u1 = Math.max(randUniform(), 1e-12);
  const u2 = randUniform();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z0;
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// =============================
// Demanda Normal clamped, no negativa
// =============================
function sampleDailyDemand(mu, sigma) {
  const m = Math.max(Number(mu) || 0, 0);
  const s = Math.max(Number(sigma) || 0, 0);

  let d = randNormal(m, Math.max(s, 1e-9));
  const lo = Math.max(0, m - CFG.kStdClamp * s);
  const hi = Math.max(0, m + CFG.kStdClamp * s);
  d = clamp(d, lo, hi);

  return Math.max(0, d);
}

// =============================
// Fill Rate proveedor: prob de que el pedido llegue "bien"
// =============================
function applyFillRate(qty, fillRate) {
  const p = clamp(Number(fillRate) || 1, 0, 1); // viene como 0.8, ok
  return randUniform() <= p ? qty : 0;
}

// =============================
// Simulación R,S con LT fijo
// servicio = % días sin stockout
// =============================
function simulateService(row, meta) {
  const S = Math.max(0, meta);
  const R = Math.max(1, Math.round(Number(row.Frecuencia_Revision_dias) || 1));
  const LT = Math.max(0, Math.round(Number(row.Lead_Time_Abasto) || 0));

  let onHand = S;
  const pipeline = []; // { arrivesOn, qty }
  let okDays = 0;

  for (let day = 1; day <= CFG.horizonDays; day++) {
    // arrivals
    for (let i = pipeline.length - 1; i >= 0; i--) {
      if (pipeline[i].arrivesOn === day) {
        const delivered = applyFillRate(pipeline[i].qty, row.Fill_Rate ?? 1);
        onHand += delivered;
        pipeline.splice(i, 1);
      }
    }

    const demand = sampleDailyDemand(
      row.Demanda_Promedio_Diaria,
      row.DS_Demanda,
    );

    if (onHand >= demand) {
      okDays++;
      onHand -= demand;
    } else {
      onHand = 0;
    }

    // review
    if (day % R === 0) {
      const pipelineQty = pipeline.reduce((a, p) => a + p.qty, 0);
      const invPos = onHand + pipelineQty;
      const orderQty = Math.max(0, S - invPos);

      if (orderQty > 0) {
        pipeline.push({ arrivesOn: day + LT, qty: orderQty });
      }
    }
  }

  return okDays / CFG.horizonDays;
}

function evaluateMeta(row, meta) {
  let acc = 0;
  for (let i = 0; i < CFG.nReplications; i++) {
    acc += simulateService(row, meta);
  }
  return acc / CFG.nReplications;
}

// =============================
// Optimización META
// =============================
function optimizeMeta(row) {
  const target = clamp(Number(row.Nivel_Servicio), 0, 1);

  let meta = clamp(Number(row.META) || 0, CFG.minMeta, CFG.maxMeta);
  let step = Math.max(1, Math.floor(CFG.metaStepInit));

  let bestMeta = meta;
  let bestService = evaluateMeta(row, meta);

  let iter = 0;

  while (iter < CFG.maxIterations) {
    iter++;

    const diff = bestService - target;
    if (Math.abs(diff) <= CFG.epsilonService) break;

    const direction = diff > 0 ? -1 : 1;
    const candidate = clamp(
      bestMeta + direction * step,
      CFG.minMeta,
      CFG.maxMeta,
    );
    const candidateService = evaluateMeta(row, candidate);

    if (Math.abs(candidateService - target) < Math.abs(bestService - target)) {
      bestMeta = candidate;
      bestService = candidateService;
    } else {
      step = Math.max(1, Math.floor(step / 2));
      if (step === 1) break;
    }
  }

  let finalMeta = bestMeta;
  if (CFG.rounding === "ceil") finalMeta = Math.ceil(bestMeta);
  else if (CFG.rounding === "round") finalMeta = Math.round(bestMeta);
  else if (CFG.rounding === "floor") finalMeta = Math.floor(bestMeta);

  finalMeta = Math.max(0, finalMeta);

  return {
    metaInitial: Number(row.META) || 0,
    metaOptimized: finalMeta,
    metaOptimizedRaw: bestMeta,
    serviceTarget: target,
    serviceAchieved: bestService,
    iterations: iter,
  };
}

// =============================
// MAIN
// =============================
async function main() {
  const uri = await buildMongoUri();
  const runId = crypto.randomUUID();
  const startedAt = new Date();

  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db(dbName);
    const policyCol = db.collection(POLICY_COLLECTION);
    const resultsCol = db.collection(RESULTS_COLLECTION);

    console.log(`[INFO] DB: ${dbName}`);
    console.log(`[INFO] Leyendo: ${POLICY_COLLECTION}`);
    console.log(`[INFO] Escribiendo: ${RESULTS_COLLECTION}`);
    console.log(`[INFO] runId: ${runId}`);
    console.log("Iniciando simulación Montecarlo META...");

    // solo SKUs no ignorados
    const cursor = policyCol.find(
      { $or: [{ Ignorado: { $exists: false } }, { Ignorado: { $ne: 1 } }] },
      {
        projection: {
          SKU: 1,
          Clasificacion: 1,
          Nivel_Servicio: 1,
          Demanda_Promedio_Diaria: 1,
          DS_Demanda: 1,
          Lead_Time_Abasto: 1,
          Frecuencia_Revision_dias: 1,
          META: 1,
          Fill_Rate: 1,
          Ignorado: 1,
        },
      },
    );

    let count = 0;
    const bulk = [];

    while (await cursor.hasNext()) {
      const row = await cursor.next();

      // validación mínima
      if (!row.SKU) continue;
      if (row.META == null || row.Nivel_Servicio == null) continue;

      const t0 = Date.now();
      const res = optimizeMeta(row);
      const ms = Date.now() - t0;

      bulk.push({
        insertOne: {
          document: {
            runId,
            startedAt,
            finishedAt: new Date(),
            ms,
            SKU: row.SKU,
            Clasificacion: row.Clasificacion ?? null,
            ...res,
            assumptions: {
              demandModel: "Normal(mu, sigma) clamped",
              clampK: CFG.kStdClamp,
              serviceMetric: "% days without stockout",
              leadTime: "fixed",
              fillRateInterpretation: "order success probability (0..1)",
              horizonDays: CFG.horizonDays,
              replications: CFG.nReplications,
              rounding: CFG.rounding,
            },
          },
        },
      });

      count++;

      if (bulk.length >= 300) {
        await resultsCol.bulkWrite(bulk, { ordered: false });
        bulk.length = 0;
        console.log(`Procesados ${count} SKUs`);
      }
    }

    if (bulk.length) {
      await resultsCol.bulkWrite(bulk, { ordered: false });
    }

    console.log(`FINALIZADO. RunID: ${runId} | Total SKUs: ${count}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("[ERROR]", err);
  process.exit(1);
});
