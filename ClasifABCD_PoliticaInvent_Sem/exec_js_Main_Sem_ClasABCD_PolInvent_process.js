const { exec } = require("child_process");
const fs = require("fs");
const moment = require("moment");
const { decryptData } = require("./DeCriptaPassAppDb");
const { MongoClient } = require("mongodb");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const parametroUsuario = process.argv.slice(2)[0];

const {
  GB_DBName,
} = require(`../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`);
const parametroFolder = GB_DBName.toUpperCase();

const {
  DBUser,
  DBPassword,
  DBName,
} = require(`../../${parametroFolder}/cfg/dbvars`);
const dbName = `btc_opti_${DBName}`;

const logFileName = "ClasABCD_PolInvent_Sem";
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;

if (fs.existsSync(logFile)) {
  const timestamp = moment().format("YYYYMMDD_HHmmss");
  const renamedLogFile = `../../${parametroFolder}/log/Log_historico/${logFileName}_${timestamp}.log`;
  if (!fs.existsSync(logFolder)) fs.mkdirSync(logFolder);
  fs.renameSync(logFile, renamedLogFile);
}

let skuIgnorados = [];

async function filtraSKU(passadminDeCripta) {
  const uri = `mongodb://${encodeURIComponent(DBUser)}:${encodeURIComponent(
    passadminDeCripta
  )}@${host}:${puerto}/?authSource=admin`;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const skuCollection = db.collection("sku");

  const todosSKU = await skuCollection.find().toArray();
  console.log("TOTAL SKU en base:", todosSKU.length);
  writeToLog(`TOTAL SKU en base: ${todosSKU.length}`);

  skuIgnorados = todosSKU.filter(
    (sku) => sku.Ignorar === 1 || sku.Ignorar === "1"
  );
  const skuPermitidos = todosSKU.filter(
    (sku) => !(sku.Ignorar === 1 || sku.Ignorar === "1")
  );

  console.log("SKUs ignorados:", skuIgnorados.length);
  console.log("SKUs permitidos:", skuPermitidos.length);
  writeToLog(`SKUs ignorados: ${skuIgnorados.length}`);
  writeToLog(`SKUs permitidos: ${skuPermitidos.length}`);

  try {
    await skuCollection.deleteMany({});
    console.log("Se eliminaron todos los SKU de la colección original.");
    if (skuPermitidos.length > 0) {
      await skuCollection.insertMany(skuPermitidos);
      console.log("Se insertaron los SKU permitidos.");
    } else {
      console.log("No hay SKU permitidos que insertar.");
    }
  } catch (err) {
    console.error("Error al borrar/insertar SKU:", err);
    writeToLog(`Error al borrar/insertar SKU: ${err}`);
  }

  const totalFinal = await skuCollection.countDocuments();
  console.log("SKUs en colección 'sku' al final del filtro:", totalFinal);
  writeToLog(`SKUs en colección 'sku' al final del filtro: ${totalFinal}`);

  await client.close();
}

async function reintegraIgnorados(nombreTablaFinal) {
  const passadminDeCripta = await getDecryptedPassadmin();
  const uri = `mongodb://${encodeURIComponent(DBUser)}:${encodeURIComponent(
    passadminDeCripta
  )}@${host}:${puerto}/?authSource=admin`;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  // 🔹 Reintegro a la tabla final semanal
  const tablaFinal = db.collection(nombreTablaFinal);
  const actuales = await tablaFinal.find().toArray();
  const camposBase = actuales.length > 0 ? Object.keys(actuales[0]) : [];
  const ejemploReferencia = actuales[0] || {};

  const nuevosRegistros = skuIgnorados.map((sku) => {
    const nuevo = {};
    for (const campo of camposBase) {
      if (sku.hasOwnProperty(campo)) {
        nuevo[campo] = sku[campo];
      } else {
        const valorEjemplo = ejemploReferencia[campo];
        // Usar null en vez de "NA" para mejor compatibilidad
        nuevo[campo] = typeof valorEjemplo === "number" ? 0 : null;
      }
    }
    return nuevo;
  });

  if (nuevosRegistros.length > 0) {
    await tablaFinal.insertMany(nuevosRegistros);
    console.log(
      `Reintegrados ${nuevosRegistros.length} SKU a ${nombreTablaFinal}`
    );
    writeToLog(
      `Reintegrados ${nuevosRegistros.length} SKU a ${nombreTablaFinal}`
    );
  }

  // 🔹 Reintegro adicional a ui_demanda_abcd
  const colDemanda = db.collection("ui_demanda_abcd");
  const actualesDemanda = await colDemanda.find().toArray();
  const camposDemanda =
    actualesDemanda.length > 0 ? Object.keys(actualesDemanda[0]) : [];
  const ejemploDemanda = actualesDemanda[0] || {};

  const nuevosDemanda = skuIgnorados.map((sku) => {
    const nuevo = {};
    for (const campo of camposDemanda) {
      if (sku.hasOwnProperty(campo)) {
        nuevo[campo] = sku[campo];
      } else {
        const valorEjemplo = ejemploDemanda[campo];
        nuevo[campo] = typeof valorEjemplo === "number" ? 0 : null;
      }
    }
    return nuevo;
  });

  if (nuevosDemanda.length > 0) {
    await colDemanda.insertMany(nuevosDemanda);
    console.log(`Reintegrados ${nuevosDemanda.length} SKU a ui_demanda_abcd`);
    writeToLog(`Reintegrados ${nuevosDemanda.length} SKU a ui_demanda_abcd`);
  }

  // 🔹 Reintegro de vuelta a 'sku' sin conflictos de _id
  const skuCollection = db.collection("sku");
  if (skuIgnorados.length > 0) {
    const ignoradosReformateados = skuIgnorados.map(({ _id, ...resto }) => ({
      ...resto,
      Ignorar: 1,
    }));
    await skuCollection.insertMany(ignoradosReformateados);
    console.log(
      `Reintegrados ${ignoradosReformateados.length} SKU a colección 'sku' sin conflictos de _id`
    );
    writeToLog(
      `Reintegrados ${ignoradosReformateados.length} SKU a colección 'sku' sin conflictos de _id`
    );
  }

  await client.close();
  console.log("Reintegración completa (incluyendo ui_demanda_abcd).");
  writeToLog("Reintegración completa (incluyendo ui_demanda_abcd).");
}

