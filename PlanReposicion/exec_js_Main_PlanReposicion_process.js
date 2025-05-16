const { exec } = require('child_process');
const fs = require('fs');
const moment = require('moment');
const { decryptData } = require('./DeCriptaPassAppDb');
<<<<<<< HEAD
 
const parametroUsuario = process.argv.slice(2)[0];

const { GB_DBName } = require(`../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`);
const parametroFolder = GB_DBName.toUpperCase();

//const { AppUser, AppPassword, Tipo} = require(`../../${parametroFolder}/cfg/${parametroUsuario}.uservars`);
const { DBUser, DBPassword, DBName } = require(`../../${parametroFolder}/cfg/dbvars`);
const dbName = `btc_opti_${DBName}`;

//const parametroFolder = parametroUsuario.toUpperCase();
//const dbName = `btc_opti_${parametroUsuario}`;

=======

const parametroUsuario = process.argv.slice(2)[0];
const { GB_DBName } = require(`../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`);
const parametroFolder = GB_DBName.toUpperCase();

const { DBUser, DBPassword, DBName } = require(`../../${parametroFolder}/cfg/dbvars`);
const dbName = `btc_opti_${DBName}`;

>>>>>>> origin/test
const logFileName = 'PlanReposicion';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;

<<<<<<< HEAD

//const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);




//--------------------------------------------------------------
// Verificar si el archivo de log ya existe
=======
// Crear respaldo del log si ya existe
>>>>>>> origin/test
if (fs.existsSync(logFile)) {
  const timestamp = moment().format('YYYYMMDD_HHmmss');
  const renamedLogFile = `../../${parametroFolder}/log/Log_historico/${logFileName}_${timestamp}.log`;

<<<<<<< HEAD
  // Crear el folder Log_historico si no existe
=======
>>>>>>> origin/test
  if (!fs.existsSync(logFolder)) {
    fs.mkdirSync(logFolder);
  }

<<<<<<< HEAD
  // Mover el archivo existente a Log_historico
=======
>>>>>>> origin/test
  fs.renameSync(logFile, `${renamedLogFile}`);
}

async function IniciaejecutarArchivos() {
<<<<<<< HEAD

=======
>>>>>>> origin/test
  const passadminDeCripta = await getDecryptedPassadmin();

  const archivos = [
    { nombre: 'PR00_limpia_PlanRep.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR01_PlanRep_InvDispo.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR1.1_Actualiza_Datos_SKU.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
<<<<<<< HEAD
    { nombre: 'PR02_PlanRep_InvTrans.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR03_CantidadConfirmada_Total.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR04_PolInv_SS_Cantidad.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR05_RequiereReposicion.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR06_Cantidad_a_Reponer.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR07_SKU_MOQ.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR08_Plan_Reposicion_Cantidad.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR09_Plan_Reposicion_Pallets.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR09.1_Plan_Reposicion_Costo.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR09.2_SKU_Costo_Unidad.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR10_Formatea_TablaUI.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` }
  ];

  writeToLog(`Proceso del Calculo de Plan de Reposicion\n`);
  writeToLog(`Inicio de ejecucion: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n`);

  for (const archivo of archivos) {
    const comando = `node ${archivo.nombre} ${archivo.parametros}`;

    try {
      await ejecutarComando(comando);
=======
    //{ nombre: 'Copia_NivelOA.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR02_PlanRep_InvTrans.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR03_CantidadConfirmada_Total.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR04_PolInv_SS_Cantidad.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
   // { nombre: 'PR05_RequiereReposicion.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
   // { nombre: 'PR06_Cantidad_a_Reponer.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    
    { nombre: 'PR07_SKU_MOQ.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'Ejecuta_PlanPorNivel.js', parametros: `${DBName} ${DBUser} ${passadminDeCripta}` },
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
>>>>>>> origin/test
    } catch (error) {
      const now_error = moment().format('YYYY-MM-DD HH:mm:ss');
      writeToLog(`${now_error} - Error al ejecutar el archivo ${archivo.nombre}: ${error}`);
    }
  }

<<<<<<< HEAD
  const now_fin = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\n\n`);
  writeToLog(`Terminan el Proceso del Calculo de Plan de Reposicion: ${now_fin}\n`);
=======
  const globalEnd = moment();
  const totalDuration = moment.duration(globalEnd.diff(globalStart));
  const totalStr = `${totalDuration.hours()}h ${totalDuration.minutes()}m ${totalDuration.seconds()}s`;

  writeToLog(`\nFinaliza ejecución total: ${globalEnd.format('YYYY-MM-DD HH:mm:ss')} | Tiempo total: ${totalStr}\n`);
>>>>>>> origin/test
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

<<<<<<< HEAD

// Obtener el valor desencriptado de passadmin
=======
>>>>>>> origin/test
async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}

<<<<<<< HEAD

IniciaejecutarArchivos();
=======
IniciaejecutarArchivos();

>>>>>>> origin/test
