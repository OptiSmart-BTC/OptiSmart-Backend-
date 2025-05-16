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

const logFileName = 'ClasABCD_PolInvent_Sem';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;


//const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);





//------------------------------------------------

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
    { nombre: 'CS00_limpiaTablasProcesos.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS01_Actualiza_HistDMD_Week_Year.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS02_Calcula_FechasHorizontes.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS03_AgrupaHistDMD_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS04_Calcula_Demanda_Costo_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS05_Calcula_Demanda_Porcentaje.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS06_OrdenaDemanda.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS06.1_Obtiene_SKU_Fuera_de_Rango.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS07_CalculaDemanda_Acumulada.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS08_CalculaClasificacionDMD.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS09_CalculaDemanda_ABCD_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS09.1_Actualiza_Datos_SKU.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS10_CalculaErrorCuadrado_HistDMD.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS11_Calcula_Variabilidad_Demanda_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS12_Calcula_DS_Demanda.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS13_Calcula_Coeficiente_Variabilidad_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS14_Calcula_Clasificacion_Variabilidad.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS15_Calcula_Margen_Unitario.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS16_Calcula_Calificacion_Margen.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS17.0_Calcula_Override_SI_NO.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS17.1_Calcula_Clasificación_ABCD_v3.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS18_Formatea_TablaUI.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'CS19_Inserta_LastUpdate.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS00_limpia_politica_inv.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS01_Calcula_ValorZ.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS02_Calcula_Campos_Iniciales_v3.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS02.1_Actualiza_Datos_SKU.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS03_Calcula_Demanda_Promedio_Semanal.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS04_CalculaErrorCuadrado_HistDMD.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS05_Calcula_Variabilidad_Demanda_Cantidad_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS06_Calcula_Nivel_Servicio.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS07_Calcula_CamposSKU_v3.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS08_Calcula_Prom_LT.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS09_Calcula_DS_LT.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS09.1_Calcula_Stat_SS.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS10_Calcula_SS_Cantidad_v4.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS10.1_Calcula_Override_SI_NO.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS11_Calcula_Demanda_LT.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS12_Calcula_ROQ.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS13_Calcula_ROP_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS14_Calcula_META.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS15_Calcula_Inventario_Promedio.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS16_Formatea_TablaUI.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS17_Calcula_Dias_Cobertura.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS17.1_Calcula_VidaUtilDias_ROPAlto_SobreinventarioDias.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS18_Calcula_Pallets.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS19_Calcula_Costo.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS19.1_Calcula_UOM.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS20_Formatea_TablasUI_Costos.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    { nombre: 'PS21_UneTablas.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
  ];

  writeToLog(`Proceso de Clasificacion ABCD por Semana\n`);
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
  writeToLog(`Terminan el Proceso de Clasificacion ABCD por Semana: ${now_fin}\n`);
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
