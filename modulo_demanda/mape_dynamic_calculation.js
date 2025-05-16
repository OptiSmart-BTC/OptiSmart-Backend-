const { MongoClient } = require('mongodb');
const moment = require('moment-timezone');

// Obtener los argumentos
const dbName = `btc_opti_${process.argv[2]}`;
const user = process.argv[3];

// Configuración de la conexión
const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../${user}/cfg/dbvars`);

async function calcularMapeYAdquirirDatos() {
    let client = null; // Inicializar como null
    try {
        const passadminDeCripta = await decryptData(DBPassword);
        const mongoURI = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
        client = await MongoClient.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });

        const db = client.db();
        const historicoCollection = db.collection(`historico_demanda_${user}`);
        const forecastCollection = db.collection('demand_forecast');
        const metricasCollection = db.collection(`metricas_forecast_${user}`);

        // Consultar todos los registros de forecast
        const datosForecast = await forecastCollection.find({}).toArray();

        const mapeResultados = [];

        // Calcular el MAPE
        for (const forecast of datosForecast) {
            const historico = await historicoCollection.findOne({
                Product: forecast.Product,
                Channel: forecast.Channel,
                Loc: forecast.Loc,
                Fecha: forecast.Fecha
            });

            let mape = null;

            if (historico) {
                const demandaReal = historico.Cantidad;
                const demandaPredicha = forecast['Demanda Predicha'];

                // Calcular MAPE si ambos valores son válidos
                if (demandaReal > 0 && demandaPredicha !== null && demandaPredicha !== undefined) {
                    mape = Math.abs((demandaReal - demandaPredicha) / demandaReal) * 100;
                }
            }

            // Agregar resultado incluso si no hay histórico
            mapeResultados.push({
                Product: forecast.Product,
                Channel: forecast.Channel,
                Loc: forecast.Loc,
                Fecha: forecast.Fecha,
                DemandaReal: historico ? historico.Cantidad : null,
                DemandaPredicha: forecast['Demanda Predicha'],
                MAPE: mape,
                forecast_date: forecast.forecast_date,
                CalculatedAt: new Date()
            });
        }

        // Guardar los resultados en la colección de métricas
        if (mapeResultados.length > 0) {
            await metricasCollection.deleteMany({}); // Limpiar métricas previas (opcional)
            await metricasCollection.insertMany(mapeResultados);
        }

        // Adquirir los datos de la colección de métricas
        const metrics = await metricasCollection
            .find({}, { projection: { _id: 0, Product: 1, Channel: 1, Loc: 1, 
                Fecha: 1, DemandaReal: 1, DemandaPredicha: 1, MAPE: 1, forecast_date: 1 } })
            .sort({ forecast_date: -1})
            .toArray();

        console.log(JSON.stringify(metrics));
    } catch (error) {
        console.error('Error al calcular el MAPE y adquirir datos:', error);
    } finally {
        if (client) { // Solo cerrar si la conexión fue inicializada
            try {
                await client.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión:', closeError);
            }
        }
    }
}

calcularMapeYAdquirirDatos();
