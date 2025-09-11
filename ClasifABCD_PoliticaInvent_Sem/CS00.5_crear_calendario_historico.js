const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

(async () => {
  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  try {
    await client.connect();
    const db = client.db(dbName);

    // 1) Leer parámetro Num_Param = 5
    const param = await db.collection('parametros_usuario').findOne(
      { Tipo: "Horizontes", Num_Param: 5 },
      { projection: { _id: 0, Fecha_Inicio_Calendario: 1, Fecha_Fin_Calendario: 1 } }
    );

    if (!param || !param.Fecha_Inicio_Calendario || !param.Fecha_Fin_Calendario) {
      throw new Error("Faltan parámetros Fecha_Inicio_Calendario / Fecha_Fin_Calendario en Num_Param=5.");
    }

    const desde = new Date(param.Fecha_Inicio_Calendario);
    const hasta = new Date(param.Fecha_Fin_Calendario);

    // 2) Construir calendario reducido
await db.collection('calendario_historico').createIndex({ Fecha: 1 }, { unique: true });

// ahora sí, ejecuta el aggregate + $merge
await db.collection('Calendar').aggregate([
  { $match: { Fecha: { $gte: desde, $lte: hasta } } },
  { $project: { _id: 0, Fecha: 1, Week: 1, Year: 1 } },
  {
    $merge: {
      into: 'calendario_historico',
      on: 'Fecha',
      whenMatched: 'replace',
      whenNotMatched: 'insert'
    }
  }
]).next();

    // 3) Índice por Fecha
    await db.collection('calendario_historico').createIndex({ Fecha: 1 }, { unique: true });

    console.log("✅ calendario_historico creado/actualizado.");
  } catch (e) {
    console.error("❌ Error en CS00.5_crear_calendario_historico", e.message);
    process.exit(1);
  } finally {
    await client.close();
  }
})();