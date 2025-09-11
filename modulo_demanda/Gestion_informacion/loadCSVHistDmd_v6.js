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
            // Convertir fecha (CSV viene como DD/MM/YYYY)
            const fechaString = data.Fecha;
            const fechaConDesplazamiento = moment
              .utc(String(fechaString).trim(), 'DD/MM/YYYY', true)
              .tz('America/Mexico_City');

            // Normalizaciones básicas
            const Producto = String(data.Producto ?? '').trim();
            const Canal = String(data.Canal ?? '').trim();
            const Ubicacion = String(data.Ubicacion ?? '').trim();
            const Cantidad = Number(data.Cantidad);

            // 👇 NUEVO: Categoria opcional (trim o null)
            const Categoria =
              data.Categoria !== undefined && data.Categoria !== null &&
              String(data.Categoria).trim() !== ''
                ? String(data.Categoria).trim()
                : null;

            const transformedData = {
              DFU: `${Producto}@${Canal}@${Ubicacion}`, // sin cambios
              Ubicacion,
              Producto, 
              Canal,
              Fecha: fechaConDesplazamiento.toDate(),
              Cantidad: Cantidad,
              Categoria 
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
              await collection.insertMany(results, { ordered: false });
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
    
    process.exit(0);
  } catch (error) {
    writeToLog(`\tError general: ${error.message}`);
    console.error('ERROR:', error.message);
    process.exit(1);
  } finally {
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
