// modulo_demanda/planner/api/planner.service.js
const { ObjectId } = require('mongodb');

/* ========================== DEBUG ========================== */
// Activa/desactiva logs de YoY
const DEBUG_YOY = false;
// Limita el ruido a un combo específico (ajústalo a lo que estés probando)
const DEBUG_FILTER = {
  Producto: 'BMX_1727',
  Canal: 'BMX_AUTOSERVICIOS',
  Ubicacion: 'BMX_3001',
};
function sameCombo(a, b) {
  return (
    a.Producto === b.Producto &&
    a.Canal === b.Canal &&
    a.Ubicacion === b.Ubicacion
  );
}
function dbg(...args) {
  if (DEBUG_YOY) console.log('[planner:YOY]', ...args);
}

/* ========================== UTILIDADES ========================== */

function computeAsertividad(real, est) {
  if (real == null || est == null) return null;
  const denom = Math.max(real, 1);
  return 1 - Math.abs(real - est) / denom;
}

function toDateSafe(d) {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

// Mantén addMonthsUTC como en tu baseline (mensual ya te funciona)
function addMonthsUTC(dateUTC, n) {
  const y = dateUTC.getUTCFullYear();
  const m = dateUTC.getUTCMonth() + n;
  const d = dateUTC.getUTCDate();
  const first = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const dd = Math.min(d, lastDay);
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), dd));
}
// Suma/resta años en UTC, respetando fin de mes (similar a addMonthsUTC)
function addYearsUTC(dateUTC, n) {
  const y = dateUTC.getUTCFullYear() + n;
  const m = dateUTC.getUTCMonth();
  const d = dateUTC.getUTCDate();
  const first = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const dd = Math.min(d, lastDay);
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), dd));
}

