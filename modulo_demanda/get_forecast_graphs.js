const { MongoClient } = require("mongodb");
const { decryptData } = require("./DeCriptaPassAppDb");
const { host, puerto } = require("../Configuraciones/ConexionDB");
const path = require("path");

const appUser = process.argv[2];
const dbName = process.argv[3];
const combination = process.argv[4];

async function getForecastData() {
  try {
    if (!appUser || !dbName || !combination) {
      console.error("Faltan parámetros appUser, dbName o combination.");
      process.exit(1);
    }

    // Ruta para las credenciales del usuario
    const configPath = path.join(__dirname, `../../${appUser}/cfg/dbvars`);
    const { DBUser, DBPassword } = require(configPath);
    const decryptedPassword = await decryptData(DBPassword);

    // Configuración de la conexión a MongoDB
    const mongoURI = `mongodb://${DBUser}:${decryptedPassword}@${host}:${puerto}/?authSource=admin`;
    const client = new MongoClient(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    await client.connect();

    const db = client.db(`btc_opti_${dbName}`);
    // En FRS guardamos histórico (fit) + futuro en demand_forecast con campo `tipo`
    // tipo: "historical" | "future"
    const forecastCollection = db.collection("demand_forecast");
    const historicoCollection = db.collection(`historico_demanda_${appUser}`); // Colección de histórico

    // Separar la combinación en Product, Channel y Loc
    const [Producto, Canal, Ubicacion] = combination.split("-");

    // Query para obtener datos del histórico
    const historicoData = await historicoCollection
      .find({ Producto, Canal, Ubicacion })
      .project({ _id: 0, Fecha: 1, Cantidad: 1 }) // Seleccionar solo las columnas necesarias
      .sort({ Fecha: 1 }) // Ordenar por fecha
      .toArray();

    // 1) Identificar la corrida más reciente (forecast_date) para esta combinación
    const latestRunDoc = await forecastCollection
      .find({ Producto, Canal, Ubicacion })
      .project({ _id: 0, forecast_date: 1 })
      .sort({ forecast_date: -1 })
      .limit(1)
      .toArray();

    const latestForecastDate = latestRunDoc?.[0]?.forecast_date || null;

    // 2) Obtener puntos de forecast (historical + future) para esa corrida
    const forecastQuery = latestForecastDate
      ? { Producto, Canal, Ubicacion, forecast_date: latestForecastDate }
      : { Producto, Canal, Ubicacion };

    const forecastData = await forecastCollection
      .find(forecastQuery)
      .project({
        _id: 0,
        Fecha: 1,
        "Demanda Predicha": 1,
        "Demanda Planeada": 1,
        "Demanda Real": 1,
        forecast_date: 1,
        tipo: 1,
      })
      .sort({ Fecha: 1 })
      .toArray();

    if (forecastData.length === 0 && historicoData.length === 0) {
      console.log(
        "No se encontraron datos históricos ni de forecast para esta combinación.",
      );
      client.close();
      return;
    }

    // Unir datos históricos (reales) y forecast (histórico predicho + futuro)
    // Normalizamos la llave de Fecha como YYYY-MM-DD para evitar problemas Date vs string.
    const toDayKey = (v) => {
      const d = v instanceof Date ? v : new Date(v);
      if (Number.isNaN(d.getTime())) return String(v);
      return d.toISOString().slice(0, 10);
    };

    const map = new Map();

    // Base: histórico real
    historicoData.forEach((h) => {
      const k = toDayKey(h.Fecha);
      map.set(k, {
        Fecha: k,
        DemandaReal: h.Cantidad,
        DemandaPredicha: null,
        DemandaPlaneada: null,
        forecast_date: latestForecastDate,
      });
    });

    // Overlay: forecast (historical + future)
    forecastData.forEach((f) => {
      const k = toDayKey(f.Fecha);
      const existing = map.get(k) || {
        Fecha: k,
        DemandaReal: null,
        DemandaPredicha: null,
        DemandaPlaneada: null,
        forecast_date: latestForecastDate,
      };

      // Preferir Demanda Real desde demand_forecast si viene (para tipo historical)
      if (f["Demanda Real"] !== undefined && f["Demanda Real"] !== null) {
        existing.DemandaReal = f["Demanda Real"];
      }

      // Predicción siempre
      if (
        f["Demanda Predicha"] !== undefined &&
        f["Demanda Predicha"] !== null
      ) {
        existing.DemandaPredicha = f["Demanda Predicha"];
      }

      // Planeada (del planner) si existe
      if (
        f["Demanda Planeada"] !== undefined &&
        f["Demanda Planeada"] !== null
      ) {
        existing.DemandaPlaneada = f["Demanda Planeada"];
      }

      // Exponer forecast_date real de la corrida
      if (f.forecast_date) existing.forecast_date = f.forecast_date;

      map.set(k, existing);
    });

    const combinedData = Array.from(map.values());

    // Ordenar los datos combinados por fecha
    combinedData.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));

    await client.close();

    console.log(JSON.stringify(combinedData)); // Output final como JSON
  } catch (error) {
    console.error(
      "Error al obtener los datos del forecast e histórico:",
      error,
    );
    process.exit(1);
  }
}

getForecastData();
