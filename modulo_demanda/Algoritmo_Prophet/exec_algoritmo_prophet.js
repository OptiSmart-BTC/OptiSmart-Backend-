const { exec } = require('child_process');
const { MongoClient } = require('mongodb');
const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../../Configuraciones/ConexionDB');
const path = require('path');

const appuser = process.argv[2];
const dbName = `btc_opti_${process.argv[3]}`;
const minRegistros = process.argv[4]; // Número mínimo de registros
const maxPorcentajeCeros = process.argv[5]; // Máximo porcentaje de ceros
const periodoAPredecir = process.argv[6]; // Período a predecir

const { DBUser, DBPassword } = require(`../../../${appuser}/cfg/dbvars`);

// Función para ejecutar el script de Python
async function ejecutarPython(minRegistros, maxPorcentajeCeros, periodoAPredecir) {
    try {
        const passadminDeCripta = await getDecryptedPassadmin();
        const mongoUrl = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/?authSource=admin`;
        const pythonScript = path.join(__dirname, 'output_a_mongo.py');
        const userCollection = `historico_demanda_${appuser}`;
        const command = `python ${pythonScript} "${dbName}" "${userCollection}" "${mongoUrl}" ${minRegistros} ${maxPorcentajeCeros} ${periodoAPredecir}`;

        console.log('Iniciando el proceso de predicción con Prophet...');
        console.log(`Ejecutando: ${command}`);

        exec(command, async (error, stdout, stderr) => {
            if (error) {
                console.error(`Error al ejecutar el script Python: ${error.message}`);
                return;
            }
        
            // Verificar si stderr contiene algo crítico
            if (stderr && stderr.trim()) {
                console.warn(`Advertencia (stderr): ${stderr}`); // Cambia a advertencia en lugar de error
            }
        
            console.log(`Salida de Python: ${stdout}`);
            console.log('Proceso de predicción terminado exitosamente.');
        
            try {
                console.log('Iniciando la actualización de demand_forecast_actual...');
                await actualizarForecastActual();
                console.log('Actualización de demand_forecast_actual completada.');
            } catch (updateError) {
                console.error('Error al actualizar demand_forecast_actual:', updateError);
            }
        });

    } catch (error) {
        console.error(`Error en el proceso de ejecución: ${error.message}`);
    }
}

// Función para actualizar la colección `demand_forecast_actual`
async function actualizarForecastActual() {
    let client;
    try {
        const passadminDeCripta = await getDecryptedPassadmin();
        const mongoURI = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;

        client = await MongoClient.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
        const db = client.db();
        const forecastCollection = db.collection('demand_forecast');
        const forecastActualCollection = db.collection('demand_forecast_actual');

        console.log('[Actualización Forecast] Conectando para actualizar demand_forecast_actual.');

        // Encontrar la fecha más reciente en forecast_date
        const maxForecastDate = await forecastCollection.find({}).sort({ forecast_date: -1 }).limit(1).toArray();

        if (maxForecastDate.length === 0) {
            console.log('[Actualización Forecast] No se encontraron registros en demand_forecast.');
            return;
        }

        const latestDate = maxForecastDate[0].forecast_date;

        // Eliminar los datos existentes en demand_forecast_actual
        await forecastActualCollection.deleteMany({});
        console.log('[Actualización Forecast] demand_forecast_actual limpiada.');

        // Copiar los registros con forecast_date más reciente
        const latestForecastData = await forecastCollection.find({ forecast_date: latestDate }).toArray();
        if (latestForecastData.length > 0) {
            await forecastActualCollection.insertMany(latestForecastData);
            console.log(`[Actualización Forecast] ${latestForecastData.length} registros copiados a demand_forecast_actual.`);
        } else {
            console.log('[Actualización Forecast] No se encontraron registros con la fecha más reciente.');
        }

    } catch (error) {
        console.error('Error al actualizar demand_forecast_actual:', error);
    } finally {
        if (client) {
            try {
                await client.close();
            } catch (closeError) {
                console.error('Error al cerrar la conexión de MongoDB:', closeError);
            }
        }
    }
}

// Función para desencriptar la contraseña
async function getDecryptedPassadmin() {
    try {
        return await decryptData(`${DBPassword}`);
    } catch (error) {
        console.error('Error al desencriptar el passadmin:', error);
        throw error;
    }
}

// Ejecutar el script de Python y actualizar forecast_actual
ejecutarPython(minRegistros, maxPorcentajeCeros, periodoAPredecir);