// Asegura medianoche UTC (YYYY-MM-DDT00:00:00.000Z)
function toUTC00(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Helpers semanales en UTC (sin tocar TZ de tus datos)
function addDaysUTC(dateUTC, days) {
  return new Date(
    Date.UTC(
      dateUTC.getUTCFullYear(),
      dateUTC.getUTCMonth(),
      dateUTC.getUTCDate() + days
    )
  );
}
function startOfISOWeekUTC(dateUTC) {
  const d = new Date(
    Date.UTC(
      dateUTC.getUTCFullYear(),
      dateUTC.getUTCMonth(),
      dateUTC.getUTCDate()
    )
  );
  const dow = d.getUTCDay(); // 0=Dom,1=Lun,...6=Sab
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + delta);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function tryHintFecha1(cursor) {
  // try { return cursor.hint({ Fecha: 1 }); } catch { return cursor; }
  return cursor;
}

/* ========================== SESIONES ========================== */

async function openOrGetActiveSession(
  db,
  { dbName, freq = 'W-MON', appUser = null }
) {
  const sessions = db.collection('planner_sessions');
  const now = new Date();

  // 1) Reusar una sesión abierta si existe para esta BD
  let session = await sessions.findOne({ db_name: dbName, status: 'open' });
  if (session) return session;

  // 2) Tomar la forecast_date más reciente del forecast activo
  const last = await db
    .collection('demand_forecast_actual')
    .aggregate([{ $group: { _id: null, maxFd: { $max: '$forecast_date' } } }])
    .toArray();

  // Usa helper existente si ya lo tienes; si no, cae a now
  const forecast_date = toDateSafe?.(last[0]?.maxFd) || new Date();

  // 3) Generar ID de sesión
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const isoDay = now.toISOString().slice(0, 10);
  const session_id = `PLN-${isoDay}-${rand}`;

  // 4) Insertar sesión nueva
  const doc = {
    session_id,
    db_name: dbName,
    app_user: appUser, // <- importante para multi-tenant
    owner: null,
    type: 'shared',
    status: 'open',
    source: { forecast_date, freq },
    participants: [],
    version: 1,
    created_at: now,
    updated_at: now,
  };

  await sessions.insertOne(doc);
  return doc;
}

/* ========================== BOOTSTRAP ========================== */
/**
 * Copia 1:1 de *ambas* colecciones:
 *   - demand_forecast (histórico, se toma el último forecast_date por DFU+Fecha)
 *   - demand_forecast_actual (activo, tiene prioridad sobre histórico)
 *
 * y enriquece planner_cells con:
 *  - base_fcst  : "Demanda Predicha"
 *  - plan_fcst  : "Demanda Planeada" (si existe) o base_fcst
 *  - actual     : histórico en la misma Fecha
 *  - prev_year  : según yoyMode => month: -12m | week: -52w (+fallback lunes ISO) | day: -1y
 */
async function bootstrapSession(db, {
  session_id,
  appUser,
  //dbName,
  fromDate,
  toDate,
  anchorDate,
  pastMonths = 0,
  futureMonths = 0,
  yoyMode, // 'month' | 'week' | 'day'
}) {
  const sessions = db.collection('planner_sessions');
  const cells = db.collection('planner_cells');

  const session = await sessions.findOne({ session_id });
  if (!session) throw new Error('Session not found');

  // Fallback: si no mandan yoyMode, lo deducimos de la freq de la sesión
  if (!yoyMode) {
    const srcFreq = String(session?.source?.freq || '').toUpperCase();
    if (srcFreq.startsWith('W')) yoyMode = 'week';
    else if (srcFreq === 'D') yoyMode = 'day';
    else yoyMode = 'month';
  }

  if (DEBUG_YOY) {
    console.log('[planner] bootstrap IN', {
      session_id,
      appUser,
      dbName,
      yoyMode,
      fromDate,
      toDate,
      anchorDate,
    });
  }

  // ---- Rango efectivo ----
// ---- Rango efectivo ----
  let minDate = toDateSafe(fromDate);
  let maxDate = toDateSafe(toDate);

  if (!minDate || !maxDate) {
    let anchor = toDateSafe(anchorDate);
    if (!anchor) {
      const last = await db
        .collection('demand_forecast_actual')
        .aggregate([{ $group: { _id: null, maxFecha: { $max: '$Fecha' } } }])
        .toArray();
      anchor = toDateSafe(last[0]?.maxFecha) || new Date();
    }

    // Usamos yoyMode como proxy de la frecuencia para definir "periodos"
    const windowMode = String(yoyMode).toLowerCase();
    const isWeekWindow = windowMode === 'week';
    const isDayWindow = windowMode === 'day';

    if (isDayWindow) {
      // 👉 past/future = N días
      // Ejemplo: past=2, future=5  → 2 días antes + anchor + 5 días después
      minDate = addDaysUTC(anchor, -pastMonths);
      maxDate = addDaysUTC(anchor, futureMonths);
    } else if (isWeekWindow) {
      // 👉 past/future = N semanas
      //  -pastMonths semanas hacia atrás, +futureMonths hacia adelante
      //  (usando 7 días por semana)
      minDate = addDaysUTC(anchor, -7 * pastMonths);
      maxDate = addDaysUTC(anchor, 7 * futureMonths);
    } else {
      // 👉 Modo mensual (comportamiento actual)
      const start = new Date(
        Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - pastMonths, 1)
      );
      const endStart = new Date(
        Date.UTC(
          anchor.getUTCFullYear(),
          anchor.getUTCMonth() + futureMonths + 1,
          1
        )
      );
      const end = new Date(endStart.getTime() - 1);
      minDate = start;
      maxDate = end;
    }
  }

  dbg('Rango efectivo:', {
    minDateISO: minDate?.toISOString(),
    maxDateISO: maxDate?.toISOString(),
  });

  // ---- Base rows: demanda histórica + forecast actual ----
  const baseMap = new Map(); // key: Producto|Canal|Ubicacion|FechaISO

  function upsertBase(doc, source) {
    const f = toUTC00(doc.Fecha);
    const key = `${doc.Producto}|${doc.Canal}|${doc.Ubicacion}|${f.toISOString()}`;
    const baseVal =
      doc['Demanda Predicha'] == null ? null : Number(doc['Demanda Predicha']);
    const planVal =
      doc['Demanda Planeada'] != null
        ? Number(doc['Demanda Planeada'])
        : baseVal;
    const fd = toDateSafe(doc.forecast_date) || new Date(0);

    const prev = baseMap.get(key);
    if (!prev) {
      baseMap.set(key, {
        Producto: doc.Producto,
        Canal: doc.Canal,
        Ubicacion: doc.Ubicacion,
        Fecha: f,
        baseVal,
        planVal,
        forecast_date: fd,
        source,
      });
      return;
    }

    // Prioridad:
    //  - Si el nuevo es "actual", siempre gana.
    //  - Si ambos son del mismo tipo, gana el de forecast_date más reciente.
    if (source === 'actual' && prev.source !== 'actual') {
      baseMap.set(key, {
        ...prev,
        baseVal,
        planVal,
        forecast_date: fd,
        source,
      });
    } else if (source === prev.source && fd > prev.forecast_date) {
      baseMap.set(key, {
        ...prev,
        baseVal,
        planVal,
        forecast_date: fd,
        source,
      });
    }
  }

  // 1) Histórico: demand_forecast
  const histCur = db.collection('demand_forecast').find(
    { Fecha: { $gte: minDate, $lte: maxDate } },
    {
      projection: {
        _id: 0,
        Producto: 1,
        Canal: 1,
        Ubicacion: 1,
        Fecha: 1,
        'Demanda Predicha': 1,
        'Demanda Planeada': 1,
        forecast_date: 1,
      },
    }
  );
  for await (const h of histCur) {
    upsertBase(h, 'historical');
  }

  // 2) Activo: demand_forecast_actual (pinta encima del histórico)
  const actCur = db.collection('demand_forecast_actual').find(
    { Fecha: { $gte: minDate, $lte: maxDate } },
    {
      projection: {
        _id: 0,
        Producto: 1,
        Canal: 1,
        Ubicacion: 1,
        Fecha: 1,
        'Demanda Predicha': 1,
        'Demanda Planeada': 1,
        forecast_date: 1,
      },
    }
  );
  for await (const b of actCur) {
    upsertBase(b, 'actual');
  }

  const baseRows = Array.from(baseMap.values()).map(
    ({ forecast_date, source, ...rest }) => rest
  );

  dbg('baseRows count:', baseRows.length);
  if (DEBUG_YOY) {
    const sample = baseRows.slice(0, 5).map((r) => ({
      Producto: r.Producto,
      Canal: r.Canal,
      Ubicacion: r.Ubicacion,
      Fecha: r.Fecha.toISOString(),
    }));
    dbg('base sample:', sample);
  }

  if (!baseRows.length) {
    await sessions.updateOne(
      { _id: session._id },
      { $set: { updated_at: new Date() } }
    );
    return { inserted: 0, rows: 0, combos: 0, periods: 0 };
  }

  //const historico = db.collection(`historico_demanda_${dbName}`);
  const historico = db.collection(`historico_demanda_${appUser}`);
  const comboSet = new Set(
    baseRows.map((r) => `${r.Producto}|${r.Canal}|${r.Ubicacion}`)
  );

  // ---- REAL: mismas fechas exactas ----
  const realDates = Array.from(
    new Set(baseRows.map((r) => r.Fecha.getTime()))
  ).map((t) => new Date(t));
  const realMap = new Map();
  for (let i = 0; i < realDates.length; i += 1000) {
    const chunk = realDates.slice(i, i + 1000);
    let cur = historico.find(
      { Fecha: { $in: chunk } },
      {
        projection: {
          _id: 0,
          Producto: 1,
          Canal: 1,
          Ubicacion: 1,
          Fecha: 1,
          Cantidad: 1,
        },
      }
    );
    cur = tryHintFecha1(cur);
    for await (const h of cur) {
      const keyCombo = `${h.Producto}|${h.Canal}|${h.Ubicacion}`;
      if (!comboSet.has(keyCombo)) continue;
      const k = `${keyCombo}|${toUTC00(h.Fecha).toISOString()}`;
      realMap.set(k, Number(h.Cantidad));
    }
  }

  // ---- prev_year: month | week | day ----
  const mode = String(yoyMode).toLowerCase();
  const isWeekYoY = mode === 'week';
  const isDayYoY = mode === 'day';
  dbg('isWeekYoY?', isWeekYoY, '| isDayYoY?', isDayYoY);

  // Fechas del año/periodo previo "exactas"
  const yoyPrevDatesExact = Array.from(
    new Set(
      baseRows.map((r) => {
        const base = toUTC00(r.Fecha);
        if (isWeekYoY) return addDaysUTC(base, -7 * 52).getTime(); // semana previa (52w)
        if (isDayYoY) return addYearsUTC(base, -1).getTime(); // mismo día -1y
        return addMonthsUTC(base, -12).getTime(); // mismo día de mes -12m
      })
    )
  ).map((t) => new Date(t));

  dbg('yoyPrevDatesExact size:', yoyPrevDatesExact.length);
  if (isWeekYoY) {
    const rowsCombo = baseRows.filter((r) => sameCombo(r, DEBUG_FILTER));
    const peek = rowsCombo.slice(0, 3).map((r) => ({
      base: r.Fecha.toISOString(),
      prevExact: addDaysUTC(r.Fecha, -7 * 52).toISOString(),
      mondayBase: startOfISOWeekUTC(r.Fecha).toISOString(),
      mondayPrev: addDaysUTC(startOfISOWeekUTC(r.Fecha), -7 * 52).toISOString(),
    }));
    dbg('peek weekly (combo filtro):', peek);
  }

  // Prefetch exacto y remapeo a fecha base (+12m / +52w / +1y)
  const yoyExactMap = new Map(); // combo|baseISO -> Cantidad
  for (let i = 0; i < yoyPrevDatesExact.length; i += 1000) {
    const chunk = yoyPrevDatesExact.slice(i, i + 1000);
    let cur = historico.find(
      { Fecha: { $in: chunk } },
      {
        projection: {
          _id: 0,
          Producto: 1,
          Canal: 1,
          Ubicacion: 1,
          Fecha: 1,
          Cantidad: 1,
        },
      }
    );
    cur = tryHintFecha1(cur);
    for await (const h of cur) {
      const keyComboPrev = `${h.Producto}|${h.Canal}|${h.Ubicacion}`;
      if (!comboSet.has(keyComboPrev)) continue;
      const fPrev = toUTC00(h.Fecha);
      let fCurr;
      if (isWeekYoY) fCurr = addDaysUTC(fPrev, 7 * 52);
      else if (isDayYoY) fCurr = addYearsUTC(fPrev, 1);
      else fCurr = addMonthsUTC(fPrev, 12);

      const k = `${keyComboPrev}|${fCurr.toISOString()}`;
      yoyExactMap.set(k, Number(h.Cantidad));
    }
  }

  // Fallback por lunes ISO (solo semanal)
  const yoyMonMap = new Map(); // combo|mondayBaseISO -> Cantidad
  if (isWeekYoY) {
    const seenPrevMondays = new Set();
    const prevMondays = [];
    for (const r of baseRows) {
      const mondayBase = startOfISOWeekUTC(r.Fecha);
      const prevMon = addDaysUTC(mondayBase, -7 * 52);
      const iso = prevMon.toISOString();
      if (!seenPrevMondays.has(iso)) {
        seenPrevMondays.add(iso);
        prevMondays.push(prevMon);
      }
    }
    for (let i = 0; i < prevMondays.length; i += 1000) {
      const chunk = prevMondays.slice(i, i + 1000);
      let cur = historico.find(
        { Fecha: { $in: chunk } },
        {
          projection: {
            _id: 0,
            Producto: 1,
            Canal: 1,
            Ubicacion: 1,
            Fecha: 1,
            Cantidad: 1,
          },
        }
      );
      cur = tryHintFecha1(cur);
      for await (const h of cur) {
        const keyComboPrev = `${h.Producto}|${h.Canal}|${h.Ubicacion}`;
        if (!comboSet.has(keyComboPrev)) continue;
        const prevMon = startOfISOWeekUTC(h.Fecha); // lunes -52w
        const currMon = addDaysUTC(prevMon, 7 * 52); // lunes base
        const k = `${keyComboPrev}|${currMon.toISOString()}`;
        yoyMonMap.set(k, Number(h.Cantidad));
      }
    }
  }

  dbg('maps sizes:', {
    realMap: realMap.size,
    yoyExactMap: yoyExactMap.size,
    yoyMonMap: yoyMonMap.size,
  });

  // ---- UPSERT planner_cells ----
  const ops = [];
  const combos = new Set(),
    periods = new Set();

  for (const row of baseRows) {
    const { Producto, Canal, Ubicacion, Fecha, baseVal, planVal } = row;
    const key = `${Producto}|${Canal}|${Ubicacion}|${Fecha.toISOString()}`;
    const actual = realMap.get(key) ?? null;

    const isDebugCombo = sameCombo(row, DEBUG_FILTER);
    if (isDebugCombo) {
      const mondayBaseISO = startOfISOWeekUTC(Fecha).toISOString();
      const kMon = `${Producto}|${Canal}|${Ubicacion}|${mondayBaseISO}`;
      dbg('ROW base', { key, mondayBaseISO });
      dbg('has REAL?', realMap.has(key));
      dbg('has yoyExact?', yoyExactMap.has(key));
      if (isWeekYoY) dbg('has yoyMonday?', yoyMonMap.has(kMon));
    }

    // Resolver prev_year
    let prevYear = null;

    // 1) Exacto
    if (yoyExactMap.has(key)) {
      prevYear = yoyExactMap.get(key);
      if (isDebugCombo) dbg('prev_year by EXACT =', prevYear);
    }

    // 2) Fallback lunes ISO (solo week)
    if (prevYear == null && isWeekYoY) {
      const mondayBaseISO = startOfISOWeekUTC(Fecha).toISOString();
      const kMon = `${Producto}|${Canal}|${Ubicacion}|${mondayBaseISO}`;
      if (yoyMonMap.has(kMon)) {
        prevYear = yoyMonMap.get(kMon);
        if (isDebugCombo) dbg('prev_year by MON =', prevYear);
      }
    }

    // 3) Búsqueda puntual por semana previa (último recurso, solo week)
    if (prevYear == null && isWeekYoY) {
      try {
        const mondayBase = startOfISOWeekUTC(Fecha);
        const prevMon = addDaysUTC(mondayBase, -7 * 52);
        const prevSun = addDaysUTC(prevMon, 7);
        const punt = await historico.findOne(
          {
            Producto,
            Canal,
            Ubicacion,
            Fecha: { $gte: prevMon, $lt: prevSun },
          },
          { projection: { _id: 0, Cantidad: 1, Fecha: 1 } }
        );
        if (isDebugCombo)
          dbg('puntual weekPrev:', {
            prevMon: prevMon.toISOString(),
            prevSun: prevSun.toISOString(),
            found: !!punt,
            Fecha: punt?.Fecha ? toUTC00(punt.Fecha).toISOString() : null,
            Cantidad: punt?.Cantidad ?? null,
          });
        if (punt && punt.Cantidad != null) {
          prevYear = Number(punt.Cantidad);
          if (isDebugCombo) dbg('prev_year by PUNTUAL =', prevYear);
        }
      } catch (e) {
        if (isDebugCombo) dbg('puntual ERROR', e.message);
      }
    }

    if (isDebugCombo && prevYear == null) {
      dbg('prev_year stays NULL for base:', Fecha.toISOString());
    }

    const effectivePlan = planVal != null ? planVal : baseVal;

    ops.push({
      updateOne: {
        filter: { session_id, Producto, Canal, Ubicacion, Fecha },
        update: {
          $setOnInsert: {
            session_id,
            Producto,
            Canal,
            Ubicacion,
            Fecha,
            comments: [],
          },
          $set: {
            base_fcst: baseVal,
            plan_fcst: effectivePlan,
            actual,
            prev_year: prevYear,
            asertividad: computeAsertividad(actual, baseVal),
            edited_at: new Date(),
          },
        },
        upsert: true,
      },
    });

    combos.add(`${Producto}|${Canal}|${Ubicacion}`);
    periods.add(Fecha.toISOString());

    if (ops.length >= 5000) {
      await cells.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
  }

  if (ops.length) await cells.bulkWrite(ops, { ordered: false });
  await sessions.updateOne(
    { _id: session._id },
    { $set: { updated_at: new Date() } }
  );

  return {
    inserted: 'upserted',
    rows: baseRows.length,
    combos: combos.size,
    periods: periods.size,
  };
}

/* ========================== MATRIX ========================== */

async function getMatrix(
  db,
  { session_id, page = 1, size = 200, filtros = {} }
) {
  const q = { session_id };
  if (filtros.Producto) q.Producto = filtros.Producto;
  if (filtros.Canal) q.Canal = filtros.Canal;
  if (filtros.Ubicacion) q.Ubicacion = filtros.Ubicacion;

  // 👇 Nuevo: si viene anchorDate, filtramos por Fecha >= anchorDate
  if (filtros.anchorDate) {
    const min = toDateSafe(filtros.anchorDate);
    if (min) {
      q.Fecha = { ...(q.Fecha || {}), $gte: min };
    }
  }

  const skip = Math.max(0, (page - 1) * (Number(size) || 200));
  const cursor = db
    .collection("planner_cells")
    .find(q)
    .sort({ Producto: 1, Canal: 1, Ubicacion: 1, Fecha: 1 })
    .skip(skip)
    .limit(Number(size) || 200);

  const rows = await cursor.toArray();
  const total = await db.collection("planner_cells").countDocuments(q);
  return { rows, page: Number(page), size: Number(size), total };
}

/* ========================== EDICIÓN ========================== */

async function upsertCell(db, payload) {
  const { session_id, plan_fcst, comment, user, cellId } = payload;

  const cells = db.collection('planner_cells');
  const audit = db.collection('planner_audit');

  let doc;

  // 1) Ruta nueva: actualizar por _id (cellId)
  if (cellId) {
    try {
      doc = await cells.findOne({
        _id: new ObjectId(cellId),
        session_id,
      });
    } catch (e) {
      throw new Error('Invalid cellId');
    }
  } else {
    // 2) Ruta legacy: localizar por llave lógica + rango (semana/mes)
    const k = payload.cellKey || {};
    const Producto = payload.Producto ?? k.Producto;
    const Canal = payload.Canal ?? k.Canal;
    const Ubicacion = payload.Ubicacion ?? k.Ubicacion;
    const FechaIn = payload.Fecha ?? k.Fecha;

    if (!Producto || !Canal || !Ubicacion || !FechaIn)
      throw new Error('Missing Producto/Canal/Ubicacion/Fecha');

    const sess = await db
      .collection('planner_sessions')
      .findOne({ session_id }, { projection: { 'source.freq': 1 } });

    const effFreq = String(sess?.source?.freq || 'M').toUpperCase();
    const isWeekly = effFreq.startsWith('W');

    const fIn = toDateSafe(FechaIn);
    if (!fIn) throw new Error('Invalid Fecha');

    let rangeStart, rangeEnd;
    if (isWeekly) {
      const date = new Date(fIn.getFullYear(), fIn.getMonth(), fIn.getDate());
      const day = date.getDay(); // 0=Dom,1=Lun,...6=Sab
      const diff = day === 0 ? -6 : 1 - day; // lunes ISO
      date.setDate(date.getDate() + diff);
      rangeStart = date;
      rangeEnd = new Date(rangeStart);
      rangeEnd.setDate(rangeEnd.getDate() + 7); // [Lun, Lun+7)
    } else {
      // mensual (o diaria) → bucket por mes
      rangeStart = new Date(fIn.getFullYear(), fIn.getMonth(), 1);
      rangeEnd = new Date(
        rangeStart.getFullYear(),
        rangeStart.getMonth() + 1,
        1
      );
    }

    doc = await cells.findOne({
      session_id,
      Producto,
      Canal,
      Ubicacion,
      Fecha: { $gte: rangeStart, $lt: rangeEnd },
    });
  }

  if (!doc) throw new Error('Cell not found');

  // 3) Construimos el update dinámicamente
  const update = { $set: { edited_at: new Date() } };
  const before = { plan_fcst: doc.plan_fcst };

  let nextVal = doc.plan_fcst;
  let changedPlan = false;

  // plan_fcst sólo si viene definido en el payload
  if (plan_fcst !== undefined) {
    if (plan_fcst === null) {
      nextVal = null;
    } else {
      const n = Number(plan_fcst);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error('Invalid plan_fcst');
      }
      nextVal = n;
    }
    update.$set.plan_fcst = nextVal;

    const prevVal =
      doc.plan_fcst === undefined ? null : Number(doc.plan_fcst);
    changedPlan =
      (prevVal ?? null) !== (nextVal ?? null) &&
      !(prevVal == null && nextVal == null);
  }

  // comment opcional
  let commentText = null;
  if (comment && String(comment).trim()) {
    commentText = String(comment).slice(0, 300);
    update.$push = {
      comments: {
        user,
        text: commentText,
        ts: new Date(),
      },
    };
  }

  await cells.updateOne({ _id: doc._id }, update);

  // 4) Registrar en auditoría (aunque sólo sea comentario)
  await audit.insertOne({
    session_id,
    cell: {
      _id: doc._id,
      Producto: doc.Producto,
      Canal: doc.Canal,
      Ubicacion: doc.Ubicacion,
      Fecha: doc.Fecha,
    },
    user,
    before: changedPlan ? before : null,
    after: changedPlan ? { plan_fcst: nextVal } : null,
    comment: commentText,
    action: 'UPSERT',
    timestamp: new Date(),
  });

  return { ok: true };
}