async function IniciaejecutarArchivos() {
  const passadminDeCripta = await getDecryptedPassadmin();
  await filtraSKU(passadminDeCripta);

  const archivos = [
    {
      nombre: "CS00_limpiaTablasProcesos.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    // Versión actualizada V2 preferida
    {
      nombre: "CS01.V2_Actualiza_HistDMD_Week_Year.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS02_Calcula_FechasHorizontes.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    // Versión actualizada V3 preferida
    {
      nombre: "CS03.V3_AgrupaHistDMD.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    // Versión actualizada V3 preferida
    {
      nombre: "CS04.V3_Calcula_Demanda_Costo.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS05_Calcula_Demanda_Porcentaje.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS06_OrdenaDemanda.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS06.1_Obtiene_SKU_Fuera_de_Rango.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS07_CalculaDemanda_Acumulada.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS08_CalculaClasificacionDMD.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS09_CalculaDemanda_ABCD_v2.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS09.1_Actualiza_Datos_SKU.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS12.1_Calcula_STDEV.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS13_Calcula_Coeficiente_Variabilidad_v2.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS14_Calcula_Clasificacion_Variabilidad.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS15_Calcula_Margen_Unitario.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS16_Calcula_Calificacion_Margen.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS17.0_Calcula_Override_SI_NO.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS17.1_Calcula_Clasificación_ABCD_v3.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS18_Formatea_TablaUI.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "CS19_Inserta_LastUpdate.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS00_limpia_politica_inv.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS01_Calcula_ValorZ.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS02_Calcula_Campos_Iniciales_v3.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS02.1_Actualiza_Datos_SKU.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS03_Calcula_Demanda_Promedio_Semanal.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS05.1_Calcula_DS.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS06_Calcula_Nivel_Servicio.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS07_Calcula_CamposSKU_v3.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS08_Calcula_Prom_LT.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS09_Calcula_DS_LT.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS09.1_Calcula_Stat_SS.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS10_Calcula_SS_Cantidad_v4.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS10.1_Calcula_Override_SI_NO.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS11_Calcula_Demanda_LT.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS12_Calcula_ROQ.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS13_Calcula_ROP_v2.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS14_Calcula_META.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS15_Calcula_Inventario_Promedio.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS16_Formatea_TablaUI.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS17_Calcula_Dias_Cobertura.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS17.1_Calcula_VidaUtilDias_ROPAlto_SobreinventarioDias.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS18_Calcula_Pallets.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS19_Calcula_Costo.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS19.1_Calcula_UOM.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS20_Formatea_TablasUI_Costos.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "PS21_UneTablas.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
  ];

  writeToLog(`Proceso de Clasificacion ABCD por Semana\n`);
  writeToLog(
    `Inicio de ejecucion: ${moment().format("YYYY-MM-DD HH:mm:ss")}\n`
  );

  for (const archivo of archivos) {
    const inicio = moment();
    const comando = `node ${archivo.nombre} ${archivo.parametros}`;
    console.log(`${archivo.nombre}`);

    writeToLog(`\n------------------------------`);
    writeToLog(
      `Inicio de ${archivo.nombre}: ${inicio.format("YYYY-MM-DD HH:mm:ss")}`
    );

    try {
      await ejecutarComando(comando);
      const fin = moment();
      const duracion = moment.duration(fin.diff(inicio)).asSeconds().toFixed(2);
      writeToLog(
        `Fin de ${archivo.nombre}: ${fin.format("YYYY-MM-DD HH:mm:ss")}`
      );
      writeToLog(`Duración: ${duracion} segundos`);
    } catch (error) {
      const fin = moment();
      const duracion = moment.duration(fin.diff(inicio)).asSeconds().toFixed(2);
      writeToLog(
        `Error en ${archivo.nombre} tras ${duracion} segundos: ${error}`
      );
      console.error(`Error en ${archivo.nombre}:`, error.message);
    }
  }

  const now_fin = moment().format("YYYY-MM-DD HH:mm:ss");
  writeToLog(`\n\n`);
  writeToLog(
    `Terminan el Proceso de Clasificacion ABCD por Semana: ${now_fin}\n`
  );

  const nombreFinal = parametroUsuario.toLowerCase().includes("montecarlo")
    ? "ui_sem_all_pol_inv_montecarlo"
    : "ui_sem_all_pol_inv";

  await reintegraIgnorados(nombreFinal);
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
  fs.appendFileSync(logFile, message + "\n");
}

async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error("Error al desencriptar el passadmin:", error);
    throw error;
  }
}

// Modularidad: permite importar sin ejecutar automáticamente
if (require.main === module) {
  IniciaejecutarArchivos();
}

module.exports = { IniciaejecutarArchivos, filtraSKU, reintegraIgnorados };