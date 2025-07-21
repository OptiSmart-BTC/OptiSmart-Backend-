const { exec } = require('child_process');
const fs = require('fs');
const moment = require('moment');
const { decryptData } = require('./DeCriptaPassAppDb');

const tipo = process.argv[2]; // 'modificar' o 'restaurar'
const usuario = process.argv[3]; // ej. 'PBI'
const idPolitica = process.argv[4]; // ID de ubis_saved
const comentario = process.argv[5] || 'Sin comentario';

// Función para retornar respuesta JSON
function respuestaJSON(success, message, data = null, error = null) {
  const response = {
    success: success,
    message: message,
    timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
    data: data,
    error: error
  };
  console.log(JSON.stringify(response));
  return response;
}

// Validar parámetros requeridos
if (!tipo || !usuario) {
  respuestaJSON(false, 'Parámetros requeridos: tipo y usuario', null, 'Faltan parámetros obligatorios');
  process.exit(1);
}

// Validar tipo de operación
if (tipo !== 'modificar' && tipo !== 'restaurar') {
  respuestaJSON(false, 'Tipo de operación no válido', null, `Tipo "${tipo}" no válido. Usa "modificar" o "restaurar"`);
  process.exit(1);
}

// Validar ID de política para restaurar
if (tipo === 'restaurar' && !idPolitica) {
  respuestaJSON(false, 'ID de política requerido para restaurar', null, 'Falta el ID de la política a restaurar');
  process.exit(1);
}

let GB_DBName, DBUser, DBPassword, DBName;

try {
  ({ GB_DBName } = require(`../Configuraciones/dbUsers/${usuario}.dbnamevar.js`));
  const parametroFolder = GB_DBName.toUpperCase();
  ({ DBUser, DBPassword, DBName } = require(`../../${parametroFolder}/cfg/dbvars`));
} catch (error) {
  respuestaJSON(false, 'Error al cargar configuración de base de datos', null, error.message);
  process.exit(1);
}

const dbName = `btc_opti_${DBName}`;
const parametroFolder = GB_DBName.toUpperCase();
const logFileName = 'Uso_PoliticaGuardada';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;

// Crear carpeta de logs si no existe
if (!fs.existsSync(`../../${parametroFolder}/log`)) {
  fs.mkdirSync(`../../${parametroFolder}/log`, { recursive: true });
}

if (fs.existsSync(logFile)) {
  const timestamp = moment().format('YYYYMMDD_HHmmss');
  const renamedLogFile = `../../${parametroFolder}/log/Log_historico/${logFileName}_${timestamp}.log`;
  if (!fs.existsSync(logFolder)) fs.mkdirSync(logFolder, { recursive: true });
  fs.renameSync(logFile, renamedLogFile);
}

async function iniciarEjecucion() {
  let passadminDeCripta;
  
  try {
    passadminDeCripta = await getDecryptedPassadmin();
  } catch (error) {
    respuestaJSON(false, 'Error al desencriptar contraseña', null, error.message);
    process.exit(1);
  }

  let archivos = [];

  if (tipo === "modificar") {
    archivos = [
      { nombre: '01_comparar_skus_con_politica.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta} ${idPolitica} ${usuario}` },
      { nombre: '02_filtrar_politica_por_skus.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta} ${idPolitica} ${usuario}` },
      { nombre: '03_reemplazar_politica.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta} ${usuario}` },
      { nombre: '04_guardar_nueva_version.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta} ${usuario} "${comentario}"` }
    ];
  } else if (tipo === "restaurar") {
    archivos = [
      { nombre: '01_restaurar_politica_completa.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta} ${idPolitica} ${usuario} "${comentario}"` }
    ];
  }

  writeToLog(`\nProceso de Uso de Política Guardada (${tipo})`);
  writeToLog(`Inicio: ${moment().format('YYYY-MM-DD HH:mm:ss')}`);

  const resultados = [];
  let procesoExitoso = true;

  for (const archivo of archivos) {
    const inicio = moment();
    const comando = `node ${archivo.nombre} ${archivo.parametros}`;
    
    writeToLog(`\n------------------------------`);
    writeToLog(`Inicio de ${archivo.nombre}: ${inicio.format('YYYY-MM-DD HH:mm:ss')}`);

    try {
      await ejecutarComando(comando);
      const fin = moment();
      const duracion = moment.duration(fin.diff(inicio)).asSeconds().toFixed(2);
      writeToLog(`Fin de ${archivo.nombre}: ${fin.format('YYYY-MM-DD HH:mm:ss')}`);
      writeToLog(`Duración: ${duracion} segundos`);
      
      resultados.push({
        archivo: archivo.nombre,
        estado: 'exitoso',
        duracion: duracion
      });
    } catch (error) {
      const fin = moment();
      const duracion = moment.duration(fin.diff(inicio)).asSeconds().toFixed(2);
      writeToLog(`Error en ${archivo.nombre} tras ${duracion} segundos: ${error}`);
      
      resultados.push({
        archivo: archivo.nombre,
        estado: 'error',
        duracion: duracion,
        error: error.message
      });
      
      procesoExitoso = false;
    }
  }

  const nowFin = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nFinalización del proceso: ${nowFin}\n`);

  // Retornar respuesta JSON
  if (procesoExitoso) {
    respuestaJSON(true, `Proceso ${tipo} completado exitosamente`, {
      tipo: tipo,
      usuario: usuario,
      idPolitica: idPolitica,
      comentario: comentario,
      archivos_ejecutados: resultados.length,
      resultados: resultados
    });
  } else {
    respuestaJSON(false, `Proceso ${tipo} completado con errores`, {
      tipo: tipo,
      usuario: usuario,
      idPolitica: idPolitica,
      comentario: comentario,
      archivos_ejecutados: resultados.length,
      resultados: resultados
    }, 'Uno o más archivos fallaron durante la ejecución');
  }
}

function ejecutarComando(comando) {
  return new Promise((resolve, reject) => {
    exec(comando, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
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

// Ejecutar el proceso
iniciarEjecucion().catch(error => {
  respuestaJSON(false, 'Error fatal en la ejecución', null, error.message);
  process.exit(1);
});