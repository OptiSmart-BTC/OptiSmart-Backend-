const { exec } = require('child_process');
const fs = require('fs');
const moment = require('moment');
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const parametroUsuario = process.argv.slice(2)[0];
const dbName = `btc_opti_${parametroUsuario}`;
const parametro = dbName;

const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();

const archivos = [
  { nombre: 'validaCodificacionAllSKU_v2.js', parametros: `${parametroFolder}` },
  { nombre: 'ValidaCSV_Headers_v5.js', parametros: `${parametroFolder}` },
  { nombre: 'ValidaCSV_SKU_TipodeDato_v8.js', parametros: `${parametroFolder}` },
  { nombre: 'loadCSVsku_v9.js', parametros: `${dbName} ${parametroFolder}` },
  //{ nombre: 'Mueve_SKUcsvProcesados.js', parametros: `${parametroFolder}` },
  { nombre: 'LimpiaEspaciosSKU_v4.js', parametros: `${dbName} ${parametroFolder}` },
  { nombre: 'CsvTempl_sku_v2.js', parametros: `${dbName} ${parametroFolder}` },
];
 
const logFileName = 'LogdeCargaCSV';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;

// Verificar si el archivo de log ya existe
if (fs.existsSync(logFile)) {
  const timestamp = moment().format('YYYYMMDD_HHmmss');
  const renamedLogFile = `../../${parametroFolder}/log/Log_historico/${logFileName}_${timestamp}.log`;

  // Crear el folder Log_historico si no existe
  if (!fs.existsSync(logFolder)) {
    fs.mkdirSync(logFolder);
  }

  // Mover el archivo existente a Log_historico
  fs.renameSync(logFile, `${renamedLogFile}`);
}

// Función para ejecutar los archivos en secuencia
function ejecutarArchivos(archivos) {
  if (archivos.length === 0) {
    //console.log('\n\nEjecución de archivos completada.');
    writeToLog(`\n\n`);
    writeToLog(`Terminan Validaciones y Carga de datos de SKU\n`);
    return;
  }

  const archivo = archivos.shift();
  const comando = `node ${archivo.nombre} ${archivo.parametros}`;

  const proceso = exec(comando, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error al ejecutar el archivo ${archivo.nombre}:`, error);
      return;
    }

    //console.log(`Salida del archivo ${archivo.nombre}:`, stdout);
    //console.error(`Errores del archivo ${archivo.nombre}:`, stderr);

    if (stdout.includes('ERROR')) {
      //console.error(`Error en la ejecución del archivo ${archivo.nombre}. Deteniendo la ejecución de los archivos restantes.`);
      return;
    }

    if (archivos.length > 0) {
      ejecutarArchivos(archivos);
    } else {
      //console.log('Ejecución de archivos completada.');
      writeToLog(`\n\n`);
      writeToLog(`Terminan Validaciones y Carga de datos de SKU\n`);
    }
  });

  // Detener la ejecución si ocurre un error en 'ValidaCSV_SKU_TipodeDato_v4.js'
  if (archivo.nombre === 'ValidaCSV_SKU_TipodeDato_v4.js') {
    proceso.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Error en 'ValidaCSV_SKU_TipodeDato_v4.js'. Deteniendo la ejecución de los archivos restantes.`);
        return;
      }
    });
  }
}



function IniciaejecutarArchivos() {
  const filePath = `../../${parametroFolder}/csv/sku.csv`; 
  
  // Verificar si el archivo "sku.csv" existe
  if (fs.existsSync(filePath)) {
    writeToLog(`Carga de SKUs\n`);
    writeToLog(`Inicio de ejecucion: ${now}\n`);
    writeToLog(`Validaciones y Carga de datos de SKU\n`);
    ejecutarArchivos(archivos);
  } else {
    //console.log('El archivo "sku.csv" no existe. No se puede ejecutar la función.');
    // Opcional: Agregar un mensaje al log
    writeToLog(`Carga de SKUs\n`);
    writeToLog(`Inicio de ejecucion: ${now}\n`);
    writeToLog(`Validaciones y Carga de datos de SKU\n`);
    writeToLog('El archivo "sku.csv" no existe. Valide que el nombre del archivo cargado sea el correcto.\n');
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

IniciaejecutarArchivos();