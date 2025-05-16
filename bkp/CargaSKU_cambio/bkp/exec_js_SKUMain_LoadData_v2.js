const { exec } = require('child_process');
//const fs = require('fs');
const moment = require('moment');
const now = moment().format('YYYY-MM-DD HH:mm:ss');
const fs = require('fs').promises;

const parametroUsuario = process.argv.slice(2)[0];
const dbName = `btc_opti_${parametroUsuario}`;
const parametro = dbName;

const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();

const logFileName = 'LogdeCargaCSV';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;

//-------------------------------------------------------
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
//-------------------------------------------------------



async function ejecutarArchivos() {
  try {




    // Ejecutar COPIA.js con parámetros
    const resultado1 = await require('../validaCodificacionAllSKU_v2.js')(`${parametroFolder}`);
    //await escribirLog('COPIA', resultadoCopia);
    await writeToLog(resultadoCopia);

    // Ejecutar RENOMBRA.js con parámetros
    const resultadoRenombra = await require('./RENOMBRA')('archivo_antiguo.txt', 'archivo_nuevo.txt');
    await escribirLog('RENOMBRA', resultadoRenombra);

    // ... (hacer lo mismo para los demás archivos)

    console.log('Todos los archivos se ejecutaron correctamente.');
  } catch (error) {
    console.error('Error general:', error.message);
    process.exit(1);
  }
}


async function writeToLog(writeToLog) {
  const logMensaje = `${writeToLog}\n`;

  // Escribir en un archivo de log
  await fs.appendFile(logFile, logMensaje);

  // Imprimir en la consola
  console.log(logMensaje);

  // Si la ejecución no fue exitosa, lanzar una excepción
  if (!resultado.success) {
    throw new Error(`Error en ${nombreArchivo}`);
  }
}

ejecutarArchivos();



/*
function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}
*/