/* ========================== BULK & PUBLISH ========================== */

async function upsertCellsBulk(db, { session_id, ops = [], requestId }) {
  let updated = 0;
  const errors = [];
  for (let i = 0; i < ops.length; i++) {
    try {
      await upsertCell(db, { session_id, ...ops[i] });
      updated++;
    } catch (e) {
      errors.push({ index: i, error: e.message });
    }
  }
  return { ok: errors.length === 0, updated, errors, requestId };
}

async function publishSession(db, { session_id }) {
  const session = await db.collection('planner_sessions').findOne({ session_id });
  if (!session) throw new Error('Session not found');

  const now = new Date();
  const cur = db.collection('planner_cells').find({ session_id });
  const actualOps = [];
  const histOps = [];

  let rows = 0;
  for await (const c of cur) {
    rows++;

    const edited =
      c.plan_fcst != null &&
      c.base_fcst != null &&
      Number(c.plan_fcst) !== Number(c.base_fcst);

    const filter = {
      Producto: c.Producto,
      Canal: c.Canal,
      Ubicacion: c.Ubicacion,
      Fecha: c.Fecha,
    };

    if (edited) {
      const demandaPlaneada = Number(c.plan_fcst);
      actualOps.push({
        updateOne: {
          filter,
          update: { $set: { 'Demanda Planeada': demandaPlaneada } },
          upsert: false,
        },
      });
      histOps.push({
        updateMany: {
          filter,
          update: { $set: { 'Demanda Planeada': demandaPlaneada } },
          upsert: false,
        },
      });
    } else {
      actualOps.push({
        updateOne: {
          filter,
          update: { $unset: { 'Demanda Planeada': '' } },
          upsert: false,
        },
      });
      histOps.push({
        updateMany: {
          filter,
          update: { $unset: { 'Demanda Planeada': '' } },
          upsert: false,
        },
      });
    }

    if (actualOps.length >= 5000) {
      await db.collection('demand_forecast_actual').bulkWrite(actualOps, { ordered: false });
      actualOps.length = 0;
    }
    if (histOps.length >= 5000) {
      await db.collection('demand_forecast').bulkWrite(histOps, { ordered: false });
      histOps.length = 0;
    }
  }

  const actualRes = actualOps.length
    ? await db.collection('demand_forecast_actual').bulkWrite(actualOps, { ordered: false })
    : null;
  const histRes = histOps.length
    ? await db.collection('demand_forecast').bulkWrite(histOps, { ordered: false })
    : null;

  // Limpiar temporales de la sesión (planner_cells)
  await db.collection('planner_cells').deleteMany({ session_id });

  // Marcar sesión como CLOSED
  const closed_at = new Date();
  await db.collection('planner_sessions').updateOne(
    { _id: session._id },
    {
      $set: { status: 'closed', updated_at: closed_at, closed_at },
      $inc: { version: 1 },
    }
  );

  return {
    published_at: now,
    closed_at,
    applied_cells: rows,
    actual: actualRes ? { matched: actualRes.matchedCount, modified: actualRes.modifiedCount } : { matched: 0, modified: 0 },
    historic: histRes ? { matched: histRes.matchedCount, modified: histRes.modifiedCount } : { matched: 0, modified: 0 },
  };
}

