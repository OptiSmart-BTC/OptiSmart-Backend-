const fs = require('fs');
const csv = require('csv-parser');
const { MongoClient } = require('mongodb');
const moment = require('moment-timezone');
const path = require('path');

// Parámetros de línea de comandos
const dbName = process.argv[2];
const parametroFolder = process.argv[3];
const AppUser = process.argv[4]; // Añadido para mantener consistencia
const csvFilePath = process.argv[5]?.replace(/"/g, ''); 

// Configuración
const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../../${parametroFolder}/cfg/dbvars`);
const logFile = path.join(__dirname, '..', '..', '..', parametroFolder, 'log', 'Logs_demanda.log');
const user = parametroFolder.toLowerCase(); // Usuario en minúsculas
const collectionName = `historico_demanda_${user}`; // Nombre de colección

// Verificar el archivo de entrada
if (!csvFilePath || !fs.existsSync(csvFilePath)) {
  writeToLog(`Error: Archivo CSV no encontrado en ${csvFilePath}`);
  console.error(`ERROR: CSV no encontrado - ${csvFilePath}`);
  process.exit(1);
}

async function insertCSVDataToMongoDB() {
  let client = null;
  try {
    writeToLog(`Paso 04 - Carga del CSV de la Historial de Demanda`);
    writeToLog(`\tArchivo: ${csvFilePath}`);
    writeToLog(`\tColección destino: ${collectionName}`);

    // Desencriptar la contraseña
    const passadminDeCripta = await getDecryptedPassadmin();
    writeToLog(`\tContraseña desencriptada correctamente.`);

    const mongoURI = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
    writeToLog(`\tIntentando conectar a MongoDB con URI: ${mongoURI}`);

    client = await MongoClient.connect(mongoURI, { 
      useNewUrlParser: true,
      useUnifiedTopology: true 
    });
    writeToLog(`\tConexión a MongoDB establecida correctamente.`);

    const db = client.db();
    writeToLog(`\tBase de datos seleccionada: ${dbName}`);

    // Usar Promise para mejor manejo de errores en streams
    await new Promise((resolve, reject) => {
      const results = [];
      
      fs.createReadStream(csvFilePath)
        .on('error', (error) => {
          writeToLog(`\tError al leer archivo: ${error.message}`);
          reject(error);
        })
        .pipe(csv())
        .on('data', (data) => {
          try {
            // Convertir fecha
            const fechaString = data.Fecha;
            const fechaConDesplazamiento = moment.utc(fechaString, 'DD/MM/YYYY')
              .tz('America/Mexico_City');

            // Convertir datos
            const transformedData = {
              DFU: `${String(data.Producto)}@${String(data.Canal)}@${String(data.Ubicacion)}`,
              Ubicacion: String(data.Ubicacion),
              Producto: String(data.Producto), 
              Canal: String(data.Canal),
              Fecha: fechaConDesplazamiento.toDate(),
              Cantidad: Number(data.Cantidad)
            };

            results.push(transformedData);
          } catch (error) {
            writeToLog(`\tError al procesar fila: ${error.message}`);
            reject(error);
          }
        })
        .on('end', async () => {
          try {
            const collection = db.collection(collectionName);
            writeToLog(`\tColección seleccionada: ${collectionName}`);

            // Borrar datos existentes e insertar nuevos
            await collection.deleteMany({});
            writeToLog(`\tDatos existentes eliminados.`);

            if (results.length > 0) {
              await collection.insertMany(results);
              writeToLog(`\t${results.length} registros insertados en MongoDB.`);
            } else {
              writeToLog(`\tNo se encontraron registros para insertar.`);
            }
            
            const numRegistrosCargados = results.length;
            writeToLog(`\tNúmero de registros cargados: ${numRegistrosCargados}`);
            console.log(`Número de registros cargados: ${numRegistrosCargados}`);
            resolve();
          } catch (error) {
            writeToLog(`\tError al guardar en MongoDB: ${error.message}`);
            reject(error);
          }
        });
    });
    
    // Éxito
    process.exit(0);
  } catch (error) {
    writeToLog(`\tError general: ${error.message}`);
    console.error('ERROR:', error.message);
    process.exit(1);
  } finally {
    // Cerrar conexión MongoDB
    if (client) {
      await client.close();
      writeToLog(`\tConexión a MongoDB cerrada.`);
    }
  }
}

function writeToLog(message) {
  try {
    fs.appendFileSync(logFile, `${message}\n`);
    console.log(message);
  } catch (error) {
    console.error('Error al escribir en log:', error);
  }
}

async function getDecryptedPassadmin() {
  try {
    return await decryptData(DBPassword);
  } catch (error) {
    writeToLog(`\tError al desencriptar: ${error.message}`);
    throw new Error(`Error de desencriptación: ${error.message}`);
  }
}

// Ejecutar
insertCSVDataToMongoDB();
