const { exec } = require('child_process');
const fs = require('fs');
const moment = require('moment');
const { decryptData } = require('./DeCriptaPassAppDb');

const parametroUsuario = process.argv.slice(2)[0];
const { GB_DBName } = require(`../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`);
const parametroFolder = GB_DBName.toUpperCase();

const { DBUser, DBPassword, DBName } = require(`../../${parametroFolder}/cfg/dbvars`);
const dbName = `btc_opti_${DBName}`;

const logFileName = 'PlanReposicion';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;

// Crear respaldo del log si ya existe
if (fs.existsSync(logFile)) {
  const timestamp = moment().format('YYYYMMDD_HHmmss');
  const renamedLogFile = `../../${parametroFolder}/log/Log_historico/${logFileName}_${timestamp}.log`;

  if (!fs.existsSync(logFolder)) {
    fs.mkdirSync(logFolder);
  }

  fs.renameSync(logFile, `${renamedLogFile}`);
}

async function IniciaejecutarArchivos() {
  const passadminDeCripta = await getDecryptedPassadmin();

  const archivos = [
    { nombre: 'PR00_limpia_PlanRep.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR01_PlanRep_InvDispo.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR1.1_Actualiza_Datos_SKU.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    //{ nombre: 'Copia_NivelOA.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR02_PlanRep_InvTrans.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR03_CantidadConfirmada_Total.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR04_PolInv_SS_Cantidad.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
   // { nombre: 'PR05_RequiereReposicion.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
   // { nombre: 'PR06_Cantidad_a_Reponer.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    
    { nombre: 'PR07_SKU_MOQ.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'Ejecuta_PlanPorNivel.js', parametros: `${DBName} ${DBUser} ${passadminDeCripta}` },
    
    { nombre: 'PR11_Calculo_Indicadores.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR12_Alerta_Excedente.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },


    { nombre: 'PR10_Formatea_TablaUI.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` }
    
  ];
  

  writeToLog(`Proceso del Cálculo de Plan de Reposición\n`);
  const globalStart = moment();
  writeToLog(`Inicio de ejecución: ${globalStart.format('YYYY-MM-DD HH:mm:ss')}\n`);

  for (const archivo of archivos) {
    const comando = `node ${archivo.nombre} ${archivo.parametros}`;
    const start = moment();
    writeToLog(`\n-> Inicia ${archivo.nombre} a las ${start.format('YYYY-MM-DD HH:mm:ss')}`);

    try {
      await ejecutarComando(comando);

      const end = moment();
      const duration = moment.duration(end.diff(start));
      const duracionStr = `${duration.hours()}h ${duration.minutes()}m ${duration.seconds()}s`;

      writeToLog(`-> Termina ${archivo.nombre} a las ${end.format('YYYY-MM-DD HH:mm:ss')} | Duración: ${duracionStr}`);
    } catch (error) {
      const now_error = moment().format('YYYY-MM-DD HH:mm:ss');
      writeToLog(`${now_error} - Error al ejecutar el archivo ${archivo.nombre}: ${error}`);
    }
  }

  const globalEnd = moment();
  const totalDuration = moment.duration(globalEnd.diff(globalStart));
  const totalStr = `${totalDuration.hours()}h ${totalDuration.minutes()}m ${totalDuration.seconds()}s`;

  writeToLog(`\nFinaliza ejecución total: ${globalEnd.format('YYYY-MM-DD HH:mm:ss')} | Tiempo total: ${totalStr}\n`);
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

async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}

IniciaejecutarArchivos();

