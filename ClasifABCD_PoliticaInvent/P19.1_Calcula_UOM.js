const path = require('path');
const fs = require("fs");
const MongoClient = require("mongodb").MongoClient;
const conex = require("../Configuraciones/ConStrDB");
const moment = require("moment");

const { host, puerto } = require("../Configuraciones/ConexionDB");

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];
const collectionName = process.argv.slice(2)[3] || "politica_inventarios_01";

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`;
const now = moment().format("YYYY-MM-DD HH:mm:ss");

async function calcularUOM() {
  writeToLog(`\nPaso 19.1 - Transforamación de datos de salida a UOM`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const inventarios01Collection = db.collection(collectionName);
    const skuCollection = db.collection("sku");

    const joinResult = await inventarios01Collection
      .aggregate([
        {
          $lookup: {
            from: "sku",
            localField: "SKU",
            foreignField: "SKU",
            as: "skuData",
          },
        },
        { $unwind: "$skuData" },
        { $sort: { Ubicacion: 1, Producto: 1 } },
      ])
      .toArray();

    const uomdata = joinResult.map((inventario) => {
      const unidadesempaque = inventario.skuData.Unidades_Empaque || 1;
      return {
        Tipo_Calendario: "Dia",
        UOM: inventario.skuData.Unidad_Medida_UOM,
        SKU: inventario.SKU,
        Producto: inventario.Producto,
        Desc_Producto: inventario.Desc_Producto,
        Familia_Producto: inventario.Familia_Producto,
        Categoria: inventario.Categoria,
        Segmentacion_Producto: inventario.Segmentacion_Producto,
        Presentacion: inventario.Presentacion,
        Ubicacion: inventario.Ubicacion,
        Desc_Ubicacion: inventario.Desc_Ubicacion,
        SS: inventario.SS_Cantidad * unidadesempaque,
        Demanda_LT: inventario.Demanda_LT * unidadesempaque,
        MOQ: inventario.MOQ * unidadesempaque,
        ROQ: inventario.ROQ * unidadesempaque,
        ROP: inventario.ROP * unidadesempaque,
        META: inventario.META * unidadesempaque,
        Inventario_Promedio: inventario.Inventario_Promedio * unidadesempaque,
      };
    });

    const uomCollection = db.collection("ui_pol_inv_uom");
    await uomCollection.insertMany(uomdata);

    writeToLog(`\tTermina la Transforamación de datos de salida a UOM`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) await client.close(); // ✅ Cerrar conexión SIEMPRE al final
  }
}

function writeToLog(message) {
  const moment = require('moment');
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  const logMessage = `[${timestamp}] ${message}`;
  
  try {
    // Lógica mejorada para determinar el directorio de log
    let parametroFolder;
    try {
      if (typeof dbName !== 'undefined' && dbName) {
        const partes = dbName.split("_");
        let parte = partes[partes.length - 1];
        
        // Si la última parte parece un timestamp (12+ dígitos), usar la anterior
        if (/^\d{12,}$/.test(parte)) {
          parte = partes[partes.length - 2];
        }
        
        parametroFolder = parte.toUpperCase();
      } else {
        parametroFolder = 'DEFAULT';
      }
    } catch (error) {
      parametroFolder = 'DEFAULT';
    }
    
    const logFile = path.resolve(__dirname, `../../${parametroFolder}/log/ClasABCD_PolInvent.log`);
    const logDir = path.dirname(logFile);
    
    // Crear directorio si no existe
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Escribir al archivo de log
    fs.appendFileSync(logFile, logMessage + '\n');
  } catch (err) {
    // Fallback: escribir en directorio actual si hay problemas
    try {
      const fallbackLogFile = path.join(__dirname, `${path.basename(__filename, '.js')}_fallback.log`);
      fs.appendFileSync(fallbackLogFile, logMessage + '\n');
      console.error(`Log escrito en fallback: ${fallbackLogFile}`);
    } catch (fallbackErr) {
      // Si todo falla, solo mostrar en consola
      console.error(`Error escribiendo log: ${err.message}`);
      console.log(logMessage);
    }
  }
}

calcularUOM();
