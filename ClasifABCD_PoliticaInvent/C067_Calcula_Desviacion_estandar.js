const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const math = require('mathjs');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];

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
  const parametrosCol = db.collection('parametros_usuario');

  // Obtener horizonte y fecha final desde parametros_usuario
  const paramDias = await parametrosCol.findOne({ Tipo: 'Horizontes', Num_Param: 1 });
  const paramFecha = await parametrosCol.findOne({ Tipo: 'Horizontes', Num_Param: 2 });

  const diasHorizonte = parseInt(paramDias.Horizonte_Historico_dias);
  const fechaFinal = moment(paramFecha.Fecha_Fin_Horizonte);
  const fechaInicial = fechaFinal.clone().subtract(diasHorizonte, 'days');

  const registros = await historicoCol.find().toArray();

  const mapa = new Map();

  for (const row of registros) {
    const fechaMoment = moment(row.Fecha.toString().trim(), ['D/M/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'], true);
    if (!fechaMoment.isValid()) continue;

    const fecha = fechaMoment.format('YYYY-MM-DD');
    if (fechaMoment.isBefore(fechaInicial) || fechaMoment.isAfter(fechaFinal)) continue;

    const key = `${row.Producto}|${row.Ubicacion}`;
    if (!mapa.has(key)) mapa.set(key, {});

    mapa.get(key)[fecha] = parseFloat(row.Cantidad) || 0;
  }

  const resultados = [];

  for (const [key, cantidadesPorFecha] of mapa.entries()) {
    const [Producto, Ubicacion] = key.split('|');

    const fechasHorizonte = [];
    for (let i = 0; i <= diasHorizonte; i++) {
      fechasHorizonte.push(fechaInicial.clone().add(i, 'days').format('YYYY-MM-DD'));
    }

    const cantidades = fechasHorizonte.map(f => cantidadesPorFecha[f] ?? 0);
    const desviacion = cantidades.length >= 2 ? math.std(cantidades) : 0;

    resultados.push({
      Producto,
      Ubicacion,
      Fecha_Corte: fechaFinal.toDate(),
      Desviacion_Estandar_Demanda: parseFloat(desviacion.toFixed(5)),
      // Cantidades: cantidades
    });
  }

  if (resultados.length > 0) {
  await destinoCol.deleteMany({});
  await destinoCol.insertMany(resultados);
  writeToLog(`\tSe insertaron ${resultados.length} documentos en demanda_stdev`);
} else {
  writeToLog('\t⚠️ No se generaron resultados. Verifica si hay datos en historico_demanda y si las fechas del horizonte están bien configuradas.');
}

  await destinoCol.deleteMany({});
  await destinoCol.insertMany(resultados);

  writeToLog(`\tTermina cálculo de desviación estándar. Total registros: ${resultados.length}`);
  client.close();
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

calculateAndStoreStdev();