async function saveSession(db, { session_id }) {
  // Guarda cambios aplicando SOLO "Demanda Planeada"
  // Mantiene la sesión abierta y NO borra planner_cells.

  const session = await db.collection('planner_sessions').findOne({ session_id });
  if (!session) throw new Error('Session not found');

  const now = new Date();
  const cur = db.collection('planner_cells').find({ session_id });

  const actualOps = [];
  const histOps = [];
  let rows = 0;

  for await (const c of cur) {
    rows++;

    const edited =
      c.plan_fcst != null &&
      c.base_fcst != null &&
      Number(c.plan_fcst) !== Number(c.base_fcst);

    const filter = {
      Producto: c.Producto,
      Canal: c.Canal,
      Ubicacion: c.Ubicacion,
      Fecha: c.Fecha,
    };

    if (edited) {
      const demandaPlaneada = Number(c.plan_fcst);
      actualOps.push({
        updateOne: {
          filter,
          update: { $set: { 'Demanda Planeada': demandaPlaneada } },
          upsert: false,
        },
      });
      histOps.push({
        updateMany: {
          filter,
          update: { $set: { 'Demanda Planeada': demandaPlaneada } },
          upsert: false,
        },
      });
    } else {
      actualOps.push({
        updateOne: {
          filter,
          update: { $unset: { 'Demanda Planeada': '' } },
          upsert: false,
        },
      });
      histOps.push({
        updateMany: {
          filter,
          update: { $unset: { 'Demanda Planeada': '' } },
          upsert: false,
        },
      });
    }

    if (actualOps.length >= 5000) {
      await db.collection('demand_forecast_actual').bulkWrite(actualOps, { ordered: false });
      actualOps.length = 0;
    }
    if (histOps.length >= 5000) {
      await db.collection('demand_forecast').bulkWrite(histOps, { ordered: false });
      histOps.length = 0;
    }
  }

  const actualRes = actualOps.length
    ? await db.collection('demand_forecast_actual').bulkWrite(actualOps, { ordered: false })
    : null;
  const histRes = histOps.length
    ? await db.collection('demand_forecast').bulkWrite(histOps, { ordered: false })
    : null;

  // Mantiene la sesión abierta; sólo actualiza updated_at
  await db.collection('planner_sessions').updateOne(
    { _id: session._id },
    { $set: { updated_at: new Date() } }
  );

  return {
    published_at: now,
    closed: false,
    applied_cells: rows,
    actual: actualRes ? { matched: actualRes.matchedCount, modified: actualRes.modifiedCount } : { matched: 0, modified: 0 },
    historic: histRes ? { matched: histRes.matchedCount, modified: histRes.modifiedCount } : { matched: 0, modified: 0 },
  };
}

