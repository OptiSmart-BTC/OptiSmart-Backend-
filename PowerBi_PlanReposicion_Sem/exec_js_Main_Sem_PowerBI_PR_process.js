const { exec } = require('child_process');
const fs = require('fs');
const moment = require('moment');
const { decryptData } = require('./DeCriptaPassAppDb');
const { path_sftp, path_opti, path_users } = require(`../Configuraciones/paths_vars`);
 
const parametroUsuario = process.argv.slice(2)[0];

const { GB_DBName } = require(`../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`);
const parametroFolder = GB_DBName.toUpperCase();

const { DBUser, DBPassword, DBName } = require(`${path_users}/${parametroFolder}/cfg/dbvars`);
const dbName = `btc_opti_${DBName}`;

const logFileName = 'PowerBI_PlanReposicion_Sem';
const logFile = `${path_users}/${parametroFolder}/log/${logFileName}.log`;
const logFolder = `${path_users}/${parametroFolder}/log/Log_historico`;



//--------------------------------------------------------------
// Verificar si el archivo de log ya existe
if (fs.existsSync(logFile)) {
  const timestamp = moment().format('YYYYMMDD_HHmmss');
  const renamedLogFile = `${path_users}/${parametroFolder}/log/Log_historico/${logFileName}_${timestamp}.log`;

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
    { nombre: 'PwBiS00_limpia_Tabla.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS01_PlanRep_DatosIniciales.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS02_Calcula_Costo_Inv_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS03_Calcula_Clasificacion.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS04_Calcula_Costo_OK.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS05_Calcula_Costo_Down.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS06_Calcula_Costo_Up.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS07_Calcula_Demanda_Promedio_Diaria.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS08_Calcula_Inventario_Promedio.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS09_Calcula_Costos_ABCD.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS10_Calcula_Demanda_Diaria.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS11_Calcula_Rotacion_Anual_Dias.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS12_Calcula_Dias_Cobertura.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS13_Calcula_Tipo_Caso.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS14_Calcula_Intervalos_Dias_Cobertura.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS15_Calcula_Cero_Inv2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PwBiS16_Exporta_Datos.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta} ${parametroUsuario}` },

  ];

  writeToLog(`Proceso del Calculo de Datos para PowerBI del Plan de Reposicion Semanal\n`);
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
  writeToLog(`Terminan el Proceso del Calculo de Datos para PowerBI del Plan de Reposicion Semanal: ${now_fin}\n`);
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
