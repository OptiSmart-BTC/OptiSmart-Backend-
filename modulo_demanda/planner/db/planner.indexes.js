// Ejecutar una vez al inicializar el módulo
async function ensurePlannerIndexes(db) {
  await db.collection('planner_sessions').createIndexes([
    { key: { session_id: 1 }, unique: true },
    { key: { status: 1 } },
    { key: { updated_at: -1 } },
  ]);

  await db.collection('planner_cells').createIndexes([
    { key: { session_id: 1, Producto: 1, Canal: 1, Ubicacion: 1, Fecha: 1 }, unique: true },
    { key: { session_id: 1, Fecha: 1 } },
  ]);

await db.collection('planner_audit').createIndexes([
  {
    key: {
      'cell.Producto': 1,
      'cell.Canal': 1,
      'cell.Ubicacion': 1,
      timestamp: -1,
    },
  },
  // opcional: si también filtras por session_id a veces
  {
    key: {
      session_id: 1,
      'cell.Producto': 1,
      'cell.Canal': 1,
      'cell.Ubicacion': 1,
      timestamp: -1,
    },
  },
]);
}
module.exports = { ensurePlannerIndexes };