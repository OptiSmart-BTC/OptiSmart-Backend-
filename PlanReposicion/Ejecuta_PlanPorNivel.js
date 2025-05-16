const { exec } = require('child_process');
const fs = require('fs');
const moment = require('moment');
const { decryptData } = require('./DeCriptaPassAppDb');

const parametroUsuario = process.argv[2];
const { GB_DBName } = require(`../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`);
const parametroFolder = GB_DBName.toUpperCase();
const { DBUser, DBPassword, DBName } = require(`../../${parametroFolder}/cfg/dbvars`);
const dbName = `btc_opti_${DBName}`;

const logFile = `../../${parametroFolder}/log/PlanReposicion.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;

if (fs.existsSync(logFile)) {
  const timestamp = moment().format('YYYYMMDD_HHmmss');
  const renamedLogFile = `../../${parametroFolder}/log/Log_historico/PlanReposicion_${timestamp}.log`;
  if (!fs.existsSync(logFolder)) {
    fs.mkdirSync(logFolder);
  }
  fs.renameSync(logFile, renamedLogFile);
}

async function ejecutarPlanPorNivel() {
  const passadminDeCripta = await getDecryptedPassadmin();

  const nivelesCalculoDirecto = [0, 1];
  const nivelesDemandaIndirecta = [2, 3];

  writeToLog(`\nProceso de Ejecución de Plan de Reposición por Nivel`);
  writeToLog(`Inicio de ejecución: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n`);

  // 🟢 Paso 0: Copiar Nivel_OA y Origen_Abasto antes de TODO
  await ejecutarYLog(`node Copia_NivelOA.js ${dbName} ${DBUser} ${passadminDeCripta}`);

  // 🔵 Paso 1: Niveles 0 y 1 (cálculo directo)
  for (const nivel of nivelesCalculoDirecto) {
    writeToLog(`\n--- Ejecutando scripts de cálculo directo para Nivel ${nivel} ---`);
    const baseParams = `${dbName} ${DBUser} ${passadminDeCripta} ${nivel}`;
    const comandos = [
      `node PR05_RequiereReposicion.js ${baseParams}`,
      `node PR06_Cantidad_a_Reponer.js ${baseParams}`,
      `node PR08_Plan_Reposicion_Cantidad.js ${baseParams}`,
      
      //`node 'PR07_SKU_MOQ.js' ${baseParams}`,
      `node PR09_Plan_Reposicion_Pallets.js ${baseParams}`,
      `node PR09.1_Plan_Reposicion_Costo.js ${baseParams}`,
      `node PR09.2_SKU_Costo_Unidad.js ${baseParams}`
    ];

    for (const comando of comandos) {
      await ejecutarYLog(comando);
    }
  }

  // 🔶 Paso 2: Nivel 2 - Asegurarse de calcular la demanda indirecta DESPUÉS del nivel 1
  const nivel = 2;
  const baseParams = `${dbName} ${DBUser} ${passadminDeCripta} ${nivel}`;

  writeToLog(`\n--- Calculando Demanda Indirecta para Nivel ${nivel} ---`);
  await ejecutarYLog(`node Calculo_Demanda_Indirecta.js ${baseParams}`);

  writeToLog(`\n--- Ejecutando scripts para Nivel ${nivel} con Demanda Indirecta ---`);
  const comandosNivel2 = [
    `node PR05_RequiereReposicion.js ${baseParams}`,
    `node PR06_Cantidad_a_Reponer.js ${baseParams}`,
    //`node 'PR07_SKU_MOQ.js' ${baseParams}`,
    `node PR08_Plan_Reposicion_Cantidad.js ${baseParams}`,
    `node PR09_Plan_Reposicion_Pallets.js ${baseParams}`,
    `node PR09.1_Plan_Reposicion_Costo.js ${baseParams}`,
    `node PR09.2_SKU_Costo_Unidad.js ${baseParams}`
  ];

  for (const comando of comandosNivel2) {
    await ejecutarYLog(comando);
  }

  // 🔷 Paso 3: Nivel 3 (solo abastece)
  const nivel3 = 3;
  const baseParams3 = `${dbName} ${DBUser} ${passadminDeCripta} ${nivel3}`;

  writeToLog(`\n--- Calculando Demanda Indirecta para Nivel ${nivel3} ---`);
  await ejecutarYLog(`node Calculo_Demanda_Indirecta.js ${baseParams3}`);

  writeToLog(`\n--- Ejecutando scripts para Nivel ${nivel3} con Demanda Indirecta ---`);
  const comandosNivel3 = [
    `node PR05_RequiereReposicion.js ${baseParams3}`,
    `node PR06_Cantidad_a_Reponer.js ${baseParams3}`,
//`node 'PR07_SKU_MOQ.js' ${baseParams}`,
    `node PR08_Plan_Reposicion_Cantidad.js ${baseParams3}`,
    `node PR09_Plan_Reposicion_Pallets.js ${baseParams3}`,
    `node PR09.1_Plan_Reposicion_Costo.js ${baseParams3}`,
    `node PR09.2_SKU_Costo_Unidad.js ${baseParams3}`
  ];

  for (const comando of comandosNivel3) {
    await ejecutarYLog(comando);
  }

  writeToLog(`\n✅ Termina ejecución completa: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n`);
}

function ejecutarComando(comando) {
  return new Promise((resolve, reject) => {
    exec(comando, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function ejecutarYLog(comando) {
  try {
    writeToLog(`Inicia: ${comando} - ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
    await ejecutarComando(comando);
    writeToLog(`Finaliza: ${comando} - ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
  } catch (error) {
    writeToLog(`❌ ERROR ejecutando ${comando}: ${error.message}`);
  }
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

ejecutarPlanPorNivel();