// === Participantes ===
async function addParticipant(db, { session_id, user }) {
  const sessions = db.collection('planner_sessions');
  const now = new Date();

  // 1) Quitar cualquier entrada previa del mismo user (idempotente)
  await sessions.updateOne(
    { session_id },
    { $pull: { participants: { user } } }
  );

  // 2) Agregar una sola entrada fresca de ese user
  const r = await sessions.updateOne(
    { session_id },
    {
      $set: { updated_at: now },
      $addToSet: {
        participants: { user, joined_at: now, last_seen: now },
      },
    }
  );
  if (!r.matchedCount) throw new Error('Session not found');
  return { ok: true, joined_at: now };
}

async function heartbeatParticipant(db, { session_id, user }) {
  const sessions = db.collection('planner_sessions');
  const now = new Date();

  const r = await sessions.updateOne(
    { session_id, 'participants.user': user },
    {
      $set: {
        updated_at: now,
        'participants.$.last_seen': now,
      },
    }
  );

  if (!r.matchedCount) {
    // si no existía (ej. refrescó pestaña), equivale a join
    await addParticipant(db, { session_id, user });
    return { ok: true, last_seen: now, joined: true };
  }
  return { ok: true, last_seen: now, joined: false };
}

async function removeParticipant(db, { session_id, user }) {
  const sessions = db.collection('planner_sessions');
  const now = new Date();

  const r = await sessions.updateOne(
    { session_id },
    {
      $set: { updated_at: now },
      $pull: { participants: { user } },
    }
  );
  if (!r.matchedCount) throw new Error('Session not found');
  return { ok: true, removed_at: now };
}

