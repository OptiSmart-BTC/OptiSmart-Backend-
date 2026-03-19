const express = require("express");
const {
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
  cleanupAllOpenSessions,
  getFilterOptions,
  getDfuSeries,
  getDfuComments,
  addDfuComment
} = require("./planner.service");

function plannerRouter() {
  const r = express.Router();

  // Crear/obtener sesión activa
r.post("/session/open", async (req, res) => {
  try {
    let { dbName, freq } = req.body;

    // Normalización de frecuencia permitida: M, W-MON, D
    const allowed_freq = new Set(["M", "W-MON", "D"]);
    if (typeof freq === "string") {
      freq = freq.toUpperCase();
    }
    if (!allowed_freq.has(freq)) {
      // default conservador si no viene o es desconocida
      freq = "M";
    }

    // req.appUser y req.db vienen del middleware /planner en app.js
    const session = await openOrGetActiveSession(req.db, {
      dbName,
      freq,
      appUser: req.appUser,
    });

    res.json(session);
  } catch (e) {
    console.error("Error /session/open:", e);
    res.status(500).json({ error: e.message });
  }
});

  // Bootstrap (filtros directos; no fabricamos periodos)
  r.post("/:sessionId/bootstrap", async (req, res) => {
    try {
      const { sessionId } = req.params;

      const {
        fromDate,
        toDate,
        anchorDate,
        pastMonths,
        futureMonths,
        yoyMode, // <-- importante: recibimos yoyMode del body
        freq, // (opcional) en caso de que quieras forzar freq desde el front
      } = req.body || {};

      // Si no vino en body, aceptamos también ?yoyMode=week en la query
      const effectiveYoyMode = yoyMode || req.query.yoyMode || undefined;

      const out = await bootstrapSession(req.db, {
        session_id: sessionId,
        appUser: req.appUser,
        fromDate,
        toDate,
        anchorDate,
        pastMonths,
        futureMonths,
        yoyMode: effectiveYoyMode, // <-- ahora sí se propaga
        // Nota: la freq de la sesión sigue viviendo en session.source.freq (se crea en /session/open).
        // Si quisieras usar 'freq' aquí para overrides, podrías actualizar la sesión, pero no es necesario para YoY.
      });

      res.json(out);
    } catch (e) {
      console.error("Error /:sessionId/bootstrap:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Matrix
// Matrix
r.get("/:sessionId/matrix", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const {
      page = 1,
      size = 200,
      Producto,
      Canal,
      Ubicacion,
      anchorDate,          // 👈 nuevo
    } = req.query;

    console.log("[planner] GET matrix", {
      sessionId,
      page,
      size,
      Producto,
      Canal,
      Ubicacion,
      anchorDate,
    });

    const out = await getMatrix(req.db, {
      session_id: sessionId,
      page: Number(page),
      size: Number(size),
      filtros: {
        Producto,
        Canal,
        Ubicacion,
        anchorDate,       // 👈 lo pasamos como parte de filtros
      },
    });
    res.json(out);
  } catch (e) {
    console.error("Error /:sessionId/matrix:", e);
    res.status(500).json({ error: e.message });
  }
});

  // Upsert cell (editar plan_fcst y comentar) — soporta payload plano o con cellKey
  r.put("/:sessionId/cell", async (req, res) => {
  try {
    const { sessionId } = req.params;

    const out = await upsertCell(req.db, {
      session_id: sessionId,
      ...req.body,
    });

    // Emitir evento en tiempo real al room de esa sesión
    const io = req.app.get("io");
    if (io) {
      // Idealmente `out` ya es el documento actualizado.
      const doc = out && out.fullDocument ? out.fullDocument : out;

      if (doc) {
        io.to(`planner:${sessionId}`).emit("cellUpdated", {
          Producto: doc.Producto,
          Canal: doc.Canal,
          Ubicacion: doc.Ubicacion,
          Fecha: doc.Fecha,
          plan_fcst: doc.plan_fcst,
          base_fcst: doc.base_fcst,
          actual: doc.actual,
          prev_year: doc.prev_year,
          asertividad: doc.asertividad,
          hasComments:
            Array.isArray(doc.comments) && doc.comments.length > 0,
        });
      }
    }

    res.json(out);
  } catch (e) {
    console.error("Error /:sessionId/cell:", e);
    res.status(500).json({ error: e.message });
  }
});

  // Upsert bulk
 r.patch("/:sessionId/cells/bulk", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { ops = [], requestId } = req.body || {};

    const out = await upsertCellsBulk(req.db, {
      session_id: sessionId,
      ops,
      requestId,
    });

    const io = req.app.get("io");
    if (io && Array.isArray(out?.docs)) {
      for (const doc of out.docs) {
        io.to(`planner:${sessionId}`).emit("cellUpdated", {
          Producto: doc.Producto,
          Canal: doc.Canal,
          Ubicacion: doc.Ubicacion,
          Fecha: doc.Fecha,
          plan_fcst: doc.plan_fcst,
          base_fcst: doc.base_fcst,
          actual: doc.actual,
          prev_year: doc.prev_year,
          asertividad: doc.asertividad,
          hasComments:
            Array.isArray(doc.comments) && doc.comments.length > 0,
        });
      }
    }

    res.json(out);
  } catch (e) {
    console.error("Error /:sessionId/cells/bulk:", e);
    res.status(500).json({ error: e.message });
  }
});

  // Guardar sin cerrar
  r.post("/:sessionId/save", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const out = await saveSession(req.db, { session_id: sessionId });
    res.json({ ok: true, ...out });
  } catch (e) {
    console.error("Error /:sessionId/save:", e);
    res.status(500).json({ error: e.message });
  }
});

  // Publish
  r.post("/:sessionId/close", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const out = await publishSession(req.db, { session_id: sessionId });
      // publishSession ya marca 'closed' y 'closed_at'
      res.json({ ok: true, ...out });
    } catch (e) {
      console.error("Error /:sessionId/close:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // === Participantes ===

// JOIN - Unirse a la sesion
r.post('/:sessionId/participants/join', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const db = req.db || req._plannerDb;
    const user = req.appUser || req._plannerAppUser || req.headers['x-app-user'];
    if (!db)  return res.status(500).json({ error: 'Planner DB no inicializada' });
    if (!user) return res.status(400).json({ error: 'user requerido' });

    const out = await addParticipant(db, { session_id: sessionId, user });
    return res.json({ ok: true, ...out });
  } catch (e) {
    console.error('Error /:sessionId/participants/join:', e);
    return res.status(500).json({ error: e.message });
  }
});

