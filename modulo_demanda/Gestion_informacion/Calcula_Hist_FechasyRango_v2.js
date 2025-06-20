const fs = require('fs');
const { MongoClient } = require('mongodb');
const moment = require('moment');

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const user = process.argv[3];
const parametroFolder = user.toUpperCase();
const logFile = `../../../${parametroFolder}/log/Logs_demanda.log`; 

const { DBUser, DBPassword } = require(`../../../${parametroFolder}/cfg/dbvars`);

// Define una función asincrónica para ejecutar el código
async function generateFechas() {
  writeToLog(`\nPaso 09 - Calcula rangos de fechas de la Historia`);

  try {
    writeToLog(`\tIniciando conexión a MongoDB...`);
    const passadminDeCripta = await getDecryptedPassadmin();
    writeToLog(`\tContraseña desencriptada correctamente.`);
    
    const mongoURI = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
    writeToLog(`\tIntentando conectar a MongoDB: ${host}:${puerto}/${dbName}`);
    
    const client = new MongoClient(mongoURI);
    await client.connect();
    writeToLog(`\tConexión establecida correctamente.`);
    
    const db = client.db();
    writeToLog(`\tBase de datos seleccionada: ${dbName}`);
    
    const historiaCollection = db.collection(`historico_demanda_${user}`);
    writeToLog(`\tColección seleccionada: historico_demanda_${user}`);

    // Verificar si la colección está vacía
    const count = await historiaCollection.countDocuments();
    if (count === 0) {
      writeToLog(`\tError: La colección historico_demanda_${user} está vacía. No se pueden calcular fechas.`);
      await client.close();
      
      // Crear un archivo de fechas con valores predeterminados para evitar errores
      const fileName = `../../../${parametroFolder}/cfg/HistFechas.js`;
      if (fs.existsSync(fileName)) {
        fs.unlinkSync(fileName);
      }
      
      const defaultContent = `
const FechaMax = "01/01/2023";
const FechaMin = "01/01/2022";
const Dias = "365";

module.exports = {
    FechaMax,
    FechaMin,
    Dias
};`;
      
      await fs.promises.writeFile(fileName, defaultContent);
      writeToLog(`\tSe creó un archivo de fechas con valores predeterminados para permitir que el proceso continúe.`);
      writeToLog(`\tDebe cargar datos en la colección antes de usar el sistema.`);
      
      return;
    }

    // Encuentra la fecha máxima y mínima en la colección
    writeToLog(`\tEjecutando consulta para encontrar fechas mínima y máxima...`);
    const result = await historiaCollection.aggregate([
      {
        $group: {
          _id: null,
          maxFecha: { $max: '$Fecha' },
          minFecha: { $min: '$Fecha' },
        },
      },
    ]).next();

    // Verificar si result es null
    if (!result) {
      writeToLog(`\tERROR: La consulta no devolvió resultados. La colección podría estar vacía o no contener fechas válidas.`);
      
      // Obtener ejemplos de registros para diagnóstico
      const ejemplos = await historiaCollection.find().limit(3).toArray();
      writeToLog(`\tEjemplos de registros en la colección (primeros 3):`);
      ejemplos.forEach((ejemplo, index) => {
        writeToLog(`\t\tRegistro ${index + 1}: ${JSON.stringify(ejemplo)}`);
      });
      
      client.close();
      writeToLog(`\tConexión a MongoDB cerrada.`);
      process.exit(1);
      return;
    }

    writeToLog(`\tFechas encontradas: maxFecha=${result.maxFecha}, minFecha=${result.minFecha}`);

    const maxFecha = result.maxFecha;
    const minFecha = result.minFecha;

    // Formatea las fechas al formato DD/MM/YYYY
    const maxFechaFormateada = formatDate(maxFecha);
    const minFechaFormateada = formatDate(minFecha);
    writeToLog(`\tFechas formateadas: maxFecha=${maxFechaFormateada}, minFecha=${minFechaFormateada}`);

    // Calcula el número de días entre las fechas
    const diffInMilliseconds = maxFecha - minFecha;
    const dias = diffInMilliseconds / (1000 * 60 * 60 * 24);
    const dias_correctos = dias + 1;
    writeToLog(`\tNúmero de días calculados: ${dias_correctos}`);

    // Genera el contenido del archivo Fechas_Hist.js
    const fileContent = `
const FechaMax = "${maxFechaFormateada}";
const FechaMin = "${minFechaFormateada}";
const Dias = "${dias_correctos}";

module.exports = {
    FechaMax,
    FechaMin,
    Dias
};`;

    // Crea el archivo Fechas_Hist.js con el contenido
    const fileName = `../../../${parametroFolder}/cfg/HistFechas.js`;
    await fs.promises.writeFile(fileName, fileContent);
    writeToLog(`\tArchivo "${fileName}" creado exitosamente.`);

    await client.close();
    writeToLog(`\tConexión a MongoDB cerrada.`);
    writeToLog(`\tTermina el proceso de cálculo de rangos de fechas de la Historia`);
  } catch (error) {
    writeToLog(`\tERROR en Calcula_Hist_FechasyRango_v2.js: ${error}`);
    console.error('Error:', error);
    process.exit(1);
  }
}

// Llama a la función asincrónica para ejecutar el código
generateFechas().catch((error) => {
  writeToLog(`\tError fatal en Calcula_Hist_FechasyRango_v2.js: ${error}`);
  console.error('Error fatal:', error);
  process.exit(1);
});

function formatDate(date) {
  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  return `${day < 10 ? '0' : ''}${day}/${month < 10 ? '0' : ''}${month}/${year}`;
}

async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}




