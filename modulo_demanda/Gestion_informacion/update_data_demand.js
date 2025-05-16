const fs = require('fs');
const csv = require('csv-parser');
const { MongoClient } = require('mongodb');
const moment = require('moment-timezone');
const path = require('path');

// Parámetros recibidos por la línea de comandos
const csvFilePath = process.argv[2]; // La ruta del archivo CSV
const user = process.argv[3]; // El usuario que ejecuta la operación
const dbName = `btc_opti_${process.argv[4]}`; // Nombre de la base de datos
const selectedCollection = process.argv[5]; // Colección seleccionada por el usuario

// Importar las configuraciones del cliente
const { decryptData } = require('../DeCriptaPassAppDb');
const { host, puerto } = require('../../Configuraciones/ConexionDB');
const { DBUser, DBPassword} = require(`../../${user}/cfg/dbvars`);
const logFile = path.join(__dirname, `../../${user}/log/LogActualizacionDemandaCSV.log`);

// Nombre de la colección en MongoDB, según la selección y el usuario
const collectionName = `${selectedCollection}_${user}`;

// Función para escribir en el log
function writeToLog(message) {
    const logMessage = `${new Date().toISOString()} - ${message}\n`;
    fs.appendFileSync(logFile, logMessage);
}

// Función para obtener la contraseña desencriptada y construir la URI de MongoDB
async function getMongoClient() {
    const passadminDeCripta = await decryptData(DBPassword);
    const mongoURI = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/?authSource=admin`;
    return new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
}

// Función para reacomodar el histórico directamente en MongoDB
async function reacomodarHistoricoEnMongo(client, dbName, collectionName) {
    try {
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Obtener todos los documentos de la colección
        const allRecords = await collection.find().toArray();

        // Ordenar los registros por combinación clave y StartDate
        const registrosOrdenados = allRecords.sort((a, b) => {
            if (a.Product < b.Product) return -1;
            if (a.Product > b.Product) return 1;
            if (a.Channel < b.Channel) return -1;
            if (a.Channel > b.Channel) return 1;
            if (a.Loc < b.Loc) return -1;
            if (a.Loc > b.Loc) return 1;
            return new Date(a.Fecha) - new Date(b.Fecha);
        });

        // Sobrescribir la colección con los registros ordenados
        await collection.deleteMany({}); // Eliminar todos los documentos actuales
        await collection.insertMany(registrosOrdenados); // Insertar los documentos en el orden correcto

        writeToLog(`Histórico reacomodado directamente en MongoDB para la colección ${collectionName}.`);
        console.log(`Histórico reacomodado directamente en MongoDB para la colección ${collectionName}.`);
    } catch (error) {
        writeToLog(`Error al reacomodar el histórico en MongoDB: ${error.message}`);
        console.error(`Error al reacomodar el histórico en MongoDB: ${error.message}`);
    }
}


// Función para actualizar la colección seleccionada
async function updateSelectedCollection() {
    try {
        writeToLog(`Iniciando la actualización de la colección ${collectionName}...`);

        // Conectar a MongoDB
        const client = await getMongoClient();
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Variables para hacer el seguimiento de los registros
        let newRecordsCount = 0;
        let updatedRecordsCount = 0;

        // Leer el archivo CSV y preparar los nuevos registros
        const newRecords = [];
        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (data) => {
                // Determinar la estructura de los datos según la colección seleccionada
                let record;
                if (selectedCollection === 'historico_demanda') {
                    // Estructura para 'historico_demanda'
                    const Fecha = moment.utc(data['Fecha'], 'DD/MM/YYYY').startOf('day').toDate();
                    record = {
                        Product: data['Product'],
                        Channel: data['Channel'],
                        Loc: data['Loc'],
                        Fecha: Fecha,
                        Cantidad: parseFloat(data['Cantidad']),
                    };
                } else if (selectedCollection === 'Listado_productos') {
                    // Estructura para 'Listado_productos'
                    record = {
                        Product: data['Product'],
                        Desc: data['Desc'],
                    };
                } else if (selectedCollection === 'Listado_canales') {
                    // Estructura para 'Listado_canales'
                    record = {
                        Channel: data['Channel'],
                        Desc: data['Desc'],
                    };
                } else if (selectedCollection === 'Listado_ubicaciones') {
                    // Estructura para 'Listado_ubicaciones'
                    record = {
                        Loc: data['Loc'],
                        Desc: data['Desc'],
                    };
                } else {
                    writeToLog(`Colección no válida seleccionada: ${selectedCollection}`);
                    client.close();
                    return;
                }

                newRecords.push(record);
            })
            .on('end', async () => {
                writeToLog(`Se encontraron ${newRecords.length} registros para procesar en ${selectedCollection}.`);

                // Insertar o actualizar los registros en la colección
                for (const record of newRecords) {
                    let query;
                    let update;

                    // Configurar consulta y actualización según la colección seleccionada
                    if (selectedCollection === 'historico_demanda') {
                        query = {
                            Product: record.Product,
                            Channel: record.Channel,
                            Loc: record.Loc,
                            Fecha: record.Fecha
                        };
                        update = {
                            $set: {
                                Cantidad: record.Cantidad,
                            }
                        };
                    } else if (selectedCollection === 'Listado_productos') {
                        query = { Product: record.Product };
                        update = { $set: record };
                    } else if (selectedCollection === 'Listado_canales') {
                        query = { Channel: record.Channel };
                        update = { $set: record };
                    } else if (selectedCollection === 'Listado_ubicaciones') {
                        query = { Loc: record.Loc };
                        update = { $set: record };
                    }

                    const result = await collection.updateOne(query, update, { upsert: true });

                    if (result.upsertedCount > 0) {
                        newRecordsCount++; // Si fue una inserción nueva
                    } else if (result.modifiedCount > 0) {
                        updatedRecordsCount++; // Si fue una actualización de un registro existente
                    }
                }

                // Log de finalización
                writeToLog(`${newRecordsCount} registros nuevos insertados.`);
                writeToLog(`${updatedRecordsCount} registros existentes actualizados.`);
                writeToLog(`${newRecords.length} registros procesados en total.`);

                console.log(`${newRecords.length} registros procesados correctamente en la colección.`);

                // Reacomodar el histórico después de la actualización
                await reacomodarHistoricoEnMongo(client, dbName, collectionName);
                client.close();
            });
    } catch (error) {
        writeToLog(`Error durante la actualización: ${error.message}`);
        console.error(`Error durante la actualización: ${error.message}`);
    }
}

// Ejecutar la función
updateSelectedCollection();
