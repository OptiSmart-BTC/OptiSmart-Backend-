const { spawn } = require('child_process');
const fs = require('fs');
const moment = require('moment');
const path = require('path');

// Captura errores no manejados
process.on('uncaughtException', (error) => {
  console.error(`Error no manejado: ${error.message}`);
  process.exit(1);
});

const now = moment().format('YYYY-MM-DD HH:mm:ss');

try {
  // Parámetros del usuario
  const parametroUsuario = process.argv[2];
  const csvFilePath = process.argv[3];

  if (!parametroUsuario || !csvFilePath) {
    console.error('Error: Falta parametroUsuario o csvFilePath');
    process.exit(1);
  }

  // Configuración
  const { GB_DBName } = require(`../../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`);
  const parametroFolder = GB_DBName.toUpperCase();

  const { AppUser } = require(`../../../${parametroFolder}/cfg/${parametroUsuario}.uservars`);
  const { DBUser, DBPassword, DBName } = require(`../../../${parametroFolder}/cfg/dbvars`);
  const dbName = `btc_opti_${DBName}`;

  // Ruta del CSV a procesar
  const csvFileToProcess = csvFilePath;

  // Definición de scripts del pipeline
  const archivos = [
    { nombre: 'validaCodificacionAllHistorico_v3.js', parametros: `${parametroFolder} "${csvFileToProcess}"` },
    { nombre: 'ValidaCSV_Headers_v5.js', parametros: `${parametroFolder} "${csvFileToProcess}"` },
    { nombre: 'ValidaCSV_HistoricoDemanda_TipodeDato_v4.js', parametros: `${parametroFolder} "${csvFileToProcess}"` },
    { nombre: 'loadCSVHistDmd_v5.js', parametros: `${dbName} ${parametroFolder} ${AppUser} "${csvFileToProcess}"` },
    { nombre: 'Mueve_HistoricoCSVProcesados_v2.js', parametros: `${parametroFolder} "${csvFileToProcess}"` },
    { nombre: 'LimpiaEspaciosHistorico_v2.js', parametros: `${dbName} ${parametroFolder} ${AppUser}` },
    { nombre: 'ValidaCSV_Integridad_DFU_V7.js', parametros: `${dbName} ${parametroFolder} ${AppUser}` },
    // { nombre: 'Calcula_Hist_FechasyRango_v2.js', parametros: `${dbName} ${parametroFolder} ${AppUser}` },
  ];

  // Ruta del log centralizado
  const logFileName = 'Logs_demanda.log';
  const logFile = path.join(__dirname, '..', '..', '..', parametroFolder, 'log', logFileName);

  // Asegurar carpeta de logs
  if (!fs.existsSync(path.dirname(logFile))) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
  }

  // Escribe tanto en consola como en el log
  function writeToLog(msg) {
    const line = `${msg}\n`;
    process.stdout.write(line);
    try {
      fs.appendFileSync(logFile, line);
    } catch (error) {
      console.error(`Error al escribir en log: ${error.message}`);
    }
  }

  // Separa parámetros respetando comillas
  function splitParams(paramStr) {
    return paramStr.match(/(?:[^\s"]+|"[^"]*")+/g).map(s => s.replace(/^"|"$/g, ''));
  }

  // Ejecuta cada script en secuencia
  function ejecutarArchivos(lista) {
    if (lista.length === 0) {
      writeToLog('\nTerminan Validaciones y Carga de datos del Histórico de Ventas');
      process.exit(0); // Terminar con éxito
      return;
    }

    const { nombre, parametros } = lista.shift();
    const args = splitParams(parametros);
    writeToLog(`Ejecutando: ${nombre}`);

    // Ruta absoluta al script hijo
    const scriptFullPath = path.resolve(__dirname, nombre);

    // Verificar que el script existe
    if (!fs.existsSync(scriptFullPath)) {
      writeToLog(`Error: Script ${nombre} no encontrado en ${scriptFullPath}`);
      process.exit(1);
    }

    // Lanza el proceso hijo
    const child = spawn('node', [scriptFullPath, ...args], { stdio: 'pipe' });

    // Capturar stdout/stderr del proceso hijo
    child.stdout.on('data', (data) => {
      process.stdout.write(data.toString());
    });
    
    child.stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });

    // Manejar errores del proceso
    child.on('error', (error) => {
      writeToLog(`Error al ejecutar ${nombre}: ${error.message}`);
      process.exit(1);
    });

    child.on('close', code => {
      if (code !== 0) {
        writeToLog(`Error crítico en ${nombre}. Código de salida: ${code}. Proceso detenido.`);
        process.exit(1); // Terminar con error
        return;
      }
      writeToLog(`Finalizado: ${nombre}`);
      ejecutarArchivos(lista);
    });
  }

  // Punto de entrada
  (function main() {
    writeToLog('--------------------------------------------------------------------------');
    writeToLog('Carga de Histórico de Demanda');
    writeToLog(`Inicio de ejecución: ${now}`);
    writeToLog(`Archivo a procesar: ${csvFileToProcess}`);
    writeToLog('Validaciones y Carga de datos del Histórico de Ventas\n');

    // Verificar que el archivo CSV existe (ruta absoluta o relativa)
    if (!fs.existsSync(csvFileToProcess) && !fs.existsSync(path.resolve(__dirname, csvFileToProcess))) {
      writeToLog(`Error: El archivo "${csvFileToProcess}" no existe. Valida la ruta.`);
      process.exit(1);
      return;
    }

    ejecutarArchivos([...archivos]);
  })();

} catch (error) {
  console.error(`Error fatal: ${error.message}`);
  process.exit(1);
}