// Cierra si ya no hay participantes (llama publishSession y marca closed)
async function autoCloseIfEmpty(db, { session_id }) {
  const sessions = db.collection('planner_sessions');
  const s = await sessions.findOne(
    { session_id },
    { projection: { _id: 1, participants: 1, status: 1 } }
  );
  if (!s) throw new Error('Session not found');
  if (s.status === 'closed') return { alreadyClosed: true };

  const count = Array.isArray(s.participants) ? s.participants.length : 0;
  if (count === 0) {
    const out = await publishSession(db, { session_id });
    return { closed: true, ...out };
  }
  return { closed: false, participants: count };
}

// Cierra sesion en caso de que usuarios estan inactivos
async function cleanupInactiveParticipants(
  db,
  { session_id, graceSeconds = 90 }
) {
  const sessions = db.collection('planner_sessions');
  const now = new Date();
  const cutoff = new Date(now.getTime() - graceSeconds * 1000);

  // 1. Quitar inactivos
  const r = await sessions.updateOne(
    { session_id },
    { $pull: { participants: { last_seen: { $lt: cutoff } } } }
  );

  // 2. Intentar cierre si ya no queda nadie
  const auto = await autoCloseIfEmpty(db, { session_id });

  return { ok: true, removed: r.modifiedCount, cutoff, auto };
}

