const { exec } = require("child_process");
const fs = require("fs");
const moment = require("moment");
const { decryptData } = require("./DeCriptaPassAppDb");
const { MongoClient } = require("mongodb");
const { host, puerto } = require("../Configuraciones/ConexionDB");

const parametroUsuario = process.argv.slice(2)[0];
const modoEjecucion = process.argv.slice(2)[1] || "completo";

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
  fs.renameSync(logFile, renamedLogFile);
}

let skuIgnorados = [];
let snapshotIgnorados = [];
let snapshotDemandaIgnorados = [];

async function snapshotDemandaABCD(passadminDeCripta, skuIgnorados) {
  if (!skuIgnorados || skuIgnorados.length === 0) return [];

  const uri = `mongodb://${encodeURIComponent(DBUser)}:${encodeURIComponent(
    passadminDeCripta
  )}@${host}:${puerto}/?authSource=admin`;

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const tabla = db.collection("demanda_abcd_01");

  const keys = skuIgnorados
    .map((s) => `${s.Producto}@${s.Ubicacion}`)
    .filter(Boolean);

  // ✅ robusto: algunas veces esa tabla guarda SKU, otras Producto/Ubicacion
  const data = await tabla
    .find({
      $or: [
        { SKU: { $in: keys } },
        { Codigo_SKU: { $in: keys } },
        { Item: { $in: keys } },
      ],
    })
    .toArray();

  await client.close();
  console.log(
    `Snapshot demanda_abcd_01 creado: ${data.length} SKUs ignorados con Demanda_ABCD.`
  );
  return data;
}

// 🔹 Snapshot robusto desde ui_politica_inventarios
async function snapshotClasificacion(passadminDeCripta, skuIgnorados) {
  if (!skuIgnorados || skuIgnorados.length === 0) return [];

  const uri = `mongodb://${encodeURIComponent(DBUser)}:${encodeURIComponent(
    passadminDeCripta
  )}@${host}:${puerto}/?authSource=admin`;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const tablaClasif = db.collection("ui_politica_inventarios");

  const listaProductos = skuIgnorados.map((s) => s.Producto).filter(Boolean);
  const listaCodigos = skuIgnorados
    .map((s) => s.Codigo_SKU || s.SKU || s.Item)
    .filter(Boolean);

  const data = await tablaClasif
    .find({
      $or: [
        { Producto: { $in: listaProductos } },
        { Codigo_SKU: { $in: listaCodigos } },
        { SKU: { $in: listaCodigos } },
        { Item: { $in: listaCodigos } },
      ],
    })
    .toArray();

  await client.close();
  console.log(
    `Snapshot de clasificación creado: ${data.length} SKUs ignorados con datos C.`
  );
  return data;
}

// 🔹 Filtro de SKUs ignorados
async function filtraSKU(passadminDeCripta) {
  const uri = `mongodb://${encodeURIComponent(DBUser)}:${encodeURIComponent(
    passadminDeCripta
  )}@${host}:${puerto}/?authSource=admin`;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const skuCollection = db.collection("sku");

  const todosSKU = await skuCollection.find().toArray();
  skuIgnorados = todosSKU.filter(
    (sku) => sku.Ignorar === 1 || sku.Ignorar === "1"
  );
  const skuPermitidos = todosSKU.filter(
    (sku) => !(sku.Ignorar === 1 || sku.Ignorar === "1")
  );

  await skuCollection.deleteMany({});
  if (skuPermitidos.length > 0) await skuCollection.insertMany(skuPermitidos);
  await client.close();

  console.log(
    "Filtrado de SKUs completado:",
    skuIgnorados.length,
    "ignorados."
  );
}

