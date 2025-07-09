const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const math = require('mathjs');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 

const historicoCollection = 'historico_demanda';
const politicaCollection = 'politica_inventarios_01';

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

async function CalculaRangoFechas(dbName) {
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const database = client.db(dbName);
    const tabla = database.collection('parametros_usuario');

    const param1 = await tabla.findOne({ Tipo: "Horizontes", Num_Param: 1 });
    const param2 = await tabla.findOne({ Tipo: "Horizontes", Num_Param: 2 });

    const diasAtras = param1?.Horizonte_Historico_dias || 30;
    const fechaFin = new Date(param2?.Fecha_Fin_Horizonte || new Date());
    const fechaInicio = new Date(fechaFin);
    fechaInicio.setDate(fechaFin.getDate() - (diasAtras - 1));

    return { fechaInicio, fechaFin };
  } finally {
    await client.close();
  }
}

async function calcularDSDemanda() {
  writeToLog(`\nPaso 05 (alt) - Calculo de la Desviación Estándar con math.js`);

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const { fechaInicio, fechaFin } = await CalculaRangoFechas(dbName);

    const historicoCol = db.collection(historicoCollection);
    const politicaCol = db.collection(politicaCollection);

    const diasHorizonte = Math.round((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24));
    const registros = await historicoCol.find({
      Fecha: { $gte: fechaInicio, $lte: fechaFin }
    }).toArray();

    const mapa = new Map();
    for (const row of registros) {
      const fecha = moment(row.Fecha).format('YYYY-MM-DD');
      const key = `${row.Producto}|${row.Ubicacion}`;
      if (!mapa.has(key)) mapa.set(key, {});
      mapa.get(key)[fecha] = parseFloat(row.Cantidad) || 0;
    }

    const resultados = [];

    for (const [key, cantidadesPorFecha] of mapa.entries()) {
      const [Producto, Ubicacion] = key.split('|');

      const fechasHorizonte = [];
      for (let i = 0; i <= diasHorizonte; i++) {
        fechasHorizonte.push(moment(fechaInicio).add(i, 'days').format('YYYY-MM-DD'));
      }

      const cantidades = fechasHorizonte.map(f => cantidadesPorFecha[f] ?? 0);
      const desviacion = cantidades.length >= 2 ? math.std(cantidades) : 0;

      resultados.push({
        Producto,
        Ubicacion,
        DS_Demanda: parseFloat(desviacion.toFixed(5))
      });
    }

    // Guardar en politica_inventarios_01
    for (const doc of resultados) {
      await politicaCol.updateOne(
        { Producto: doc.Producto, Ubicacion: doc.Ubicacion },
        { $set: { DS_Demanda: doc.DS_Demanda } }
      );
    }

    // Rellenar con 0 los que no fueron calculados
    const fillResult = await politicaCol.updateMany(
      { DS_Demanda: { $exists: false } },
      { $set: { DS_Demanda: 0 } }
    );
    writeToLog(`\tSe rellenaron ${fillResult.modifiedCount} registros con DS_Demanda = 0`);

    writeToLog(`\tTermina el Calculo con math.js`);
  } catch (error) {
    writeToLog(`${moment().format('YYYY-MM-DD HH:mm:ss')} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

calcularDSDemanda();
