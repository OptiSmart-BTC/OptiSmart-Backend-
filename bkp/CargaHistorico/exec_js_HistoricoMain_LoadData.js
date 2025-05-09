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
  { nombre: 'validaCodificacionAllHistorico_v2.js', parametros: `${parametroFolder}` },
  { nombre: 'ValidaCSV_Headers_v4.js', parametros: `${parametroFolder}` },
  { nombre: 'ValidaCSV_HistoricoDemanda_TipodeDato_v3.js', parametros: `${parametroFolder}` },
  { nombre: 'loadCSVHistDmd_v4.js', parametros: `${dbName} ${parametroFolder}` },
  //{ nombre: 'Mueve_HistoricoCSVProcesados.js', parametros: `${parametroFolder}` },
  { nombre: 'LimpiaEspaciosHistorico_v2.js', parametros: `${dbName} ${parametroFolder}` },
  { nombre: 'limpia_Historico_Cantidad_0_v6.js', parametros: `${dbName} ${parametroFolder}` },
  { nombre: 'ValidaCSV_Integridad_SKU_v7.js', parametros: `${dbName} ${parametroFolder}` },
  { nombre: 'Calcula_Hist_FechasyRango_v2.js', parametros: `${dbName} ${parametroFolder}` },
  { nombre: 'CsvTempl_hist.js', parametros: `${dbName} ${parametroFolder}` },
  { nombre: 'CsvTempl_InvDispo_v2.js', parametros: `${dbName} ${parametroFolder}` },
];

const logFileName = 'LogdeCargaCSV';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;

// Verificar si el archivo de log ya existe
/*
if (fs.existsSync(logFile)) {
  const timestamp = moment().format('YYYYMMDD_HHmmss');
  const renamedLogFile = `../../${parametroFolder}/log/Log_historico/${logFileName}_${timestamp}.log`;

  // Crear el folder Log_historico si no existe
  if (!fs.existsSync(logFolder)) {
    fs.mkdirSync(logFolder);
  }

  // Mover el archivo existente a Log_historico
  fs.renameSync(logFile, `${renamedLogFile}`);
}*/

// Función para ejecutar los archivos en secuencia
function ejecutarArchivos(archivos) {
  if (archivos.length === 0) {
    //console.log('\n\nEjecución de archivos completada.');
    writeToLog(`\n\n`);
    writeToLog(`Terminan Validaciones y Carga de datos del Historico de Ventas\n`);
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
      writeToLog(`Terminan Validaciones y Carga de datos del Historico de Ventas\n`);
    }
  });

  // Detener la ejecución si ocurre un error en 'ValidaCSV_HistoricoDemanda_TipodeDato_v2.js'
  if (archivo.nombre === 'ValidaCSV_HistoricoDemanda_TipodeDato_v2.js') {
    proceso.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Error en 'ValidaCSV_HistoricoDemanda_TipodeDato_v2.js'. Deteniendo la ejecución de los archivos restantes.`);
        return;
      }
    });
  }
}



// Llamar a la función para ejecutar los archivos
//ejecutarArchivos(archivos);

/*
function IniciaejecutarArchivos() {
  //console.log('Inicia Ejecución de archivos.');
  writeToLog('------------------------------------------------------------------------------');
  writeToLog(`Inicio de ejecucion: ${now}`);
  writeToLog(`\n>>>>> Incia Validaciones y Carga de datos del Historico de Ventas <<<<<\n`);
  ejecutarArchivos(archivos);

}
*/

function IniciaejecutarArchivos() {
  const filePath = `../../${parametroFolder}/csv/historico_demanda.csv`; 
  
  // Verificar si el archivo "historico_demanda.csv" existe
  if (fs.existsSync(filePath)) {
    writeToLog(`\n\n--------------------------------------------------------------------------`);
    writeToLog(`Carga de Historico de Demanda\n`);
    writeToLog(`Inicio de ejecucion: ${now}\n`);
    writeToLog(`Validaciones y Carga de datos del Historico de Ventas\n`);
    ejecutarArchivos(archivos);
  } else {
    writeToLog(`\n\n--------------------------------------------------------------------------`);
    writeToLog(`Carga de Historico de Demanda\n`);
    writeToLog(`Inicio de ejecucion: ${now}\n`);
    writeToLog(`Validaciones y Carga de datos del Historico de Ventas\n`);
    writeToLog('El archivo "historico_demanda.csv" no existe. Valide que el nombre del archivo cargado sea el correcto.\n');
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

IniciaejecutarArchivos();