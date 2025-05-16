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
  { nombre: 'validaCodificacionAllSKU_v3.js', parametros: `${parametroFolder}` },
  { nombre: 'ValidaCSV_Headers_v6.js', parametros: `${parametroFolder}` },
  { nombre: 'ValidaCSV_SKU_TipodeDato_v9.js', parametros: `${parametroFolder}` },
  { nombre: 'loadCSVsku_v11.js', parametros: `${dbName} ${parametroFolder} ${AppUser}` },
  { nombre: 'Mueve_SKUcsvProcesados_v2.js', parametros: `${parametroFolder}` },
  { nombre: 'LimpiaEspaciosSKU_v4.js', parametros: `${dbName} ${parametroFolder} ${AppUser}` },
  { nombre: 'CsvTempl_sku_v3.js', parametros: `${dbName} ${parametroFolder} ${AppUser}` },
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
  if (archivo.nombre === 'ValidaCSV_SKU_TipodeDato_v9.js') {
    proceso.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Error en 'ValidaCSV_SKU_TipodeDato_v9.js'. Deteniendo la ejecución de los archivos restantes.`);
        return;
      }
    });
  }
}



function IniciaejecutarArchivos() {
  const filePath = `../../${parametroFolder}/csv/in/sku.csv`; 
  
  // Verificar si el archivo "sku.csv" existe
  if (fs.existsSync(filePath)) {
    writeToLog(`Carga de SKUs\n`);
    writeToLog(`Inicio de ejecucion: ${now}\n`);
    writeToLog(`Validaciones y Carga de datos de SKU\n`);
    //ejecutarArchivos(archivos);

 //   if (Tipo === 'A') {
      ejecutarArchivos(archivos);
 //   } else {
  //    writeToLog(`El Usuario con el que se trata de ejecutar los procesos, no es de tipo Admin\n`);
//    }

  } else {
    //console.log('El archivo "sku.csv" no existe. No se puede ejecutar la función.');
    // Opcional: Agregar un mensaje al log
    writeToLog(`Carga de SKUs\n`);
    writeToLog(`Inicio de ejecucion: ${now}\n`);
    writeToLog(`Validaciones y Carga de datos de SKU\n`);
  //  if (Tipo !== 'A') {
  //    writeToLog(`El Usuario con el que se trata de ejecutar los procesos, no es de tipo Admin\n`);
    //} 
    writeToLog('El archivo "sku.csv" no existe. Valide que el nombre del archivo cargado sea el correcto.\n');
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

IniciaejecutarArchivos();