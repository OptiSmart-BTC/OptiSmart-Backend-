const { exec } = require('child_process');
const fs = require('fs');
const moment = require('moment');
const { MongoClient } = require('mongodb');
const { decryptData } = require('./DeCriptaPassAppDb');
const conex = require('../Configuraciones/ConStrDB');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const parametroUsuario = process.argv.slice(2)[0];
const { GB_DBName } = require(`../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`);
const parametroFolder = GB_DBName.toUpperCase();
const { DBUser, DBPassword, DBName } = require(`../../${parametroFolder}/cfg/dbvars`);
const dbName = `btc_opti_${DBName}`;

const logFileName = 'Incremental_Only_Sem';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;

if (!fs.existsSync(`../../${parametroFolder}/log`)) {
  fs.mkdirSync(`../../${parametroFolder}/log`, { recursive: true });
}

function writeToLog(message) {
  fs.appendFileSync(logFile, `[${moment().format('YYYY-MM-DD HH:mm:ss')}] ${message}\n`);
}

async function ejecutarComando(comando) {
  return new Promise((resolve, reject) => {
    exec(comando, (error, stdout, stderr) => {
      if (error) {
        writeToLog(` Error ejecutando comando: ${comando}`);
        writeToLog(`STDERR: ${stderr}`);
        writeToLog(`STDOUT: ${stdout}`);
        return reject(error);
      } else {
        writeToLog(` Comando ejecutado correctamente: ${comando}`);
        writeToLog(`STDOUT: ${stdout}`);
        resolve();
      }
    });
  });
}

async function ejecutarArchivo(nombre, parametros) {
  const inicio = moment();
  const comando = `node ${nombre} ${parametros}`;
  writeToLog(`\n Inicio de ${nombre}`);
  try {
    await ejecutarComando(comando);
    const duracion = moment.duration(moment().diff(inicio)).asSeconds().toFixed(2);
    writeToLog(` Fin de ${nombre} - Duración: ${duracion} segundos`);
  } catch (err) {
    writeToLog(` Error en ${nombre}: ${err.message || err}`);
    throw err;
  }
}

async function ejecutarIncrementalSolo() {
  try {
    const passadminDeCripta = await decryptData(DBPassword);
    const parametros = `${dbName} ${DBUser} ${passadminDeCripta}`;

    // Paso 1: Ejecutar P23
    await ejecutarArchivo('P23_Identifica_Cambios_Ubicaciones_Sem.js', parametros);

    // Paso 2: Verificar si hay cambios
    const mongoUri = conex.getUrl(DBUser, passadminDeCripta, host, puerto, dbName);
    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = client.db(dbName);
    const cambios = await db.collection('cambios_ubicaciones_temp_Sem').find({}).toArray();
    await client.close();

    if (cambios.length > 0) {
      writeToLog(`\n Cambios detectados (${cambios.length} ubicaciones). Ejecutando P24...`);
      await ejecutarArchivo('P24_Procesa_Cambios_Incrementales_Sem.js', parametros);
    } else {
      writeToLog(`\n No se detectaron cambios. No se ejecuta P24.`);
    }

    writeToLog(` Proceso incremental terminado correctamente.\n`);
  } catch (error) {
    writeToLog(` Error en ejecutarIncrementalSolo: ${error.message || JSON.stringify(error)}`);
    throw error;
  }
}

// Ejecución principal
ejecutarIncrementalSolo()
  .catch(err => {
    writeToLog(` Proceso fallido: ${err?.message || JSON.stringify(err)}`);
    console.error(err);
    process.exit(1);
  });
