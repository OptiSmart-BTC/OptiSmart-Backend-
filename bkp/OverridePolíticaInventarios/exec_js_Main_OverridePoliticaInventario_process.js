const { exec } = require('child_process');
const fs = require('fs');
const moment = require('moment');



const parametroUsuario = process.argv.slice(2)[0];
const parametroFolder = parametroUsuario.toUpperCase();
const dbName = `btc_opti_${parametroUsuario}`;

const logFileName = 'Override_PolInvent';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;

const { decryptData } = require('./DeCriptaPassAppDb');
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);


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

async function IniciaejecutarArchivos() {

  const passadminDeCripta = await getDecryptedPassadmin();

  const archivos = [
    { nombre: 'OR01_ReCalcula_Override_SI_NO.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'OR02_ReCalcula_SS_Cantidad.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'OR03_ReCalcula_ROP.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'OR04_ReCalcula_META.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'OR05_ReCalcula_Inventario_Promedio.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'OR06_Formatea_TablaUI.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'OR07_Calcula_Dias_Cobertura.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'OR08_Calcula_VidaUtilDias_ROPAlto_SobreinventarioDias.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'OR09_Calcula_Pallets.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'OR10_Calcula_Costo.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'OR11_Calcula_UOM.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'OR12_Formatea_TablasUI_Costos.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'OR13_UneTablas.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },

  ];

  writeToLog(`Proceso de Override de Politica de Inventarios\n`);
  writeToLog(`Inicio de ejecucion: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n`);

  for (const archivo of archivos) {
    const comando = `node ${archivo.nombre} ${archivo.parametros}`;

    try {
      await ejecutarComando(comando);
    } catch (error) {
      const now_error = moment().format('YYYY-MM-DD HH:mm:ss');
      writeToLog(`${now_error} - Error al ejecutar el archivo ${archivo.nombre}: ${error}`);
    }
  }

  const now_fin = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\n\n`);
  writeToLog(`Terminan el Proceso de Override de Politica de Inventarios: ${now_fin}\n`);
}

function ejecutarComando(comando) {
  return new Promise((resolve, reject) => {
    exec(comando, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}


// Obtener el valor desencriptado de passadmin
async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}


IniciaejecutarArchivos();