// HEARTBEAT - Revisar que usuarios siguen activos
r.post('/:sessionId/participants/heartbeat', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const db = req.db || req._plannerDb;
    const user = req.appUser || req._plannerAppUser || req.headers['x-app-user'];
    if (!db)  return res.status(500).json({ error: 'Planner DB no inicializada' });
    if (!user) return res.status(400).json({ error: 'user requerido' });

    const out = await heartbeatParticipant(db, { session_id: sessionId, user });
    return res.json({ ok: true, ...out });
  } catch (e) {
    console.error('Error /:sessionId/participants/heartbeat:', e);
    return res.status(500).json({ error: e.message });
  }
});

// LEAVE - Cerrar 
r.post('/:sessionId/participants/leave', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const db = req.db || req._plannerDb;
    const user = req.appUser || req._plannerAppUser || req.headers['x-app-user'];
    if (!db)  return res.status(500).json({ error: 'Planner DB no inicializada' });
    if (!user) return res.status(400).json({ error: 'user requerido' });

    const removed = await removeParticipant(db, { session_id: sessionId, user });
    const maybeClosed = await autoCloseIfEmpty(db, { session_id: sessionId });
    return res.json({ ok: true, removed, autoClose: maybeClosed });
  } catch (e) {
    console.error('Error /:sessionId/participants/leave:', e);
    return res.status(500).json({ error: e.message });
  }
});

r.post('/:sessionId/participants/cleanup', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const db = req.db || req._plannerDb;
    const grace = Number(req.body.graceSeconds || 90);

    const out = await cleanupInactiveParticipants(db, { session_id: sessionId, graceSeconds: grace });
    res.json(out);
  } catch (e) {
    console.error('Error /:sessionId/participants/cleanup:', e);
    res.status(500).json({ error: e.message });
  }
});

