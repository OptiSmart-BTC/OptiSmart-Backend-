const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

// 📌 FUNCION PRINCIPAL
async function procesarCambiosIncrementales() {
  writeToLog(`\nPaso 24 - Procesamiento Incremental de Cambios`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const demandaCollection = db.collection('demanda_abcd_01');
    const politicaCollection = db.collection('politica_inventarios_01');
    const ubisCollection = db.collection('ubis_saved');
    const cambiosCollection = db.collection('cambios_ubicaciones_temp');

    const cambios = await cambiosCollection.find({}).toArray();
    if (cambios.length === 0) {
      writeToLog(`\tNo hay cambios que procesar`);
      return;
    }

    writeToLog(`\tProcesando ${cambios.length} cambios identificados`);

    const datosDemanda = await demandaCollection.find().toArray();
    const demandaMap = new Map();
    datosDemanda.forEach(d => {
      if (!demandaMap.has(d.Ubicacion)) {
        demandaMap.set(d.Ubicacion, []);
      }
      demandaMap.get(d.Ubicacion).push(d);
    });

    let procesados = 0;
    let eliminados = 0;
    let insertados = 0;
    let actualizados = 0;

    for (const cambio of cambios) {
      const ubicacion = cambio.ubicacion;
      const tipoCambio = cambio.tipo_cambio;

      writeToLog(`\t  Procesando: ${ubicacion} (${tipoCambio})`);

      if (tipoCambio === 'ELIMINADA') {
        const resultado = await politicaCollection.deleteMany({ Ubicacion: ubicacion });
        eliminados += resultado.deletedCount;
        writeToLog(`\t    Eliminados ${resultado.deletedCount} registros`);
      } else if (tipoCambio === 'NUEVA') {
        const datosUbicacion = demandaMap.get(ubicacion) || [];
        if (datosUbicacion.length > 0) {
          const nuevosRegistros = datosUbicacion.map(dato => createPoliticaRecord(dato));
          await politicaCollection.insertMany(nuevosRegistros);
          insertados += nuevosRegistros.length;
          writeToLog(`\t    Insertados ${nuevosRegistros.length} registros nuevos`);
        }
      } else if (tipoCambio === 'ACTUALIZADA') {
        const datosUbicacion = demandaMap.get(ubicacion) || [];
        if (datosUbicacion.length > 0) {
          await politicaCollection.deleteMany({ Ubicacion: ubicacion });
          const registrosActualizados = datosUbicacion.map(dato => createPoliticaRecord(dato));
          await politicaCollection.insertMany(registrosActualizados);
          actualizados += registrosActualizados.length;
          writeToLog(`\t    Actualizados ${registrosActualizados.length} registros`);
        }
      }

      procesados++;
    }

    const ubicacionesParaCalcular = cambios
      .filter(c => c.tipo_cambio !== 'ELIMINADA')
      .map(c => c.ubicacion);

    if (ubicacionesParaCalcular.length > 0) {
      writeToLog(`\tEjecutando calculos de politicas para ${ubicacionesParaCalcular.length} ubicaciones`);
      await ejecutarCalculosPoliticas(ubicacionesParaCalcular, client, db);
    }

    await ubisCollection.deleteMany({});
    const ubicacionesActuales = [...demandaMap.keys()].map(ubicacion => ({
      ubicacion: ubicacion,
      fecha_actualizacion: now
    }));

    if (ubicacionesActuales.length > 0) {
      await ubisCollection.insertMany(ubicacionesActuales);
    }

    await cambiosCollection.deleteMany({});

    const totalRegistros = await politicaCollection.countDocuments();
    const totalUbicaciones = await ubisCollection.countDocuments();

    writeToLog(`\tResumen del procesamiento incremental:`);
    writeToLog(`\t  Cambios procesados: ${procesados}`);
    writeToLog(`\t  Registros eliminados: ${eliminados}`);
    writeToLog(`\t  Registros insertados: ${insertados}`);
    writeToLog(`\t  Registros actualizados: ${actualizados}`);
    writeToLog(`\t  Total registros en politica_inventarios_01: ${totalRegistros}`);
    writeToLog(`\t  Total ubicaciones guardadas: ${totalUbicaciones}`);
    writeToLog(`\tTermina el procesamiento incremental de cambios`);

  } catch (err) {
    writeToLog(`${now} - Error en procesamiento incremental: ${err.message}`);
    throw err;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// 📌 CREA REGISTRO DEFAULT
function createPoliticaRecord(dato) {
  return {
    Tipo_Calendario: "Dia",
    SKU: dato.SKU,
    Producto: dato.Producto,
    Desc_Producto: dato.Desc_Producto,
    Familia_Producto: dato.Familia_Producto,
    Categoria: dato.Categoria,
    Segmentacion_Producto: dato.Segmentacion_Producto,
    Presentacion: dato.Presentacion,
    Ubicacion: dato.Ubicacion,
    Desc_Ubicacion: dato.Desc_Ubicacion,
    Clasificacion: dato.Clasificacion_ABCD,
    Nivel_Servicio: "0",
    Valor_Z: 0,
    UOM: "0",
    UOM_Base: "0",
    Unidades_Empaque: "0",
    Demanda_Promedio_Diaria: 0,
    Lead_Time_Abasto: "0",
    Variabilidad_Demanda_Cantidad: 0,
    DS_Demanda: 0,
    Fill_Rate: 0,
    Frecuencia_Revision_dias: 0,
    Prom_LT: 0,
    DS_LT: 0,
    Override_SI_NO: "0",
    Override_Min_Politica_Inventarios: " ",
    Override_Max_Politica_Inventarios: " ",
    SS_Cantidad: 0,
    Demanda_LT: 0,
    MOQ: 0,
    ROQ: 0,
    ROP: 0,
    META: 0,
    Inventario_Promedio: 0,
    Medida_Override: "",
    Tipo_Override: "",
    STAT_SS: "",
    Override_SS_Cantidad: 0,
  };
}

// 📌 CALCULOS DE POLITICAS (puedes reemplazarlo con lógica real)
async function ejecutarCalculosPoliticas(ubicaciones, client, db) {
  // Aquí puedes correr scripts reales como:
  // await require('./PR01_Calculo_Meta')(db, ubicaciones);
  // await require('./PR02_Calculo_SS')(db, ubicaciones);
  writeToLog(`\t  (Simulación) Ejecutando cálculos para ubicaciones: ${ubicaciones.join(', ')}`);
}

// 📌 FUNCION LOG
function writeToLog(texto) {
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  const logMessage = `[${timestamp}] ${texto}\n`;
  fs.appendFileSync(logFile, logMessage);
}

// Ejecutar
procesarCambiosIncrementales();
