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

//const parametroUsuario = process.argv.slice(2)[0];
//const parametroFolder = parametroUsuario.toUpperCase();
//const dbName = `btc_opti_${parametroUsuario}`;

const logFileName = 'ClasABCD_PolInvent';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;


//const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);






//----------------------------------------------------------------------

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
    { nombre: 'C00_limpiaTablasProcesos_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C01_Calcula_Demanda_Costo_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C02_Calcula_Demanda_Porcentaje_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C03_OrdenaDemanda_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C03.1_Obtiene_SKU_Fuera_de_Rango.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C04_CalculaDemanda_Acumulada.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C05_CalculaClasificacionDMD_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C06_CalculaDemanda_ABCD.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C06.1_Actualiza_Datos_SKU.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C07_CalculaErrorCuadrado_HistDMD_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C08_Calcula_Variabilidad_Demanda_v3.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C09_Calcula_DS_Demanda.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C10_Calcula_Coeficiente_Variabilidad_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C11_Calcula_Clasificacion_Variabilidad.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C12_Calcula_Margen_Unitario.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C13_Calcula_Calificacion_Margen.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C14.0_Calcula_Override_SI_NO.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C14.1_Calcula_Clasificación_ABCD_v3.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C15_Formatea_TablaUI.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'C16_Inserta_LastUpdate.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P00_limpia_politica_inv_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P01_Calcula_ValorZ.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P02_Calcula_Campos_Iniciales_v3.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P02.1_Actualiza_Datos_SKU.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P03_Calcula_Demanda_Promedio_Diaria.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P04_CalculaErrorCuadrado_HistDMD.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P05_Calcula_Variabilidad_Demanda_Cantidad.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P06_Calcula_Nivel_Servicio.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P07_Calcula_CamposSKU_v3.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P08_Calcula_Prom_LT.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P09_Calcula_DS_LT.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P09.1_Calcula_Stat_SS.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P10_Calcula_SS_Cantidad_v4.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P10.1_Calcula_Override_SI_NO.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P11_Calcula_Demanda_LT.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P12_Calcula_ROQ.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P13_Calcula_ROP_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P14_Calcula_META.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P15_Calcula_Inventario_Promedio.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P16_Formatea_TablaUI.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P17_Calcula_Dias_Cobertura_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P17.1_Calcula_VidaUtilDias_ROPAlto_SobreinventarioDias.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P18_Calcula_Pallets.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P19_Calcula_Costo.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P19.1_Calcula_UOM.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P20_Formatea_TablasUI_Costos.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'P21_UneTablas.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
  ];

  writeToLog(`Proceso de Clasificacion ABCD\n`);
  writeToLog(`Inicio de ejecucion: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n`);

  for (const archivo of archivos) {
    console.log(`${archivo.nombre}`);
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
  writeToLog(`Terminan el Proceso de Clasificacion ABCD: ${now_fin}\n`);
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
