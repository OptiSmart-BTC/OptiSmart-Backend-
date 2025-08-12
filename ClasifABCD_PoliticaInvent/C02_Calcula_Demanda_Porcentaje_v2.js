const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');
const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

// Manejo mejorado del folder de logs
let parametroFolder;
try {
  const partes = dbName.split("_");
  let parte = partes[partes.length - 1];
  
  // Si la última parte parece un timestamp (12 dígitos), usar la anterior
  if (/^\d{12,}$/.test(parte)) {
    parte = partes[partes.length - 2];
  }
  
  parametroFolder = parte.toUpperCase();
} catch (error) {
  parametroFolder = 'DEFAULT';
}

const logFile = path.resolve(__dirname, `../../${parametroFolder}/log/ClasABCD_PolInvent.log`);

async function calcularDemandaPorcentaje() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\n${now} - Paso 02 - Iniciando Calculo del Porcentaje de la Demanda`);
  console.log(`${now} - Iniciando C02 - Calculo del Porcentaje de la Demanda`);

  const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
  const collectionName = 'demanda_calculada';

  let client;
  
  try {
    // Conectar con configuración optimizada
    writeToLog(`Conectando a MongoDB: ${dbName}`);
    client = await MongoClient.connect(mongoUri, { 
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 0,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 30000
    });

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Verificar que la colección existe y tiene datos
    const totalDocuments = await collection.countDocuments();
    writeToLog(`Total documentos en ${collectionName}: ${totalDocuments}`);
    console.log(`Total documentos a procesar: ${totalDocuments}`);

    if (totalDocuments === 0) {
      writeToLog(`No hay documentos en ${collectionName} - terminando`);
      console.log(`No hay documentos en ${collectionName} - terminando`);
      return;
    }

    // **SOLUCIÓN PRINCIPAL**: Usar agregación en lugar de loops anidados
    // Esto cambia complejidad de O(n²) a O(n log n)
    writeToLog(`Calculando sumas por ubicación...`);
    console.log(`Calculando sumas por ubicación...`);

    // Paso 1: Calcular suma total por ubicación usando agregación
    const sumasPorUbicacion = await collection.aggregate([
      {
        $group: {
          _id: "$Ubicacion",
          suma_total: { 
            $sum: { 
              $cond: {
                if: { $and: [
                  { $ne: ["$Demanda_Costo", null] },
                  { $ne: ["$Demanda_Costo", undefined] },
                  { $isNumber: "$Demanda_Costo" }
                ]},
                then: "$Demanda_Costo",
                else: 0
              }
            }
          },
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    writeToLog(`Ubicaciones encontradas: ${sumasPorUbicacion.length}`);
    console.log(`Ubicaciones encontradas: ${sumasPorUbicacion.length}`);

    // Convertir a Map para búsqueda O(1)
    const sumasMap = new Map();
    sumasPorUbicacion.forEach(item => {
      sumasMap.set(item._id, item.suma_total);
      writeToLog(`  ${item._id}: ${item.count} docs, suma: ${item.suma_total.toFixed(2)}`);
    });

    // Paso 2: Procesar en lotes para evitar timeouts
    const BATCH_SIZE = 1000; // Procesar de 1000 en 1000
    let procesados = 0;
    let actualizados = 0;

    writeToLog(`Iniciando actualización en lotes de ${BATCH_SIZE}...`);
    console.log(`Iniciando actualización en lotes de ${BATCH_SIZE}...`);

    // Obtener todos los documentos por lotes
    const cursor = collection.find({});
    let lote = [];

    for await (const documento of cursor) {
      lote.push(documento);

      // Procesar lote cuando esté lleno
      if (lote.length >= BATCH_SIZE) {
        const resultados = await procesarLote(collection, lote, sumasMap);
        actualizados += resultados;
        procesados += lote.length;
        
        writeToLog(`Procesados: ${procesados}/${totalDocuments} (${((procesados/totalDocuments)*100).toFixed(1)}%)`);
        console.log(`Progreso: ${procesados}/${totalDocuments} (${((procesados/totalDocuments)*100).toFixed(1)}%)`);
        
        lote = []; // Limpiar lote
      }
    }

    // Procesar lote final si queda algo
    if (lote.length > 0) {
      const resultados = await procesarLote(collection, lote, sumasMap);
      actualizados += resultados;
      procesados += lote.length;
      
      writeToLog(`Procesados: ${procesados}/${totalDocuments} (100%)`);
      console.log(`Procesados: ${procesados}/${totalDocuments} (100%)`);
    }

    const endTime = moment().format('YYYY-MM-DD HH:mm:ss');
    writeToLog(`${endTime} - Termina el Calculo del Porcentaje de la Demanda`);
    writeToLog(`Total documentos actualizados: ${actualizados}`);
    console.log(`${endTime} - C02 completado exitosamente`);
    console.log(`Total documentos actualizados: ${actualizados}`);

  } catch (error) {
    const errorTime = moment().format('YYYY-MM-DD HH:mm:ss');
    const errorMsg = `${errorTime} - ERROR en C02: ${error.message}`;
    writeToLog(errorMsg);
    console.error(errorMsg);
    console.error('Stack trace:', error.stack);
    throw error; // Re-lanzar para que el script padre lo maneje
  } finally {
    if (client) {
      await client.close();
      writeToLog(`Conexión MongoDB cerrada`);
    }
  }
}

// Función para procesar un lote de documentos
async function procesarLote(collection, lote, sumasMap) {
  const operacionesBulk = [];

  for (const documento of lote) {
    const ubicacion = documento.Ubicacion;
    const demandaCosto = parseFloat(documento.Demanda_Costo) || 0;
    const sumaTotalUbicacion = sumasMap.get(ubicacion) || 0;

    // Calcular porcentaje (evitar división por cero)
    let demandaPorcentaje = 0;
    if (sumaTotalUbicacion > 0) {
      demandaPorcentaje = (demandaCosto / sumaTotalUbicacion) * 100;
    }

    // Agregar operación de actualización al bulk
    operacionesBulk.push({
      updateOne: {
        filter: { _id: documento._id },
        update: { 
          $set: { 
            Demanda_Porcentaje: Number(demandaPorcentaje.toFixed(6)) // Limitar decimales
          } 
        }
      }
    });
  }

  // Ejecutar todas las actualizaciones en una sola operación
  if (operacionesBulk.length > 0) {
    const resultado = await collection.bulkWrite(operacionesBulk, { ordered: false });
    return resultado.modifiedCount;
  }

  return 0;
}

function writeToLog(message) {
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  const logMessage = `[${timestamp}] ${message}`;
  
  try {
    // Verificar que el directorio de log existe antes de escribir
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(logFile, logMessage + '\n');
  } catch (err) {
    // Fallback: escribir en directorio actual si hay problemas
    try {
      const fallbackLogFile = path.join(__dirname, 'C02_fallback.log');
      fs.appendFileSync(fallbackLogFile, logMessage + '\n');
      console.error(`Log escrito en fallback: ${fallbackLogFile}`);
    } catch (fallbackErr) {
      console.error(`Error escribiendo log: ${err.message}`);
    }
  }
}

// Ejecutar solo si es llamado directamente
if (require.main === module) {
  console.log('================================================================================');
  console.log(`C02 - Calculo del Porcentaje de la Demanda`);
  console.log(`Iniciado: ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
  console.log(`DB: ${dbName}`);
  console.log('================================================================================');

  calcularDemandaPorcentaje()
    .then(() => {
      console.log('================================================================================');
      console.log(`C02 - COMPLETADO EXITOSAMENTE`);
      console.log(`Finalizado: ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
      console.log('================================================================================');
      process.exit(0);
    })
    .catch((error) => {
      console.log('================================================================================');
      console.error(`C02 - ERROR FATAL`);
      console.error(`Error: ${error.message}`);
      console.error(`Finalizado: ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
      console.log('================================================================================');
      process.exit(1);
    });
}