const { exec } = require('child_process');
const { MongoClient } = require('mongodb');
const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../../Configuraciones/ConexionDB');
const path = require('path');

const appuser = process.argv[2];
const dbName = `btc_opti_${process.argv[3]}`;

const { DBUser, DBPassword } = require(`../../../${appuser}/cfg/dbvars`);

// Función para ejecutar el script de Python de clasificación
async function ejecutarClasificacion() {
    try {
        const passadminDeCripta = await getDecryptedPassadmin();
        const mongoUrl = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/?authSource=admin`;
        const pythonScript = path.join(__dirname, 'ejecutable_clasificador.py');
        const userCollection = `historico_demanda_${appuser}`;
        const resultCollection = `clasificacion_demanda_${appuser}`;
        const command = `python ${pythonScript} "${dbName}" "${userCollection}" "${resultCollection}" "${mongoUrl}"`;

        console.log('Iniciando el proceso de clasificación de demanda...');
        console.log(`Ejecutando: ${command}`);

        exec(command, async (error, stdout, stderr) => {
            if (error) {
                console.error(`Error al ejecutar el script Python: ${error.message}`);
                return;
            }
        
            // Verificar si stderr contiene algo crítico
            if (stderr && stderr.trim()) {
                console.warn(`Advertencia (stderr): ${stderr}`);
            }
        
            console.log(`Salida de Python: ${stdout}`);
            console.log('Proceso de clasificación terminado exitosamente.');
        
            try {
                console.log('Iniciando la actualización de clasificacion_demanda_actual...');
                await actualizarClasificacionActual();
                console.log('Actualización de clasificacion_demanda_actual completada.');
            } catch (updateError) {
                console.error('Error al actualizar clasificacion_demanda_actual:', updateError);
            }
        });

    } catch (error) {
        console.error(`Error en el proceso de ejecución: ${error.message}`);
    }
}

// Función para actualizar la colección `clasificacion_demanda_actual`
async function actualizarClasificacionActual() {
    let client;
    try {
        const passadminDeCripta = await getDecryptedPassadmin();
        const mongoURI = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;

        client = await MongoClient.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
        const db = client.db();
        const clasificacionCollection = db.collection(`clasificacion_demanda_${appuser}`);
        const clasificacionActualCollection = db.collection('clasificacion_demanda_actual');

        console.log('[Actualización Clasificación] Conectando para actualizar clasificacion_demanda_actual.');

        // Encontrar la fecha más reciente de clasificación
        const maxClasificacionDate = await clasificacionCollection.find({}).sort({ fecha_clasificacion: -1 }).limit(1).toArray();

        if (maxClasificacionDate.length === 0) {
            console.log('[Actualización Clasificación] No se encontraron registros en clasificacion_demanda.');
            return;
        }

        const latestDate = maxClasificacionDate[0].fecha_clasificacion;

        // Eliminar los datos existentes en clasificacion_demanda_actual
        await clasificacionActualCollection.deleteMany({});
        console.log('[Actualización Clasificación] clasificacion_demanda_actual limpiada.');

        // Copiar los registros con fecha más reciente
        const latestClasificacionData = await clasificacionCollection.find({ fecha_clasificacion: latestDate }).toArray();
        if (latestClasificacionData.length > 0) {
            await clasificacionActualCollection.insertMany(latestClasificacionData);
            console.log(`[Actualización Clasificación] ${latestClasificacionData.length} registros copiados a clasificacion_demanda_actual.`);
        } else {
            console.log('[Actualización Clasificación] No se encontraron registros con la fecha más reciente.');
        }

    } catch (error) {
        console.error('Error al actualizar clasificacion_demanda_actual:', error);
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

// Ejecutar el script de Python de clasificación
ejecutarClasificacion();