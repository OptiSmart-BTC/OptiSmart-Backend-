const { exec } = require('child_process');
const fs = require('fs');
const moment = require('moment');
const { decryptData } = require('./DeCriptaPassAppDb');


const parametroUsuario = process.argv.slice(2)[0];

const { GB_DBName } = require(`../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`);
const parametroFolder = GB_DBName.toUpperCase();

//const { AppUser, AppPassword, Tipo} = require(`../../${parametroFolder}/cfg/${parametroUsuario}.uservars`);
const { DBUser, DBPassword, DBName } = require(`../../${parametroFolder}/cfg/dbvars`);
const dbName = `btc_opti_${DBName}`;






//const parametroFolder = parametroUsuario.toUpperCase();
//const dbName = `btc_opti_${parametroUsuario}`;

const logFileName = 'Override_PolInvent_Sem';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;


//const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);



//-----------------------------------------------------------------------------

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
    { nombre: 'ORS01_Actualiza_Datos_SKU.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'ORS01.1_ReCalcula_SS_Cantidad_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'ORS02_ReCalcula_Override_SI_NO.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'ORS03_ReCalcula_ROP.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'ORS04_ReCalcula_META.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'ORS05_ReCalcula_Inventario_Promedio.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'ORS06_Formatea_TablaUI.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'ORS07_Calcula_Dias_Cobertura.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'ORS08_Calcula_VidaUtilDias_ROPAlto_SobreinventarioDias.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'ORS09_Calcula_Pallets.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'ORS10_Calcula_Costo.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'ORS11_Calcula_UOM.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'ORS12_Formatea_TablasUI_Costos.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'ORS13_UneTablas.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },

  ];

  writeToLog(`Proceso de Override de Politica de Inventarios Semanal\n`);
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
  writeToLog(`Terminan el Proceso de Override de Politica de Inventarios Semanal: ${now_fin}\n`);
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