r.get("/:sessionId/filters", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const out = await getFilterOptions(req.db, { session_id: sessionId });
    res.json(out);
  } catch (e) {
    console.error("Error /:sessionId/filters:", e);
    res.status(500).json({ error: e.message });
  }
});


// Barrido global
r.post('/_admin/cleanup-all', async (req, res) => {
  try {
    const db = req.db || req._plannerDb;
    const grace = Number(req.body.graceSeconds || 90);
    const out = await cleanupAllOpenSessions(db, { graceSeconds: grace });
    res.json({ ok: true, count: out.length, results: out });
  } catch (e) {
    console.error('Error /_admin/cleanup-all:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /planner/status/:sessionId  → estado de la sesión
r.get('/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const db = req.db || req._plannerDb;
    if (!db) return res.status(500).json({ error: 'Planner DB no inicializada' });

    const s = await db.collection('planner_sessions').findOne(
      { session_id: sessionId },
      {
        projection: {
          _id: 0,
          session_id: 1,
          db_name: 1,
          status: 1,
          source: 1,
          participants: 1,
          created_at: 1,
          updated_at: 1,
          closed_at: 1,
          version: 1
        }
      }
    );
    if (!s) return res.status(404).json({ error: 'Session not found' });

    // info resumida
    const participants = Array.isArray(s.participants) ? s.participants.map(p => p.user) : [];
    const participants_count = participants.length;

    res.json({
      session_id: s.session_id,
      db_name: s.db_name,
      status: s.status,
      participants_count,
      participants,
      source: s.source,
      created_at: s.created_at,
      updated_at: s.updated_at,
      closed_at: s.closed_at,
      version: s.version
    });
  } catch (e) {
    console.error('Error GET /status/:sessionId:', e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== DFU DETAIL =====================
// GET /planner/:sessionId/dfu/detail?Producto=&Canal=&Ubicacion=&fromDate=&toDate=&commentsLimit=
r.get("/:sessionId/dfu/detail", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const {
      Producto,
      Canal,
      Ubicacion,
      fromDate,
      toDate,
      commentsLimit = 50,
    } = req.query;

    const seriesOut = await getDfuSeries(req.db, {
      session_id: sessionId,
      Producto,
      Canal,
      Ubicacion,
      fromDate,
      toDate,
    });

    const comments = await getDfuComments(req.db, {
      Producto,
      Canal,
      Ubicacion,
      limit: Number(commentsLimit) || 50,
    });

    res.json({
      ok: true,
      dfu: { Producto, Canal, Ubicacion },
      range: { fromDate: fromDate || null, toDate: toDate || null },
      ...seriesOut,
      comments,
    });
  } catch (e) {
    console.error("Error /:sessionId/dfu/detail:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== DFU COMMENTS =====================
// GET /planner/:sessionId/dfu/comments?Producto=&Canal=&Ubicacion=&limit=&before=
r.get("/:sessionId/dfu/comments", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { Producto, Canal, Ubicacion, limit = 50, before } = req.query;

    const comments = await getDfuComments(req.db, {
      Producto,
      Canal,
      Ubicacion,
      limit: Number(limit) || 50,
      before,
    });

    res.json({ ok: true, comments });
  } catch (e) {
    console.error("Error /:sessionId/dfu/comments:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /planner/:sessionId/dfu/comments  { Producto, Canal, Ubicacion, text }
r.post("/:sessionId/dfu/comments", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { Producto, Canal, Ubicacion, text } = req.body || {};
    const user = req.appUser || req.headers["x-app-user"] || null;

    const out = await addDfuComment(req.db, {
      session_id: sessionId,
      Producto,
      Canal,
      Ubicacion,
      user,
      text,
    });

    res.json(out);
  } catch (e) {
    console.error("Error POST /:sessionId/dfu/comments:", e);
    res.status(500).json({ error: e.message });
  }
});


  return r;
}

module.exports = { plannerRouter };
