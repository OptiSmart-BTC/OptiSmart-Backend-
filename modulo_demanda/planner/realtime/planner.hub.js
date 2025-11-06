function attachPlannerHub({ io, db }) {
  io.on('connection', (socket) => {
    socket.on('planner:join', ({ session_id }) => {
      socket.join(`planner:${session_id}`);
    });
    socket.on('planner:leave', ({ session_id }) => {
      socket.leave(`planner:${session_id}`);
    });
  });

  // Change Stream sobre planner_cells
  const cs = db.collection('planner_cells').watch([], { fullDocument: 'updateLookup' });
  cs.on('change', (change) => {
    const doc = change.fullDocument;
    if (!doc?.session_id) return;
    io.to(`planner:${doc.session_id}`).emit('cellUpdated', {
      Producto: doc.Producto, Canal: doc.Canal, Ubicacion: doc.Ubicacion, Fecha: doc.Fecha,
      plan_fcst: doc.plan_fcst, base_fcst: doc.base_fcst, actual: doc.actual, prev_year: doc.prev_year,
      asertividad: doc.asertividad,
      hasComments: Array.isArray(doc.comments) && doc.comments.length > 0
    });
  });
}

module.exports = { attachPlannerHub };