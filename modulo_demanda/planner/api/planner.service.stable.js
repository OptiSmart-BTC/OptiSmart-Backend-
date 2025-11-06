// modulo_demanda/planner/api/planner.service.js
const { ObjectId } = require('mongodb');

/** ===== Utilidades ===== **/

/** Asertividad simple por celda (1 - |real - est| / max(real,1)) */
function computeAsertividad(real, est) {
  if (real == null || est == null) return null;
  const denom = Math.max(real, 1);
  return 1 - Math.abs(real - est) / denom;
}

/** Convierte a Date si es string/number; retorna null si es inválida */
function toDateSafe(d) {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

/** Suma/resta meses en UTC preservando día (clamp si el mes destino tiene menos días) */
function addMonthsUTC(dateUTC, n) {
  const y = dateUTC.getUTCFullYear();
  const m = dateUTC.getUTCMonth() + n;
  const d = dateUTC.getUTCDate();
  const first = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const dd = Math.min(d, lastDay);
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), dd));
}

/** Suma días en UTC (útil para YoY semanal: -52 semanas y +52 semanas) */
function addDaysUTC(dateUTC, days) {
  return new Date(Date.UTC(
    dateUTC.getUTCFullYear(),
    dateUTC.getUTCMonth(),
    dateUTC.getUTCDate() + days
  ));
}

/** Inicio de semana ISO (lunes) en UTC */
function startOfISOWeekUTC(dateUTC) {
  const d = new Date(Date.UTC(
    dateUTC.getUTCFullYear(),
    dateUTC.getUTCMonth(),
    dateUTC.getUTCDate()
  ));
  const dow = d.getUTCDay(); // 0=Dom, 1=Lun, ... 6=Sab
  const delta = (dow === 0 ? -6 : 1 - dow);
  d.setUTCDate(d.getUTCDate() + delta);
  d.setUTCHours(0,0,0,0);
  return d;
}

/** Normaliza a ancla de periodo (W-MON: lunes; M: día 1) — solo para fallback semanal */
function normalizeToAnchor(dateUTC, freq) {
  if (String(freq).toUpperCase().startsWith('W')) return startOfISOWeekUTC(dateUTC);
  return dateUTC; // mensual no requiere normalización extra aquí
}

/** ===== Sesiones ===== **/

/**
 * Crea (o devuelve) una sesión abierta del Planner.
 * - source.forecast_date se toma de la última 'forecast_date' de demand_forecast_actual (si existe), solo informativo.
 * - source.freq es metadato.
 */
