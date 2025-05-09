const { exec } = require('child_process');
const fs = require('fs');
const moment = require('moment');
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const parametroUsuario = process.argv.slice(2)[0];
 
const { GB_DBName } = require(`../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`);
const parametroFolder = GB_DBName.toUpperCase();

const { AppUser, AppPassword, Tipo} = require(`../../${parametroFolder}/cfg/${parametroUsuario}.uservars`);
const { DBUser, DBPassword, DBName } = require(`../../${parametroFolder}/cfg/dbvars`);
const dbName = `btc_opti_${DBName}`;



const archivos = [
  { nombre: 'validaCodificacionAllHistorico_v3.js', parametros: `${parametroFolder}` },
  { nombre: 'ValidaCSV_Headers_v5.js', parametros: `${parametroFolder}` },
  { nombre: 'ValidaCSV_HistoricoDemanda_TipodeDato_v4.js', parametros: `${parametroFolder}` },
  { nombre: 'loadCSVHistDmd_v5.js', parametros: `${dbName} ${parametroFolder} ${AppUser}` },
  { nombre: 'Mueve_HistoricoCSVProcesados_v2.js', parametros: `${parametroFolder}` },
  { nombre: 'LimpiaEspaciosHistorico_v2.js', parametros: `${dbName} ${parametroFolder} ${AppUser}` },
  { nombre: 'ValidaCSV_Integridad_SKU_v7.js', parametros: `${dbName} ${parametroFolder} ${AppUser}` },
  { nombre: 'Calcula_Hist_FechasyRango_v2.js', parametros: `${dbName} ${parametroFolder} ${AppUser}` },
  { nombre: 'CsvTempl_hist.js', parametros: `${dbName} ${parametroFolder} ${AppUser}` },
  { nombre: 'CsvTempl_InvDispo_v2.js', parametros: `${dbName} ${parametroFolder} ${AppUser}` },
];

const logFileName = 'LogdeCargaCSV';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;

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
  if (archivo.nombre === 'ValidaCSV_HistoricoDemanda_TipodeDato_v4.js') {
    proceso.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Error en 'ValidaCSV_HistoricoDemanda_TipodeDato_v4.js'. Deteniendo la ejecución de los archivos restantes.`);
        return;
      }
    });
  }
}




function IniciaejecutarArchivos() {
  const filePath = `../../${parametroFolder}/csv/in/historico_demanda.csv`; 
  
  // Verificar si el archivo "historico_demanda.csv" existe
  if (fs.existsSync(filePath)) {
    writeToLog(`\n\n--------------------------------------------------------------------------`);
    writeToLog(`Carga de Historico de Demanda\n`);
    writeToLog(`Inicio de ejecucion: ${now}\n`);
    writeToLog(`Validaciones y Carga de datos del Historico de Ventas\n`);
    

    //if (Tipo === 'A') {
      ejecutarArchivos(archivos);
    //} else {
      //writeToLog(`El Usuario con el que se trata de ejecutar los procesos, no es de tipo Admin\n`);
    //}
  
  } else {
    writeToLog(`\n\n--------------------------------------------------------------------------`);
    writeToLog(`Carga de Historico de Demanda\n`);
    writeToLog(`Inicio de ejecucion: ${now}\n`);
    writeToLog(`Validaciones y Carga de datos del Historico de Ventas\n`);
    //if (Tipo !== 'A') {
      //writeToLog(`El Usuario con el que se trata de ejecutar los procesos, no es de tipo Admin\n`);
    //} 
    writeToLog('El archivo "historico_demanda.csv" no existe. Valide que el nombre del archivo cargado sea el correcto.\n');
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

IniciaejecutarArchivos();