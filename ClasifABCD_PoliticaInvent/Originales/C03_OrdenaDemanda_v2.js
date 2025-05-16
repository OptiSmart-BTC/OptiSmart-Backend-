const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

// Parámetros de entrada
const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

// Configuración de logs
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; // Ruta del archivo de log

// Función para ordenar y transferir registros por ubicación
async function ordenarRegistrosPorUbicacion() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 03 - Se Ordena la información de la Demanda`);

  const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
  let client;

  // Registro previo a insertar
  const registroPrevio = {
    Producto: 'Producto',
    Ubicacion: 'Ubicacion',
    Demanda_Costo: 0,
    Demanda_Porcentaje: 0,
    Demanda_Acumulada: 0
  };

  try {
    // Conexión a MongoDB
    client = new MongoClient(mongoUri);
    await client.connect();

    const database = client.db(dbName);
    const tablaOrigen = database.collection('demanda_calculada');
    const tablaDestino = database.collection('demanda_ordenada_desc');

    // Definir el pipeline para ordenar y filtrar los registros
    const pipeline = [
      { $match: { Producto: { $ne: 'Producto' } } }, // Filtrar registros donde Producto no sea "Producto"
      { $sort: { Ubicacion: 1, Demanda_Porcentaje: -1 } } // Ordenar por ubicación ascendente y porcentaje descendente
    ];

    // Ejecutar la consulta con agregación
    const registrosOrdenados = await tablaOrigen.aggregate(pipeline).toArray();

    // Insertar el registro previo en la primera posición
    registrosOrdenados.unshift(registroPrevio);

    // Transferir registros ordenados a la tabla de destino
    await tablaDestino.insertMany(registrosOrdenados);

    writeToLog(`\tTermina el Ordenamiento de la información de la Demanda`);
  } catch (error) {
    writeToLog(`${now} - Error al ordenar y transferir los registros: ${error.message}`);
    throw error;
  } finally {
    // Cerrar conexión a MongoDB
    if (client) {
      await client.close();
    }
  }
}

// Manejo de errores al ejecutar la función principal
ordenarRegistrosPorUbicacion()
  .catch((error) => {
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    writeToLog(`${now} - Error al ejecutar ordenarRegistrosPorUbicacion: ${error.message}`);
  });

/**
 * Registra mensajes en el archivo de log.
 * @param {string} message - Mensaje a registrar.
 */
function writeToLog(message) {
  fs.appendFileSync(logFile, `${moment().format('YYYY-MM-DD HH:mm:ss')} - ${message}\n`);
}
