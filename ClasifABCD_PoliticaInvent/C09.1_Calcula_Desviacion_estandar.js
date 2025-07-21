// Importación de módulos necesarios
const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const math = require('mathjs');
const { host, puerto } = require('../Configuraciones/ConexionDB');

// Lectura de argumentos desde la línea de comandos
const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];

// Preparación para el archivo de log
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`;

async function calculateAndStoreStdev() {
  writeToLog(`\nPaso 07 - Calcula Desviacion Estandar de Demanda Historica`);

  const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db(dbName);

  const historicoCol = db.collection('historico_demanda');
  const destinoCol = db.collection('demanda_stdev');
  const abcdCol = db.collection('demanda_abcd_01');
  const parametrosCol = db.collection('parametros_usuario');
  const skuCol = db.collection('sku');

  const paramDias = await parametrosCol.findOne({ Tipo: 'Horizontes', Num_Param: 1 });
  const paramFecha = await parametrosCol.findOne({ Tipo: 'Horizontes', Num_Param: 2 });

  const diasHorizonte = parseInt(paramDias.Horizonte_Historico_dias);
  const fechaFinal = moment(paramFecha.Fecha_Fin_Horizonte);
  const fechaInicial = fechaFinal.clone().subtract(diasHorizonte, 'days');

  console.log(`📅 Fecha inicial: ${fechaInicial.format('YYYY-MM-DD')}`);
  console.log(`📅 Fecha final: ${fechaFinal.format('YYYY-MM-DD')}`);
  console.log(`📊 Horizonte días: ${diasHorizonte}`);

  const registros = await historicoCol.find().toArray();
  const skuDocs = await skuCol.find().toArray();
  const abcdDocs = await abcdCol.find().toArray();

  console.log(`📦 Total registros históricos: ${registros.length}`);
  console.log(`🧾 Total SKUs: ${skuDocs.length}`);

  // Crear mapa Producto|Ubicacion → Costo_Unidad
  const costoMap = new Map();
  for (const doc of skuDocs) {
    const key = `${doc.Producto}|${doc.Ubicacion}`;
    const costo = parseFloat(doc.Costo_Unidad);
    costoMap.set(key, isNaN(costo) ? 0 : costo);
  }

  const mapa = new Map();
  let registrosValidos = 0;

  for (const row of registros) {
    const fechaMoment = moment(row.Fecha);
    if (!fechaMoment.isValid()) {
      console.log(`⚠️ Fecha inválida encontrada: ${row.Fecha}`);
      continue;
    }

    const fecha = fechaMoment.format('YYYY-MM-DD');
    if (fechaMoment.isBefore(fechaInicial) || fechaMoment.isAfter(fechaFinal)) continue;

    const key = `${row.Producto}|${row.Ubicacion}`;
    if (!mapa.has(key)) mapa.set(key, {});
    mapa.get(key)[fecha] = parseFloat(row.Cantidad) || 0;
    registrosValidos++;
  }

  console.log(`✅ Registros válidos usados en cálculo: ${registrosValidos}`);

  const resultados = [];

  for (const [key, cantidadesPorFecha] of mapa.entries()) {
    const [Producto, Ubicacion] = key.split('|');

    const fechasHorizonte = [];
    for (let i = 0; i <= diasHorizonte; i++) {
      fechasHorizonte.push(fechaInicial.clone().add(i, 'days').format('YYYY-MM-DD'));
    }

    const cantidades = fechasHorizonte.map(f => cantidadesPorFecha[f] ?? 0);
    const desviacion = cantidades.length >= 2 ? math.std(cantidades) : 0;

    const costoUnidad = costoMap.get(key) ?? 0;
    const stdCosto = desviacion * costoUnidad;

    resultados.push({
      Producto,
      Ubicacion,
      Fecha_Corte: fechaFinal.toDate(),
      Desviacion_Estandar_Demanda: parseFloat(desviacion.toFixed(5)),
      Desviacion_Estandar_Costo: parseFloat(stdCosto.toFixed(5)),
    });
  }

  console.log(`📈 Total resultados generados: ${resultados.length}`);

  if (resultados.length > 0) {
    await destinoCol.deleteMany({});
    console.log('🧹 Colección demanda_stdev limpiada');
    await destinoCol.insertMany(resultados);
    console.log(`✅ Insertados ${resultados.length} documentos en demanda_stdev`);
    writeToLog(`\tSe insertaron ${resultados.length} documentos en demanda_stdev`);

    // Actualizar también en demanda_abcd_01
    const updateOps = resultados.map(async (item) => {
      await abcdCol.updateOne(
        { Producto: item.Producto, Ubicacion: item.Ubicacion },
        {
          $set: {
            DS_Demanda: item.Desviacion_Estandar_Demanda,
            DS_Demanda_Costo: item.Desviacion_Estandar_Costo
          }
        }
      );
    });
    await Promise.all(updateOps);
    console.log('🛠️ Datos de desviación estandar actualizados en demanda_abcd_01');
  } else {
    console.log('⚠️ No se generaron resultados. ¿Fechas mal configuradas?');
    writeToLog('\t⚠️ No se generaron resultados. Verifica si hay datos en historico_demanda y si las fechas del horizonte están bien configuradas.');
  }

  writeToLog(`\tTermina cálculo de desviación estándar. Total registros: ${resultados.length}`);
  client.close();
}

// Función para registrar en log
function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Ejecutar
calculateAndStoreStdev();