//AUTOCERRADO DE SESION

// Lista sesiones abiertas (solo id para barrido)
async function listOpenSessions(db) {
  return db
    .collection('planner_sessions')
    .find({ status: { $ne: 'closed' } }, { projection: { _id: 0, session_id: 1 } })
    .toArray();
}

// Limpia inactivos en TODAS las sesiones abiertas
async function cleanupAllOpenSessions(db, { graceSeconds = 90 } = {}) {
  const open = await listOpenSessions(db);
  const results = [];
  for (const s of open) {
    const out = await cleanupInactiveParticipants(db, {
      session_id: s.session_id,
      graceSeconds,
    });
    results.push({ session_id: s.session_id, ...out });
  }
  return results;
}

//--------------------FILTROS--------------------------

async function getFilterOptions(db, { session_id }) {
  const cells = db.collection('planner_cells');

  const [productos, canales, ubicaciones] = await Promise.all([
    cells.distinct('Producto', { session_id }),
    cells.distinct('Canal', { session_id }),
    cells.distinct('Ubicacion', { session_id }),
  ]);

  return {
    Producto: productos.filter(Boolean).sort(),
    Canal: canales.filter(Boolean).sort(),
    Ubicacion: ubicaciones.filter(Boolean).sort(),
  };
}

/* ========================== DFU DETAIL (SERIES + COMMENTS) ========================== */

