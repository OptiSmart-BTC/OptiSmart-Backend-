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




//const dbName = `btc_opti_${parametroUsuario}`;
//const parametro = dbName;

//const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
//const parametroFolder = parte.toUpperCase();
 
const archivos = [
  { nombre: 'validaCodificacionAll_InvTrans.js', parametros: `${parametroFolder}` },
  { nombre: 'ValidaCSV_Headers_v4.js', parametros: `${parametroFolder}` },
  { nombre: 'ValidaCSV_InvTrans_TipodeDato.js', parametros: `${parametroFolder}` },
  { nombre: 'loadCSVInvTrans.js', parametros: `${dbName} ${parametroFolder}` },
  { nombre: 'Mueve_InvTranscsvProcesados.js', parametros: `${parametroFolder}` },
  { nombre: 'LimpiaEspaciosInvTrans.js', parametros: `${dbName} ${parametroFolder}` },
  //{ nombre: 'ValidaCSV_InvTrans_Integridad_SKU.js', parametros: `${dbName} ${parametroFolder}` },
  { nombre: 'ValidaCSV_InvTrans_PolInv_Integridad_SKU.js', parametros: `${dbName} ${parametroFolder}` },
  //{ nombre: 'ValidaCSV_InvTrans_Valida_SS_Cantidad_0.js', parametros: `${dbName} ${parametroFolder}` }
];
 
const logFileName = 'LogdeCargaInvTransCSV';
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
    writeToLog(`\n\n`);
    writeToLog(`Terminan Validaciones y Carga de datos de Inventarios\n`);
    return;
  }

  const archivo = archivos.shift();
  console.log(`${archivo.nombre}`);
  const comando = `node ${archivo.nombre} ${archivo.parametros}`;

  const proceso = exec(comando, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error al ejecutar el archivo ${archivo.nombre}:`, error);
      return;
    }

    if (stdout.includes('ERROR')) {
      return;
    }

    if (archivos.length > 0) {
      ejecutarArchivos(archivos);
    } else {
      writeToLog(`\n\n`);
      writeToLog(`Terminan Validaciones y Carga de datos de Inventarios\n`);
    }
  });

  // Detener la ejecución si ocurre un error en 'ValidaCSV_Inv_TipodeDato.js'
  if (archivo.nombre === 'ValidaCSV_InvTrans_TipodeDato.js') {
    proceso.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Error en 'ValidaCSV_InvTrans_TipodeDato.js'. Deteniendo la ejecución de los archivos restantes.`);
        return;
      }
    });
  }
}




function IniciaejecutarArchivos() {
  const filePath = `../../${parametroFolder}/csv/in/inventario_transito.csv`; 
  

  if (fs.existsSync(filePath)) {
    //writeToLog(`\n\n--------------------------------------------------------------------------`);
    writeToLog(`Carga del Inventario En Transito\n`);
    writeToLog(`Inicio de ejecucion: ${now}\n`);
    writeToLog(`Validaciones y Carga de datos de Inventario En Transito\n`);
    ejecutarArchivos(archivos);
  } else {
    writeToLog(`\n\n--------------------------------------------------------------------------`);
    writeToLog(`Carga de Inventarios en Transito\n`);
    writeToLog(`Inicio de ejecucion: ${now}\n`);
    writeToLog(`Validaciones y Carga de datos de Inventario En Transito\n`);
    writeToLog('El archivo "inventario_transito.csv" no existe. Valide que el nombre del archivo cargado sea el correcto.\n');
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

IniciaejecutarArchivos();