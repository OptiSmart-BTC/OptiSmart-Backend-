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

const logFileName = 'PlanReposicion_Sem';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;


//const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);



//--------------------------------------------------------------
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
    { nombre: 'PR00_limpia_PlanRep.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR01_PlanRep_InvDispo.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PR1.1_Actualiza_Datos_SKU.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
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

  writeToLog(`Proceso del Calculo de Plan de Reposicion Semanal\n`);
  writeToLog(`Inicio de ejecucion: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n`);

  for (const archivo of archivos) {
    const inicio = moment();
    const comando = `node ${archivo.nombre} ${archivo.parametros}`;
    console.log(`${archivo.nombre}`);
  
    writeToLog(`\n------------------------------`);
    writeToLog(`Inicio de ${archivo.nombre}: ${inicio.format('YYYY-MM-DD HH:mm:ss')}`);
  
    try {
      await ejecutarComando(comando);
      const fin = moment();
      const duracion = moment.duration(fin.diff(inicio)).asSeconds().toFixed(2);
      writeToLog(`Fin de ${archivo.nombre}: ${fin.format('YYYY-MM-DD HH:mm:ss')}`);
      writeToLog(`Duración: ${duracion} segundos`);
    } catch (error) {
      const fin = moment();
      const duracion = moment.duration(fin.diff(inicio)).asSeconds().toFixed(2);
      writeToLog(`Error en ${archivo.nombre} tras ${duracion} segundos: ${error}`);
    }
  }
  

  const now_fin = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\n\n`);
  writeToLog(`Terminan el Proceso del Calculo de Plan de Reposicion Semanal: ${now_fin}\n`);
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