async function getDfuSeries(db, {
  session_id,
  Producto,
  Canal,
  Ubicacion,
  fromDate,
  toDate,
}) {
  if (!session_id) throw new Error('session_id requerido');
  if (!Producto || !Canal || !Ubicacion) throw new Error('Producto/Canal/Ubicacion requeridos');

  const q = { session_id, Producto, Canal, Ubicacion };

  const f0 = toDateSafe(fromDate);
  const f1 = toDateSafe(toDate);
  if (f0 || f1) {
    q.Fecha = {};
    if (f0) q.Fecha.$gte = f0;
    if (f1) q.Fecha.$lt = f1;
  }

  const rows = await db.collection('planner_cells')
    .find(q, {
      projection: {
        _id: 0,
        Fecha: 1,
        actual: 1,
        plan_fcst: 1,
        base_fcst: 1,
        prev_year: 1,
        asertividad: 1,
      }
    })
    .sort({ Fecha: 1 })
    .toArray();

  // Normaliza a series [{date, y}]
  const series = {
    actual: [],
    plan_fcst: [],
    base_fcst: [],
    prev_year: [],
    asertividad: [],
  };

  for (const r of rows) {
    const iso = (r.Fecha instanceof Date ? r.Fecha : new Date(r.Fecha)).toISOString().slice(0, 10);

    series.actual.push({ date: iso, y: r.actual ?? null });
    series.plan_fcst.push({ date: iso, y: r.plan_fcst ?? null });
    series.base_fcst.push({ date: iso, y: r.base_fcst ?? null });
    series.prev_year.push({ date: iso, y: r.prev_year ?? null });
    series.asertividad.push({ date: iso, y: r.asertividad ?? null });
  }

  return { rows: rows.length, series };
}

async function getDfuComments(db, {
  // session_id ya NO es requerido para buscar; se puede usar como filtro opcional si lo quieres
  session_id,
  Producto,
  Canal,
  Ubicacion,
  limit = 50,
  before, // cursor opcional (timestamp)
}) {
  if (!Producto || !Canal || !Ubicacion) {
    throw new Error('Producto/Canal/Ubicacion requeridos');
  }

  const q = {
    'cell.Producto': Producto,
    'cell.Canal': Canal,
    'cell.Ubicacion': Ubicacion,
    comment: { $ne: null },
  };

  // opcional: si algún día quieres filtrar solo por una sesión
  if (session_id) q.session_id = session_id;

  if (before) {
    const dt = toDateSafe(before);
    if (dt) q.timestamp = { $lt: dt };
  }

  const docs = await db.collection('planner_audit')
    .find(q, {
      projection: {
        // dejamos session_id para traceability
        before: 0,
        after: 0,
      },
    })
    .sort({ timestamp: -1 })
    .limit(Math.min(200, Math.max(1, Number(limit) || 50)))
    .toArray();

  // Normaliza para UI
  return docs.map((d) => ({
    _id: d._id,
    text: d.comment,
    created_by: d.user || null,
    created_at: d.timestamp,
    session_id: d.session_id,
    action: d.action,
    cell: d.cell, // incluye Fecha (informativo)
  }));
}

async function addDfuComment(db, {
  session_id,
  Producto,
  Canal,
  Ubicacion,
  user,
  text,
}) {
  if (!session_id) throw new Error('session_id requerido');
  if (!Producto || !Canal || !Ubicacion) throw new Error('Producto/Canal/Ubicacion requeridos');

  const t = String(text || '').trim();
  if (!t) throw new Error('text requerido');
  if (t.length > 2000) throw new Error('text demasiado largo (max 2000)');

  const cells = db.collection('planner_cells');
  const audit = db.collection('planner_audit');

  // Tomamos una celda representativa del DFU (la más reciente)
  const cellDoc = await cells.findOne(
    { session_id, Producto, Canal, Ubicacion },
    { sort: { Fecha: -1 }, projection: { _id: 1, Producto: 1, Canal: 1, Ubicacion: 1, Fecha: 1 } }
  );

  if (!cellDoc) throw new Error('No existe planner_cells para este DFU en esta sesión');

  const now = new Date();

  const out = await audit.insertOne({
    session_id,
    cell: {
      _id: cellDoc._id,
      Producto: cellDoc.Producto,
      Canal: cellDoc.Canal,
      Ubicacion: cellDoc.Ubicacion,
      Fecha: cellDoc.Fecha,
    },
    user: user || null,
    before: null,
    after: null,
    comment: t,
    action: 'COMMENT',  // 👈 distingue de UPSERT
    timestamp: now,
  });

  return {
    ok: true,
    _id: out.insertedId,
    text: t,
    created_by: user || null,
    created_at: now,
    cell: {
      _id: cellDoc._id,
      Producto: cellDoc.Producto,
      Canal: cellDoc.Canal,
      Ubicacion: cellDoc.Ubicacion,
      Fecha: cellDoc.Fecha,
    },
    action: 'COMMENT',
  };
}

module.exports = {
  openOrGetActiveSession,
  bootstrapSession,
  getMatrix,
  upsertCell,
  upsertCellsBulk,
  publishSession,
  saveSession,
  addParticipant,
  heartbeatParticipant,
  removeParticipant,
  autoCloseIfEmpty,
  cleanupInactiveParticipants,
  listOpenSessions,
  cleanupAllOpenSessions,
  getFilterOptions,
  getDfuSeries,
  getDfuComments,
  addDfuComment
};