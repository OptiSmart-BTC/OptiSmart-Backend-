const fs = require('fs');
const csv = require('csv-parser');
const { MongoClient } = require('mongodb');
const path = require('path');
const moment = require('moment-timezone');
const { exec } = require('child_process');

// Obtener los argumentos pasados por el comando
const csvFilePath       = process.argv[2];                // Ruta del archivo CSV
const dbName            = `btc_opti_${process.argv[3]}`; // Nombre de la base de datos
const user              = process.argv[4];                // Usuario que ejecuta
const selectedCollection= process.argv[5];               // Colección seleccionada

// Configuración de MongoDB y logs
const { decryptData } = require('../DeCriptaPassAppDb');
const { host, puerto } = require('../../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../../${user}/cfg/dbvars`);
const logFile = path.join(__dirname, `../../../${user}/log/Logs_demanda.log`);
const collectionName = `${selectedCollection}_${user}`;

// Verifica que la carpeta de logs exista
const logDir = path.dirname(logFile);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Función principal
async function insertCSVDataToMongoDB() {
  // Inicio de nuevo proceso (separador en lugar de borrar)
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  fs.appendFileSync(logFile, `\n\n=== INICIO NUEVO PROCESO: ${timestamp} ===\n\n`);

  // Si es histórico de demanda, ejecutar pipeline y salir
  if (selectedCollection === 'historico_demanda') {
    writeToLog('Iniciando pipeline de histórico');
    try {
      await runPreprocessingPipeline();
      writeToLog('Pipeline de histórico completado');
      console.log('HISTORICO_OK');
      process.exit(0);
    } catch (err) {
      writeToLog(`Pipeline histórico falló: ${err.message}`);
      console.error('Pipeline falló:', err);
      process.exit(1);
    }
    return; // Asegurar que no sigue con el código siguiente
  }

  // Para otras colecciones
  let client = null;
  try {
    // Verificar que el archivo existe
    if (!fs.existsSync(csvFilePath)) {
      writeToLog(`Error: El archivo ${csvFilePath} no existe`);
      console.error(`Error: Archivo no encontrado ${csvFilePath}`);
      process.exit(1);
    }
    
    // Conectar a MongoDB
    const pass = await getDecryptedPassadmin();
    const uri = `mongodb://${DBUser}:${pass}@${host}:${puerto}/${dbName}?authSource=admin`;
    client = await MongoClient.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = client.db();

    // Cargar y procesar CSV
    await new Promise((resolve, reject) => {
      const results = [];
      fs.createReadStream(csvFilePath)
        .on('error', err => {
          writeToLog(`Error al leer archivo: ${err.message}`);
          reject(err);
        })
        .pipe(csv())
        .on('data', row => {
          let doc;
          switch (selectedCollection) {
            case 'Listado_productos':
              doc = { Producto: row.Producto, Desc: row.Desc };
              break;
            case 'Listado_canales':
              doc = { Canal: row.Canal, Desc: row.Desc };
              break;
            case 'Listado_ubicaciones':
              doc = { Ubicacion: row.Ubicacion, Desc: row.Desc };
              break;
            default:
              reject(new Error(`Colección inválida: ${selectedCollection}`));
              return;
          }
          results.push(doc);
        })
        .on('end', async () => {
          try {
            const col = db.collection(collectionName);
            await col.deleteMany({});
            await col.insertMany(results);
            writeToLog(`${results.length} registros insertados en ${collectionName}`);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
    });
    
    console.log(`OK ${collectionName}`);
  } catch (err) {
    writeToLog(`Error al cargar ${collectionName}: ${err.message}`);
    console.error(`Error carga ${collectionName}:`, err);
    process.exit(1);
  } finally {
    // Cerrar conexión a MongoDB
    if (client) {
      await client.close();
    }
  }
}

// Ejecuta el pipeline de histórico
async function runPreprocessingPipeline() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, 'exec_js_HistoricoMain_LoadData.js');
    const comando = `node "${scriptPath}" ${user} "${csvFilePath}"`;
    exec(comando, (error, stdout, stderr) => {
      if (stdout) writeToLog(stdout);
      if (stderr) writeToLog(stderr);
      if (error) {
        return reject(error);
      }
      resolve();
    });
  });
}

// Escribe en el log
function writeToLog(msg) {
  try {
    fs.appendFileSync(logFile, msg + '\n');
    console.log(msg); // También mostrar en consola
  } catch (err) {
    console.error(`Error al escribir en log: ${err.message}`);
  }
}

// Desencripta contraseña con manejo de errores
async function getDecryptedPassadmin() {
  try {
    return await decryptData(DBPassword);
  } catch (err) {
    writeToLog(`Error al desencriptar: ${err.message}`);
    throw err; // Re-lanzar para manejo superior
  }
}

// Iniciar proceso
insertCSVDataToMongoDB();