async function openOrGetActiveSession(db, { dbName, freq = 'W-MON' }) {
  const sessions = db.collection('planner_sessions');
  const now = new Date();

  let session = await sessions.findOne({ db_name: dbName, status: 'open' });
  if (session) return session;

  const last = await db.collection('demand_forecast_actual').aggregate([
    { $group: { _id: null, maxFd: { $max: "$forecast_date" } } }
  ]).toArray();
  const forecast_date = toDateSafe(last[0]?.maxFd) || now;

  const session_id = `PLN-${now.toISOString().slice(0,10)}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

  const doc = {
    session_id,
    db_name: dbName,
    owner: null,
    type: 'shared',
    status: 'open',
    source: { forecast_date, freq },
    participants: [],
    version: 1,
    created_at: now,
    updated_at: now
  };
  await sessions.insertOne(doc);
  return doc;
}

/** ===== Bootstrap (copia 1:1 + prev_year con exacto y fallback semanal) ===== **/

/**
 * Bootstrap SIN generar periodos:
 * - Copia 1:1 filas existentes en demand_forecast_actual dentro del rango dado.
 * - Enriquecimiento:
 *    actual: match exacto (Producto, Canal, Ubicacion, Fecha) en historico_demanda_{appUser}
 *    prev_year:
 *      - yoyMode = 'month'  → (Producto,Canal,Ubicacion, Fecha -12m) remapeado a base (+12m)
 *      - yoyMode = 'week'   → (Producto,Canal,Ubicacion, Fecha -52w) remapeado a base (+52w)
 *        + fallback por lunes ISO (W-MON) si no hay match exacto
 */
async function bootstrapSession(db, {
  session_id,
  appUser,
  fromDate,
  toDate,
  anchorDate,
  pastMonths = 0,
  futureMonths = 0,
  yoyMode = 'month' // 'month' | 'week'
}) {
  const sessions = db.collection('planner_sessions');
  const cells = db.collection('planner_cells');

  const session = await sessions.findOne({ session_id });
  if (!session) throw new Error('Session not found');

  // 1) Rango de filtrado
  let minDate = toDateSafe(fromDate);
  let maxDate = toDateSafe(toDate);

  if (!minDate || !maxDate) {
    let anchor = toDateSafe(anchorDate);
    if (!anchor) {
      const last = await db.collection('demand_forecast_actual').aggregate([
        { $group: { _id: null, maxFecha: { $max: "$Fecha" } } }
      ]).toArray();
      anchor = toDateSafe(last[0]?.maxFecha) || new Date();
    }
    // Ventana por meses alrededor del anchor (solo filtro; no se crean periodos)
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - pastMonths, 1));
    const endStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + futureMonths + 1, 1));
    const end = new Date(endStart.getTime() - 1); // fin del último mes
    minDate = start;
    maxDate = end;
  }

  // 2) Base (copia exacta)
  const baseCur = db.collection('demand_forecast_actual').find(
    { Fecha: { $gte: minDate, $lte: maxDate } },
    { projection: { _id: 0, Producto:1, Canal:1, Ubicacion:1, Fecha:1, 'Demanda Predicha':1 } }
  );

  const baseRows = [];
  for await (const b of baseCur) {
    const f = new Date(b.Fecha); // UTC 00:00 desde origen
    const baseVal = b['Demanda Predicha'] == null ? null : Number(b['Demanda Predicha']);
    baseRows.push({ Producto: b.Producto, Canal: b.Canal, Ubicacion: b.Ubicacion, Fecha: f, baseVal });
  }

  if (baseRows.length === 0) {
    await sessions.updateOne({ _id: session._id }, { $set: { updated_at: new Date() } });
    return { inserted: 0, rows: 0, combos: 0, periods: 0 };
  }

  const historico = db.collection(`historico_demanda_${appUser}`);

  // === Prefetch rápido ===
  // Combos a considerar (Producto|Canal|Ubicacion)
  const comboSet = new Set(baseRows.map(r => `${r.Producto}|${r.Canal}|${r.Ubicacion}`));

  // Fechas para REAL (mismas fechas exactas que base)
  const realDates = Array.from(new Set(baseRows.map(r => r.Fecha.getTime()))).map(t => new Date(t));

  // Fechas para YoY (previas) según modo
  const isWeekYoY = String(yoyMode).toLowerCase() === 'week';

  // Para fallback semanal: mapa de lunes ISO por fecha base
  const baseWeekMonByIso = new Map(); // key: baseDateISO -> weekMonISO
  const baseWeekMonSet = new Set();   // set de lunes ISO (sin duplicados)

  if (isWeekYoY) {
    for (const r of baseRows) {
      const weekMon = startOfISOWeekUTC(r.Fecha);
      const wkISO = weekMon.toISOString();
      baseWeekMonByIso.set(r.Fecha.toISOString(), wkISO);
      baseWeekMonSet.add(wkISO);
    }
  }

  // Fechas previas exactas: -52w ó -12m
  let yoyPrevDatesExact = [];
  if (isWeekYoY) {
    yoyPrevDatesExact = Array.from(new Set(
      baseRows.map(r => addDaysUTC(r.Fecha, -7 * 52).getTime())
    )).map(t => new Date(t));
  } else {
    yoyPrevDatesExact = Array.from(new Set(
      baseRows.map(r => addMonthsUTC(r.Fecha, -12).getTime())
    )).map(t => new Date(t));
  }

  // Fallback por lunes (solo semanal)
  const yoyPrevMondays = isWeekYoY
    ? Array.from(baseWeekMonSet).map(iso => addDaysUTC(new Date(iso), -7 * 52))
    : [];

  /** Prefetch REAL: Fecha IN, luego filtra por combo */
  const realMap = new Map();
  const REAL_BATCH = 1000;
  for (let i = 0; i < realDates.length; i += REAL_BATCH) {
    const datesChunk = realDates.slice(i, i + REAL_BATCH);
    const cur = historico
      .find(
        { Fecha: { $in: datesChunk } },
        { projection: { _id:0, Producto:1, Canal:1, Ubicacion:1, Fecha:1, Cantidad:1 } }
      )
      .hint({ Fecha: 1 }); // mantenemos tu hint
    for await (const h of cur) {
      const keyCombo = `${h.Producto}|${h.Canal}|${h.Ubicacion}`;
      if (!comboSet.has(keyCombo)) continue;
      const f = new Date(h.Fecha);
      const k = `${keyCombo}|${f.toISOString()}`;
      realMap.set(k, Number(h.Cantidad));
    }
  }

  /** Prefetch YoY: exacto y (si semanal) fallback por lunes */
  const yoyExactMap = new Map(); // key: combo|baseDateISO -> Cantidad anterior
  const yoyMonMap   = new Map(); // key: combo|baseWeekMonISO -> Cantidad del lunes anterior

  const YOY_BATCH = 1000;

  // 4a) Exacto: buscamos las fechas previas y remapeamos a la fecha base sumando +52w/+12m
  for (let i = 0; i < yoyPrevDatesExact.length; i += YOY_BATCH) {
    const datesChunk = yoyPrevDatesExact.slice(i, i + YOY_BATCH);
    const cur = historico
      .find(
        { Fecha: { $in: datesChunk } },
        { projection: { _id:0, Producto:1, Canal:1, Ubicacion:1, Fecha:1, Cantidad:1 } }
      )
      .hint({ Fecha: 1 });
    for await (const h of cur) {
      const keyComboPrev = `${h.Producto}|${h.Canal}|${h.Ubicacion}`;
      if (!comboSet.has(keyComboPrev)) continue;
      const fPrev = new Date(h.Fecha);                        // Fecha previa exacta
      const fCurr = isWeekYoY ? addDaysUTC(fPrev, 7 * 52)    // regresa a la fecha base por +52w
                              : addMonthsUTC(fPrev, +12);    // regresa a la fecha base por +12m
      const k = `${keyComboPrev}|${fCurr.toISOString()}`;
      yoyExactMap.set(k, Number(h.Cantidad));
    }
  }

  // 4b) Fallback semanal: lunes -52w → regresamos +52w para clave por lunes base
  if (isWeekYoY && yoyPrevMondays.length) {
    for (let i = 0; i < yoyPrevMondays.length; i += YOY_BATCH) {
      const datesChunk = yoyPrevMondays.slice(i, i + YOY_BATCH);
      const cur = historico
        .find(
          { Fecha: { $in: datesChunk } },
          { projection: { _id:0, Producto:1, Canal:1, Ubicacion:1, Fecha:1, Cantidad:1 } }
        )
        .hint({ Fecha: 1 });
      for await (const h of cur) {
        const keyComboPrev = `${h.Producto}|${h.Canal}|${h.Ubicacion}`;
        if (!comboSet.has(keyComboPrev)) continue;
        const prevMon = new Date(h.Fecha);               // lunes -52w
        const currMon = addDaysUTC(prevMon, 7 * 52);     // lunes base
        const k = `${keyComboPrev}|${currMon.toISOString()}`;
        yoyMonMap.set(k, Number(h.Cantidad));
      }
    }
  }

  // 5) Upsert planner_cells
  const ops = [];
  let combos = new Set();
  let periods = new Set();

  for (const row of baseRows) {
    const { Producto, Canal, Ubicacion, Fecha, baseVal } = row;
    const key = `${Producto}|${Canal}|${Ubicacion}|${Fecha.toISOString()}`;
    const actual   = realMap.has(key) ? realMap.get(key) : null;

    // prev_year: exacto → fallback semanal por lunes
    let prevYear = null;
    if (yoyExactMap.has(key)) {
      prevYear = yoyExactMap.get(key);
    } else if (isWeekYoY) {
      const weekMonISO = normalizeToAnchor(Fecha, 'W-MON').toISOString();
      const kMon = `${Producto}|${Canal}|${Ubicacion}|${weekMonISO}`;
      if (yoyMonMap.has(kMon)) prevYear = yoyMonMap.get(kMon);
    }

    ops.push({
      updateOne: {
        filter: { session_id, Producto, Canal, Ubicacion, Fecha },
        update: {
          $setOnInsert: { session_id, Producto, Canal, Ubicacion, Fecha, comments: [] },
          $set: {
            base_fcst: baseVal,
            plan_fcst: baseVal,
            actual,
            prev_year: prevYear,
            asertividad: computeAsertividad(actual, baseVal),
            edited_at: new Date()
          }
        },
        upsert: true
      }
    });

    combos.add(`${Producto}|${Canal}|${Ubicacion}`);
    periods.add(Fecha.toISOString());

    if (ops.length >= 5000) {
      await cells.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
  }

  if (ops.length) await cells.bulkWrite(ops, { ordered: false });
  await sessions.updateOne({ _id: session._id }, { $set: { updated_at: new Date() } });

  return { inserted: 'upserted', rows: baseRows.length, combos: combos.size, periods: periods.size };
}

/** ===== Matrix (lectura paginada) ===== **/
async function getMatrix(db, { session_id, page = 1, size = 200, filtros = {} }) {
  const q = { session_id };
  if (filtros.Producto) q.Producto = filtros.Producto;
  if (filtros.Canal) q.Canal = filtros.Canal;
  if (filtros.Ubicacion) q.Ubicacion = filtros.Ubicacion;

  const skip = Math.max(0, (page - 1) * (Number(size) || 200));
  const cursor = db.collection('planner_cells')
    .find(q)
    .sort({ Producto:1, Canal:1, Ubicacion:1, Fecha:1 })
    .skip(skip)
    .limit(Number(size) || 200);

  const rows = await cursor.toArray();
  const total = await db.collection('planner_cells').countDocuments(q);
  return { rows, page:Number(page), size:Number(size), total };
}

/** ===== Edición de celdas ===== **/
async function upsertCell(db, payload) {
  const { session_id, plan_fcst, comment, user } = payload;

  const k = payload.cellKey || {};
  const Producto  = payload.Producto  ?? k.Producto;
  const Canal     = payload.Canal     ?? k.Canal;
  const Ubicacion = payload.Ubicacion ?? k.Ubicacion;
  const FechaIn   = payload.Fecha     ?? k.Fecha;

  if (!Producto || !Canal || !Ubicacion || !FechaIn)
    throw new Error('Missing Producto/Canal/Ubicacion/Fecha');

  const cells = db.collection('planner_cells');
  const audit = db.collection('planner_audit');

  const sess = await db.collection('planner_sessions').findOne({ session_id }, { projection: { 'source.freq':1 } });
  const effFreq = String(sess?.source?.freq || 'M').toUpperCase();
  const isWeekly = effFreq.startsWith('W');

  const fIn = toDateSafe(FechaIn);
  if (!fIn) throw new Error('Invalid Fecha');
  let rangeStart, rangeEnd;
  if (isWeekly) {
    const date = new Date(fIn.getFullYear(), fIn.getMonth(), fIn.getDate());
    const day = date.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    date.setDate(date.getDate() + diff);
    rangeStart = date;
    rangeEnd = new Date(rangeStart); rangeEnd.setDate(rangeEnd.getDate() + 7);
  } else {
    rangeStart = new Date(fIn.getFullYear(), fIn.getMonth(), 1);
    rangeEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 1);
  }

  const doc = await cells.findOne({ session_id, Producto, Canal, Ubicacion, Fecha:{ $gte:rangeStart, $lt:rangeEnd } });
  if (!doc) throw new Error('Cell not found');

  const nextVal = Number(plan_fcst);
  if (!isFinite(nextVal) || nextVal < 0) throw new Error('Invalid plan_fcst');
  const before = { plan_fcst: doc.plan_fcst };
  const update = { $set: { plan_fcst: nextVal, edited_at: new Date() } };
  if (comment && String(comment).trim()) {
    update.$push = { comments: { user, text: String(comment).slice(0,300), ts: new Date() } };
  }

  await cells.updateOne({ _id: doc._id }, update);
  await audit.insertOne({
    session_id,
    cell: { Producto, Canal, Ubicacion, Fecha: doc.Fecha },
    user,
    before,
    after: { plan_fcst: nextVal },
    comment: comment ? String(comment).slice(0,300) : null,
    action: 'UPSERT',
    timestamp: new Date()
  });
  return { ok: true };
}

/** ===== Bulk & Publish ===== **/
async function upsertCellsBulk(db, { session_id, ops = [], requestId }) {
  let updated = 0; const errors = [];
  for (let i=0; i<ops.length; i++) {
    try { await upsertCell(db, { session_id, ...ops[i] }); updated++; }
    catch (e) { errors.push({ index:i, error:e.message }); }
  }
  return { ok: errors.length===0, updated, errors, requestId };
}

async function publishSession(db, { session_id }) {
  const session = await db.collection('planner_sessions').findOne({ session_id });
  if (!session) throw new Error('Session not found');

  const now = new Date();
  const cur = db.collection('planner_cells').find({ session_id });
  const histOps = [], actualOps = [];

  for await (const c of cur) {
    histOps.push({ insertOne: { document: {
      Producto:c.Producto, Canal:c.Canal, Ubicacion:c.Ubicacion, Fecha:c.Fecha,
      'Demanda Predicha':c.plan_fcst, forecast_date:now, scenario_id:session_id, source:'planner'
    }}});
    actualOps.push({ updateOne: {
      filter:{ Producto:c.Producto, Canal:c.Canal, Ubicacion:c.Ubicacion, Fecha:c.Fecha },
      update:{ $set:{ 'Demanda Predicha':c.plan_fcst, forecast_date:now, scenario_id:session_id, source:'planner' } },
      upsert:true
    }});
    if (histOps.length>=5000){ await db.collection('demand_forecast').bulkWrite(histOps,{ordered:false}); histOps.length=0; }
    if (actualOps.length>=5000){ await db.collection('demand_forecast_actual').bulkWrite(actualOps,{ordered:false}); actualOps.length=0; }
  }
  if (histOps.length) await db.collection('demand_forecast').bulkWrite(histOps,{ordered:false});
  if (actualOps.length) await db.collection('demand_forecast_actual').bulkWrite(actualOps,{ordered:false});

  await db.collection('planner_sessions').updateOne({ _id:session._id },
    { $set:{ status:'published', updated_at:now }, $inc:{ version:1 } });
  return { published_at: now };
}

module.exports = {
  openOrGetActiveSession,
  bootstrapSession,
  getMatrix,
  upsertCell,
  upsertCellsBulk,
  publishSession
};