async function reintegraIgnorados(snapshotData = [], snapshotDemanda = []) {
  const passadminDeCripta = await getDecryptedPassadmin();
  const uri = `mongodb://${encodeURIComponent(DBUser)}:${encodeURIComponent(
    passadminDeCripta
  )}@${host}:${puerto}/?authSource=admin`;

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  // Construimos las llaves SKU correctas
  const ignoredSkuKeys = skuIgnorados.map(
    (sku) => `${sku.Producto}@${sku.Ubicacion}`
  );

  const colecciones = ["ui_all_pol_inv"];

  for (const nombreCol of colecciones) {
    const col = db.collection(nombreCol);

    // birrar los datos existentes de estos SKUs
    await col.deleteMany({ SKU: { $in: ignoredSkuKeys } });

    // insertar registros limpios
    const nuevos = skuIgnorados.map((sku) => {
      const key = `${sku.Producto}@${sku.Ubicacion}`;
      const snap =
        snapshotData.find(
          (s) => s.SKU === key || s.Producto === sku.Producto
        ) || {};
      const snapDem =
        snapshotDemanda.find(
          (d) => d.SKU === key || d.Codigo_SKU === key || d.Item === key
        ) || {};

      return {
        SKU: key,
        Producto: sku.Producto,
        Ubicacion: sku.Ubicacion,
        Desc_Producto: sku.Desc_Producto || snap.Desc_Producto || "NA",
        Familia_Producto: sku.Familia_Producto || snap.Familia_Producto || "NA",
        Categoria: sku.Categoria || snap.Categoria || "NA",
        Presentacion: sku.Presentacion || snap.Presentacion || "NA",
        Ubicacion: sku.Ubicacion || snap.Ubicacion || "NA",
        Desc_Ubicacion: sku.Desc_Ubicacion || snap.Desc_Ubicacion || "NA",
        Clasificacion:
          sku.Clasificacion_ABCD ||
          snap.Clasificacion_ABCD ||
          snapDem.Clasificacion_ABCD ||
          "NA",
        Nivel_Servicio: 0,
        Valor_Z: 0,
        UOM: "DEFAULT",
        UOM_Base: sku.Presentacion || snap.Presentacion || "NA",
        Unidades_Empaque: 0,
        Demanda_Promedio_Diaria: 0,
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

    if (nuevos.length > 0) {
      await col.insertMany(nuevos);
      console.log(`Reintegrados ${nuevos.length} SKU a ${nombreCol}`);
    }
  }

  // 🔁 Finalmente reintegramos tabla SKU original
  const skuCollection = db.collection("sku");
  await skuCollection.deleteMany({ Ignorar: 1 });
  await skuCollection.insertMany(
    skuIgnorados.map((s) => ({ ...s, Ignorar: 1 }))
  );

  await client.close();
  console.log("Reintegración final de ignorados completada sin duplicados.");
}

async function IniciaejecutarArchivos() {
  const passadminDeCripta = await getDecryptedPassadmin();

  // --- FASE 1: CLASIFICACIÓN ---
  const archivosClasificacion = [
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
      nombre: "C09.1_Calcula_Desviacion_estandar.js",
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
  ];

  // --- FASE 1.5: obtener SKUs ignorados antes del filtro ---
  const uri = `mongodb://${encodeURIComponent(DBUser)}:${encodeURIComponent(
    passadminDeCripta
  )}@${host}:${puerto}/?authSource=admin`;
  const clientTemp = new MongoClient(uri);
  await clientTemp.connect();
  const dbTemp = clientTemp.db(dbName);
  skuIgnorados = await dbTemp.collection("sku").find({ Ignorar: 1 }).toArray();
  await clientTemp.close();
  console.log(
    `Detectados ${skuIgnorados.length} SKUs ignorados para snapshot.`
  );
  writeToLog(`Detectados ${skuIgnorados.length} SKUs ignorados para snapshot.`);

  // --- SNAPSHOT ---
  snapshotIgnorados = await snapshotClasificacion(
    passadminDeCripta,
    skuIgnorados
  );

  snapshotDemandaIgnorados = await snapshotDemandaABCD(
    passadminDeCripta,
    skuIgnorados
  );

  // --- FASE 3: CLASIFICACIÓN ABCD ---
  writeToLog(`Proceso de Clasificacion ABCD y Politicas de Inventario\n`);
  writeToLog(
    `Inicio de ejecucion: ${moment().format("YYYY-MM-DD HH:mm:ss")}\n`
  );

  for (const archivo of archivosClasificacion) {
    await ejecutarArchivo(archivo, passadminDeCripta);
  }

  // Archivos de Políticas (modo completo)
  const archivosPoliticasCompleto = [
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
      nombre: "P05.1_Calcula_DS.js",
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

  // Proceso incremental (solo identificación y procesamiento de cambios)
  const procesosIncrementales = [
    {
      nombre: "P23_Identifica_Cambios_Ubicaciones.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
    {
      nombre: "P24_Procesa_Cambios_Incrementales.js",
      parametros: `${dbName} ${DBUser} ${passadminDeCripta}`,
    },
  ];

  console.log("Aplicando filtro de SKUs ignorados para políticas...");
  await filtraSKU(passadminDeCripta);

  // --- FASE 4: POLÍTICAS (según modo) ---
  if (modoEjecucion === "incremental") {
    writeToLog(`\nModo INCREMENTAL - Solo procesando cambios en ubicaciones`);
    console.log("Modo INCREMENTAL activado");

    let errorIncremental = false;
    for (const archivo of procesosIncrementales) {
      try {
        await ejecutarArchivo(archivo, passadminDeCripta);
      } catch (error) {
        errorIncremental = true;
        writeToLog(`Error en modo incremental, cambiando a modo completo...`);
        console.log("Error en modo incremental, cambiando a modo completo...");
        break;
      }
    }

    // Si hay error en incremental, ejecutar completo como fallback
    if (errorIncremental) {
      writeToLog(`Ejecutando proceso completo como fallback...`);
      for (const archivo of archivosPoliticasCompleto) {
        await ejecutarArchivo(archivo, passadminDeCripta);
      }
    }
  } else {
    writeToLog(`\nModo COMPLETO - Procesamiento completo de politicas`);
    console.log("Modo COMPLETO activado");
    for (const archivo of archivosPoliticasCompleto) {
      await ejecutarArchivo(archivo, passadminDeCripta);
    }
  }

  const now_fin = moment().format("YYYY-MM-DD HH:mm:ss");
  writeToLog(`\n\n`);
  writeToLog(
    `Termina el Proceso de Clasificacion ABCD y Politicas de Inventario: ${now_fin}\n`
  );

  // --- FASE 5: REINTEGRACIÓN FINAL ---
  await reintegraIgnorados(snapshotIgnorados, snapshotDemandaIgnorados);
}

// 🔹 Utilidades
async function ejecutarArchivo(archivo, passadminDeCripta) {
  const inicio = moment();
  const comando = `node ${archivo.nombre} ${archivo.parametros}`;
  console.log(`Ejecutando ${archivo.nombre}`);

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
  } catch (err) {
    const fin = moment();
    const duracion = moment.duration(fin.diff(inicio)).asSeconds().toFixed(2);
    writeToLog(
      `Error en ${archivo.nombre} tras ${duracion} segundos: ${err.message}`
    );
    console.error(`Error en ${archivo.nombre}:`, err.message);
    throw err;
  }
}

function ejecutarComando(comando) {
  return new Promise((resolve, reject) => {
    exec(comando, (error) => (error ? reject(error) : resolve()));
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

IniciaejecutarArchivos();
