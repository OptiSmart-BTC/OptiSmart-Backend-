const { exec } = require("child_process");
const fs = require("fs");
const moment = require("moment");
const { decryptData } = require("./DeCriptaPassAppDb");
const { MongoClient } = require("mongodb");
const { host, puerto, passadmin } = require("../Configuraciones/ConexionDB");

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

const logFileName = "ClasABCD_PolInvent";
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;

if (fs.existsSync(logFile)) {
  const timestamp = moment().format("YYYYMMDD_HHmmss");
  const renamedLogFile = `../../${parametroFolder}/log/Log_historico/${logFileName}_${timestamp}.log`;
  if (!fs.existsSync(logFolder)) fs.mkdirSync(logFolder);
  fs.renameSync(logFile, `${renamedLogFile}`);
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

  skuIgnorados = todosSKU.filter(
    (sku) => sku.Ignorar === 1 || sku.Ignorar === "1"
  );
  const skuPermitidos = todosSKU.filter(
    (sku) => !(sku.Ignorar === 1 || sku.Ignorar === "1")
  );

  console.log("SKUs ignorados:", skuIgnorados.length);
  console.log("SKUs permitidos:", skuPermitidos.length);

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
  }

  const totalFinal = await skuCollection.countDocuments();
  console.log("SKUs en colección 'sku' al final del filtro:", totalFinal);

  await client.close();
}

async function IniciaejecutarArchivos() {
  const passadminDeCripta = await getDecryptedPassadmin();
  await filtraSKU(passadminDeCripta);

  const archivos = [
    {
      nombre: "C00_limpiaTablasProcesos_v2.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C01_Calcula_Demanda_Costo_v2.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C02_Calcula_Demanda_Porcentaje_v2.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C03_OrdenaDemanda_v2.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C03.1_Obtiene_SKU_Fuera_de_Rango.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C04_CalculaDemanda_Acumulada.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C05_CalculaClasificacionDMD_v2.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C06_CalculaDemanda_ABCD.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C06.1_Actualiza_Datos_SKU.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C07_CalculaErrorCuadrado_HistDMD_v2.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C08_Calcula_Variabilidad_Demanda_v3.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C09_Calcula_DS_Demanda.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C10_Calcula_Coeficiente_Variabilidad_v2.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C11_Calcula_Clasificacion_Variabilidad.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C12_Calcula_Margen_Unitario.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C13_Calcula_Calificacion_Margen.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C14.0_Calcula_Override_SI_NO.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C14.1_Calcula_Clasificación_ABCD_v3.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C15_Formatea_TablaUI.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "C16_Inserta_LastUpdate.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P00_limpia_politica_inv_v2.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P01_Calcula_ValorZ.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P02_Calcula_Campos_Iniciales_v3.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P02.1_Actualiza_Datos_SKU.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P03_Calcula_Demanda_Promedio_Diaria.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P04_CalculaErrorCuadrado_HistDMD.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P05_Calcula_Variabilidad_Demanda_Cantidad.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P06_Calcula_Nivel_Servicio.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P07_Calcula_CamposSKU_v3.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P08_Calcula_Prom_LT.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P09_Calcula_DS_LT.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P09.1_Calcula_Stat_SS.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P10_Calcula_SS_Cantidad_v4.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P10.1_Calcula_Override_SI_NO.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P11_Calcula_Demanda_LT.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P12_Calcula_ROQ.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P13_Calcula_ROP_v2.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P14_Calcula_META.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P15_Calcula_Inventario_Promedio.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P16_Formatea_TablaUI.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P17_Calcula_Dias_Cobertura_v2.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P17.1_Calcula_VidaUtilDias_ROPAlto_SobreinventarioDias.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P18_Calcula_Pallets.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P19_Calcula_Costo.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P19.1_Calcula_UOM.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P20_Formatea_TablasUI_Costos.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P21_UneTablas.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
  ];

  writeToLog(`Proceso de Clasificacion ABCD\n`);
  writeToLog(
    `Inicio de ejecucion: ${moment().format("YYYY-MM-DD HH:mm:ss")}\n`
  );

  for (const archivo of archivos) {
    console.log(`${archivo.nombre}`);
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
    }
  }

  const now_fin = moment().format("YYYY-MM-DD HH:mm:ss");
  writeToLog(`\n\n`);
  writeToLog(`Terminan el Proceso de Clasificacion ABCD: ${now_fin}\n`);

  await reintegraIgnorados();
}

async function reintegraIgnorados() {
  const passadminDeCripta = await getDecryptedPassadmin();
  const uri = `mongodb://${encodeURIComponent(DBUser)}:${encodeURIComponent(
    passadminDeCripta
  )}@${host}:${puerto}/?authSource=admin`;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const esMontecarlo = parametroUsuario.toLowerCase().includes("montecarlo");

  const colecciones = esMontecarlo
    ? [
        "ui_all_pol_inv_montecarlo",
        "politicas_inventario_montecarlo",
        "ui_pol_inv_costo_montecarlo",
        "ui_pol_inv_dias_cobertura_montecarlo",
        "ui_pol_inv_pallets",
        "ui_pol_inv_uom",
        "ui_politica_inventarios_montecarlo",
      ]
    : [
        "ui_all_pol_inv",
        "politicas_inventario_01",
        "ui_pol_inv_costo",
        "ui_pol_inv_dias_cobertura",
        "ui_pol_inv_pallets",
        "ui_pol_inv_uom",
        "ui_politica_inventarios",
      ];

  for (const nombreCol of colecciones) {
    const col = db.collection(nombreCol);
    const actuales = await col.find().toArray();
    const camposBase = actuales.length > 0 ? Object.keys(actuales[0]) : [];
    const ejemploReferencia = actuales[0] || {};

    const nuevos = skuIgnorados.map((sku) => {
      const nuevo = {};
      for (const campo of camposBase) {
        if (sku.hasOwnProperty(campo)) {
          nuevo[campo] = sku[campo];
        } else {
          const valorEjemplo = ejemploReferencia[campo];
          nuevo[campo] = typeof valorEjemplo === "number" ? 0 : "NA";
        }
      }
      return nuevo;
    });

    if (nuevos.length > 0) {
      await col.insertMany(nuevos);
      console.log(`Reintegrados ${nuevos.length} SKU a ${nombreCol}`);
    }
  }

  // Reinsertar en colección SKU
  const skuCollection = db.collection("sku");
  if (skuIgnorados.length > 0) {
    const reformateados = skuIgnorados.map((sku) => {
      const { _id, ...resto } = sku;
      return { ...resto, Ignorar: 1 };
    });

    await skuCollection.insertMany(reformateados);
    console.log(
      `Reintegrados ${reformateados.length} SKU a colección 'sku' sin conflictos de _id`
    );
  }

  await client.close();
}

function ejecutarComando(comando) {
  return new Promise((resolve, reject) => {
    exec(comando, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve();
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

if (require.main === module) {
  (async () => {
    const pass = await getDecryptedPassadmin();
    await filtraSKU(pass);
    console.log("Test completo.");
  })();
}

IniciaejecutarArchivos();
