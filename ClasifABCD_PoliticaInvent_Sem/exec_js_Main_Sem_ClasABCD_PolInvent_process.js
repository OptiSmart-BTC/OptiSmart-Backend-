const { exec } = require("child_process");
const fs = require("fs");
const moment = require("moment");
const { decryptData } = require("./DeCriptaPassAppDb");

const parametroUsuario = process.argv.slice(2)[0];

const {
  GB_DBName,
} = require(`../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`);
const parametroFolder = GB_DBName.toUpperCase();

//const { AppUser, AppPassword, Tipo} = require(`../../${parametroFolder}/cfg/${parametroUsuario}.uservars`);
const {
  DBUser,
  DBPassword,
  DBName,
} = require(`../../${parametroFolder}/cfg/dbvars`);
const dbName = `btc_opti_${DBName}`;

//const parametroFolder = parametroUsuario.toUpperCase();
//const dbName = `btc_opti_${parametroUsuario}`;

const logFileName = "ClasABCD_PolInvent_Sem";
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/log/Log_historico`;

//const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);

//------------------------------------------------

// Verificar si el archivo de log ya existe
if (fs.existsSync(logFile)) {
  const timestamp = moment().format("YYYYMMDD_HHmmss");
  const renamedLogFile = `../../${parametroFolder}/log/Log_historico/${logFileName}_${timestamp}.log`;

  // Crear el folder Log_historico si no existe
  if (!fs.existsSync(logFolder)) {
    fs.mkdirSync(logFolder);
  }

  // Mover el archivo existente a Log_historico
  fs.renameSync(logFile, `${renamedLogFile}`);
}

const { MongoClient } = require("mongodb");
const { host, puerto, passadmin } = require("../Configuraciones/ConexionDB");

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
    if (skuPermitidos.length > 0) {
      await skuCollection.insertMany(skuPermitidos);
    }
  } catch (err) {
    console.error("Error al borrar/insertar SKU:", err);
  }

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

  // Construir llaves SKU correctas
  const ignoredSkuKeys = skuIgnorados.map(
    (s) => `${s.Producto}@${s.Ubicacion}`
  );

  // 📌 Tablas donde deben aparecer los ignorados
  const tablasObjetivo = [
    nombreTablaFinal, // ui_sem_all_pol_inv o ui_sem_all_pol_inv_montecarlo
    "ui_demanda_abcd",
  ];

  for (const tabla of tablasObjetivo) {
    const col = db.collection(tabla);

    // 🔥 1. BORRAR LOS SKUs IGNORADOS EXISTENTES
    await col.deleteMany({ SKU: { $in: ignoredSkuKeys } });

    // 🔧 2. INSERTAR placeholders limpios
    const docs = skuIgnorados.map((sku) => {
      const key = `${sku.Producto}@${sku.Ubicacion}`;
      const snap = snapCSBySKU.get(key) || {};
      const clas = snap.Clasificacion_ABCD || "SIN DEMANDA";
      const snapDem = snapDemBySKU.get(key) || {};

      return {
        SKU: key,
        Producto: sku.Producto,
        Ubicacion: sku.Ubicacion,
        Desc_Producto: sku.Desc_Producto || snap.Desc_Producto || "NA",
        Familia_Producto: sku.Familia_Producto || snap.Familia_Producto || "NA",
        Categoria: sku.Categoria || snap.Categoria || "NA",
        Presentacion: sku.Presentacion || snap.Presentacion || "NA",
        Desc_Ubicacion: sku.Desc_Ubicacion || snap.Desc_Ubicacion || "NA",
        Clasificacion: clas,
        Nivel_Servicio: 0,
        Valor_Z: 0,
        UOM: "DEFAULT",
        UOM_Base: sku.Presentacion || snap.Presentacion || "NA",
        Unidades_Empaque: 0,
        Demanda_Promedio_Semanal: sku.Demanda_Promedio_Semanal || 0,
        Lead_Time_Abasto: 0,
        Variabilidad_Demanda_Cantidad: 0,
        DS_Demanda: 0,
        Fill_Rate: 0,
        Frecuencia_Revision_dias: 0,
        Prom_LT: 0,
        DS_LT: 0,
        Override_SI_NO: "NO",
        Override_Min_Politica_Inventarios: null,
        Override_Max_Politica_Inventarios: null,
        SS_Cantidad: 0,
        Demanda_LT: 0,
        MOQ: 0,
        ROQ: 0,
        ROP: 0,
        META: 0,
        Inventario_Promedio: 0,
        Medida_Override: "NA",
        Tipo_Override: "NA",
        STAT_SS: 0,
        Override_SS_Cantidad: 0,
        Override_SS_Cantidad: 0,
        DC_SS: 0,
        DC_Demanda_LT: 0,
        DC_MOQ: 0,
        DC_ROQ: 0,
        DC_ROP: 0,
        DC_META: 0,
        DC_Inventario_Promedio: 0,
        DC_Vida_Util_Dias: 0,
        DC_Tolerancia_Vida_Util_Dias: 0,
        DC_ROP_Alto: 0,
        DC_SobreInventario_Dias: 0,
        P_SS: 0,
        P_Demanda_LT: 0,
        P_MOQ: 0,
        P_ROQ: 0,
        P_ROP: 0,
        P_META: 0,
        P_Inventario_Promedio: 0,
        C_SS: 0,
        C_Demanda_LT: 0,
        C_MOQ: 0,
        C_ROQ: 0,
        C_ROP: 0,
        C_META: 0,
        C_Inventario_Promedio: 0,
        U_SS: 0,
        U_Demanda_LT: 0,
        U_MOQ: 0,
        U_ROQ: 0,
        U_ROP: 0,
        U_META: 0,
        U_Inventario_Promedio: 0,
        Ignorado: "SI",
      };
    });

    if (docs.length > 0) {
      await col.insertMany(docs);
      console.log(`Reintegrados ${docs.length} SKUs a ${tabla}`);
    }
  }

  // ▶ Finalmente, reintegrar a colección SKU
  const skuCollection = db.collection("sku");

  // si quieres, esto puede quedarse siempre (no truena)
  await skuCollection.deleteMany({ Ignorar: 1 });

  const skuIgnDocs = skuIgnorados.map(({ _id, ...rest }) => ({
    ...rest,
    Ignorar: 1,
  }));

  if (skuIgnDocs.length > 0) {
    await skuCollection.insertMany(skuIgnDocs);
  }

  await client.close();
  console.log("Reintegración semanal completada sin duplicados.");
}

async function cargaSKUIgnorados(passadminDeCripta) {
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

  await client.close();
}

let snapCSBySKU = new Map();
let snapDemBySKU = new Map();

async function snapshotIgnoradosCS(passadminDeCripta) {
  const uri = `mongodb://${encodeURIComponent(DBUser)}:${encodeURIComponent(
    passadminDeCripta
  )}@${host}:${puerto}/?authSource=admin`;

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const ignoredSkuKeys = skuIgnorados.map(
    (s) => `${s.Producto}@${s.Ubicacion}`
  );

  // Preferimos la UI ya formateada por CS18
  const colUiDem = db.collection("demanda_abcd_01_sem");

  const uiDocs = await colUiDem
    .find({ SKU: { $in: ignoredSkuKeys } })
    .toArray();

  for (const d of uiDocs) {
    snapDemBySKU.set(String(d.SKU), d);

    snapCSBySKU.set(String(d.SKU), {
      Desc_Producto: d.Desc_Producto,
      Familia_Producto: d.Familia_Producto,
      Categoria: d.Categoria,
      Presentacion: d.Presentacion,
      Desc_Ubicacion: d.Desc_Ubicacion,
      Clasificacion:
        d.Clasificacion_ABCD || d.Clasificacion || d.Clasificacion_Demanda,
    });
  }

  console.log(
    `[Snapshot CS] Capturados ${uiDocs.length} ignorados desde ui_demanda_abcd`
  );
  await client.close();
}

async function IniciaejecutarArchivos() {
  const passadminDeCripta = await getDecryptedPassadmin();

  // 0) Cargar lista de ignorados SIN borrarlos todavía
  await cargaSKUIgnorados(passadminDeCripta);

  const archivosCS = [
    {
      nombre: "CS00_limpiaTablasProcesos.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    /*
    {
      nombre: "CS01_Actualiza_HistDMD_Week_Year.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    */
      {
      nombre: "CS01.V2_Actualiza_HistDMD_Week_Year.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    
    {
      nombre: "CS02_Calcula_FechasHorizontes.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    /*
    {
      nombre: "CS03_AgrupaHistDMD_v2.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    */
    {
      nombre: "CS03.V3_AgrupaHistDMD.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    /*
    {
      nombre: "CS04_Calcula_Demanda_Costo_v2.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    */
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
    //{ nombre: 'CS10_CalculaErrorCuadrado_HistDMD.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    //{ nombre: 'CS11_Calcula_Variabilidad_Demanda_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    //{ nombre: 'CS12_Calcula_DS_Demanda.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
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
  ];
  const archivosPS = [
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
    //{ nombre: 'PS04_CalculaErrorCuadrado_HistDMD.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    //{ nombre: 'PS05_Calcula_Variabilidad_Demanda_Cantidad_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
    /* 
    {
      nombre: "PS04.1_CalculaErrorCuadrado_Variabilidad_Demanda_Cantidad.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    */
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
    //{ nombre: 'PS09.2_Calcula_DS_LT_v2.js', parametros: `${dbName} ${DBUser} ${passadminDeCripta}` },
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
      nombre: "PS17_Calcula_Dias_Cobertura_v2.js",
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

  const resumeCSFrom = process.env.RESUME_CS_FROM;
  let archivosCSAEjecutar = archivosCS;
  if (resumeCSFrom) {
    const resumeIndex = archivosCS.findIndex(
      (archivo) => archivo.nombre === resumeCSFrom
    );
    if (resumeIndex === -1) {
      throw new Error(`RESUME_CS_FROM invalido: ${resumeCSFrom}`);
    }
    archivosCSAEjecutar = archivosCS.slice(resumeIndex);
    writeToLog(`Reanudando CS desde: ${resumeCSFrom}`);
  }

  // --- correr CS ---
  for (const archivo of archivosCSAEjecutar) {
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
      writeToLog(
        `Fin de ${archivo.nombre}: ${fin.format("YYYY-MM-DD HH:mm:ss")}`
      );
      writeToLog(
        `Duración: ${moment
          .duration(fin.diff(inicio))
          .asSeconds()
          .toFixed(2)} segundos`
      );
    } catch (error) {
      const fin = moment();
      writeToLog(
        `Error en ${archivo.nombre} tras ${moment
          .duration(fin.diff(inicio))
          .asSeconds()
          .toFixed(2)} segundos: ${error}`
      );
      // si CS falla, normalmente conviene cortar aquí
      throw error;
    }
  }

  // 3) Snapshot de lo calculado por CS para ignorados (ABCD, desc, etc.)
  await snapshotIgnoradosCS(passadminDeCripta);

  // 4) Ahora sí filtrar SKUs para que PS corra solo con permitidos
  await filtraSKU(passadminDeCripta);

  // --- correr PS ---
  for (const archivo of archivosPS) {
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
      writeToLog(
        `Fin de ${archivo.nombre}: ${fin.format("YYYY-MM-DD HH:mm:ss")}`
      );
      writeToLog(
        `Duración: ${moment
          .duration(fin.diff(inicio))
          .asSeconds()
          .toFixed(2)} segundos`
      );
    } catch (error) {
      const fin = moment();
      writeToLog(
        `Error en ${archivo.nombre} tras ${moment
          .duration(fin.diff(inicio))
          .asSeconds()
          .toFixed(2)} segundos: ${error}`
      );
      throw error;
    }
  }

  // 5) Reintegrar ignorados (ya con snapshot) a la tabla final semanal
  const nombreFinal = parametroUsuario.toLowerCase().includes("montecarlo")
    ? "ui_all_pol_inv_montecarlo_sem"
    : "ui_all_pol_inv_sem";

  await reintegraIgnorados(nombreFinal);

  const now_fin = moment().format("YYYY-MM-DD HH:mm:ss");
  writeToLog(
    `\nTerminan el Proceso de Clasificacion ABCD por Semana: ${now_fin}\n`
  );
}

function ejecutarComando(comando) {
  return new Promise((resolve, reject) => {
    exec(comando, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
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

// Obtener el valor desencriptado de passadmin
async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error("Error al desencriptar el passadmin:", error);
    throw error;
  }
}

IniciaejecutarArchivos();
