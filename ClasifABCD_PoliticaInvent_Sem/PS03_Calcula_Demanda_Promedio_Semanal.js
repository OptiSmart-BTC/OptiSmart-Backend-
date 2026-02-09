const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`;

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

// Colecciones
const historicoDemandaCollection = 'historico_demanda';
const politicaCollection = 'politica_inventarios_01_sem';

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

function normKey(prod, ubi) {
  const p = (prod === null || prod === undefined) ? '' : String(prod).trim();
  const u = (ubi === null || ubi === undefined) ? '' : String(ubi).trim();
  return `${p}||${u}`;
}

function normCalc(v) {
  const s = (v === null || v === undefined) ? 'Promedio' : String(v).trim();
  return (s === 'PromMovil') ? 'PromMovil' : 'Promedio';
}

/**
 * Genera semanas ISO (Week_Year = "24_W2025") desde un lunes (inicio)
 * hasta fechaFin (puede ser parcial).
 * SOLO SE USA PARA PROMEDIO MÓVIL
 */
function construirSemanasISOOrdenadas(fechaInicioLunesUTC, fechaFinUTC) {
  const weeks = [];
  let cur = moment.utc(fechaInicioLunesUTC).startOf('day');
  const end = moment.utc(fechaFinUTC).startOf('day');

  while (cur.isSameOrBefore(end, 'day')) {
    const y = cur.isoWeekYear();
    const w = cur.isoWeek();
    const key = `${w}_W${y}`;
    if (weeks.length === 0 || weeks[weeks.length - 1] !== key) {
      weeks.push(key);
    }
    cur.add(7, 'days');
  }
  return weeks;
}

async function calcularDemandaPromedioSemanalHibrido() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 03 - Calculo de la Demanda Promedio Semanal (Híbrido: Normal Original + Móvil ISO)`);

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);

    // ============================================================
    // 1) Obtener parámetros de horizonte
    // ============================================================
    const resultado = await CalculaRangoFechas(dbName);
    
    // FECHAS ORIGINALES SIN AJUSTAR (para Promedio Normal)
    const fechaInicioOriginal = new Date(resultado.fechaInicio);
    const fechaFinOriginal = new Date(resultado.fechaFin);
    const diasprom = Number(resultado.diasprom) || 0;

    writeToLog(`\tHorizonte histórico (param): ${diasprom} días`);
    writeToLog(`\tFecha inicio ORIGINAL: ${moment(fechaInicioOriginal).format('YYYY-MM-DD')}`);
    writeToLog(`\tFecha fin ORIGINAL: ${moment(fechaFinOriginal).format('YYYY-MM-DD')}`);

    const documentosExistentes = await db.collection(historicoDemandaCollection).countDocuments({
      Fecha: { $gte: fechaInicioOriginal, $lte: fechaFinOriginal }
    });
    writeToLog(`\tDocumentos en histórico (diario): ${documentosExistentes}`);

    // ============================================================
    // 2) Sincronizar Calculo_Demanda desde SKU
    // ============================================================
    writeToLog(`\n\t--- Sincronizando Calculo_Demanda desde sku hacia ${politicaCollection} ---`);

    const skuDocs = await db.collection('sku').find(
      {},
      { projection: { _id: 0, Producto: 1, Ubicacion: 1, Calculo_Demanda: 1 } }
    ).toArray();

    const calcMap = new Map();
    for (const s of skuDocs) {
      calcMap.set(normKey(s.Producto, s.Ubicacion), normCalc(s.Calculo_Demanda));
    }
    writeToLog(`\t${calcMap.size} llaves cargadas desde sku`);

    const polDocs = await db.collection(politicaCollection).find(
      {},
      { projection: { _id: 1, Producto: 1, Ubicacion: 1, Calculo_Demanda: 1 } }
    ).toArray();

    const ops = [];
    let cambiosCalc = 0;

    for (const p of polDocs) {
      const key = normKey(p.Producto, p.Ubicacion);
      const calcSku = calcMap.get(key) || 'Promedio';
      const calcPol = normCalc(p.Calculo_Demanda);

      if (calcSku !== calcPol) {
        ops.push({
          updateOne: {
            filter: { _id: p._id },
            update: { $set: { Calculo_Demanda: calcSku } }
          }
        });
        cambiosCalc++;
      }
    }

    if (ops.length > 0) {
      await db.collection(politicaCollection).bulkWrite(ops, { ordered: false });
    }
    writeToLog(`\tPolíticas con Calculo_Demanda actualizado: ${cambiosCalc}`);

    // ============================================================
    // 3) PROMEDIO NORMAL - LÓGICA ORIGINAL (Math.ceil)
    // ============================================================
    writeToLog(`\n\t--- Calculando Demanda Promedio Normal (LÓGICA ORIGINAL) ---`);

    // Calcular semanas usando la fórmula ORIGINAL
    const semanasPromedioNormal = Math.ceil(diasprom / 7);
    writeToLog(`\tSemanas para Promedio Normal (Math.ceil(${diasprom}/7)): ${semanasPromedioNormal}`);

    const resultadosAgregados = await db.collection(historicoDemandaCollection).aggregate([
      { 
        $match: { 
          Fecha: { 
            $gte: fechaInicioOriginal, 
            $lte: fechaFinOriginal 
          } 
        } 
      },
      {
        $group: {
          _id: { Producto: "$Producto", Ubicacion: "$Ubicacion" },
          Demanda_Cantidad: { $sum: "$Cantidad" }
        }
      },
      { 
        $addFields: { 
          Producto: "$_id.Producto", 
          Ubicacion: "$_id.Ubicacion" 
        } 
      }
    ]).toArray();

    const promNormalMap = new Map();
    for (const r of resultadosAgregados) {
      const key = normKey(r.Producto, r.Ubicacion);
      // FÓRMULA ORIGINAL: Demanda_Cantidad / Math.ceil(diasprom / 7)
      promNormalMap.set(key, (r.Demanda_Cantidad || 0) / semanasPromedioNormal);
    }

    const politicasPromedio = await db.collection(politicaCollection).find(
      { Calculo_Demanda: "Promedio" },
      { projection: { _id: 1, Producto: 1, Ubicacion: 1 } }
    ).toArray();

    const opsNormal = [];
    for (const p of politicasPromedio) {
      const key = normKey(p.Producto, p.Ubicacion);
      const val = promNormalMap.get(key) ?? 0;

      opsNormal.push({
        updateOne: {
          filter: { _id: p._id },
          update: { $set: { Demanda_Promedio_Semanal: val } }
        }
      });
    }

    if (opsNormal.length > 0) {
      await db.collection(politicaCollection).bulkWrite(opsNormal, { ordered: false });
    }

    writeToLog(`\tRegistros actualizados con Promedio Normal: ${politicasPromedio.length}`);

    // ============================================================
    // 4) PROMEDIO MÓVIL - LÓGICA NUEVA CON SEMANAS ISO
    // ============================================================
    writeToLog(`\n\t--- Calculando Demanda Promedio Móvil (NUEVA LÓGICA ISO) ---`);

    const politicasMovil = await db.collection(politicaCollection).find(
      { Calculo_Demanda: "PromMovil" },
      { projection: { _id: 1, Producto: 1, Ubicacion: 1 } }
    ).toArray();

    writeToLog(`\tProductos con Promedio Móvil activado: ${politicasMovil.length}`);

    // Para Promedio Móvil: ajustar inicio a lunes ISO
    const fechaInicioBase = moment.utc(fechaInicioOriginal).startOf('day');
    const fechaFinBase = moment.utc(fechaFinOriginal).startOf('day');

    let inicioMovil = fechaInicioBase.clone();
    if (inicioMovil.isoWeekday() !== 1) {
      inicioMovil = inicioMovil.add(8 - inicioMovil.isoWeekday(), 'days');
    }

    const fechaInicioMovilObj = inicioMovil.toDate();
    const fechaFinMovilObj = fechaFinBase.toDate();

    writeToLog(`\tFecha inicio AJUSTADA para Promedio Móvil (lunes ISO): ${inicioMovil.format('YYYY-MM-DD')}`);
    writeToLog(`\tFecha fin para Promedio Móvil: ${fechaFinBase.format('YYYY-MM-DD')}`);

    const semanasHorizonteOrdenadas = construirSemanasISOOrdenadas(fechaInicioMovilObj, fechaFinMovilObj);
    const n = semanasHorizonteOrdenadas.length;
    const sumPos = (n * (n + 1)) / 2;

    writeToLog(`\tNúmero de semanas ISO para Promedio Móvil: ${n}`);
    writeToLog(`\tSuma de posiciones (1..${n}): ${sumPos}`);
    if (n > 0) {
      writeToLog(`\tPrimer ponderador: ${(1 / sumPos).toFixed(6)} | Último ponderador: ${(n / sumPos).toFixed(6)}`);
    }

    let contadorMovil = 0;
    let contadorSinSemanas = 0;

    for (const p of politicasMovil) {
      const productoRaw = p.Producto;
      const ubicacionRaw = p.Ubicacion;

      const prodStr = String(productoRaw).trim();
      const prodNum = Number(productoRaw);
      const prodVals = Number.isNaN(prodNum) ? [productoRaw, prodStr] : [productoRaw, prodStr, prodNum];

      const ubicStr = String(ubicacionRaw).trim();
      const ubicNum = Number(ubicacionRaw);
      const ubicVals = Number.isNaN(ubicNum) ? [ubicacionRaw, ubicStr] : [ubicacionRaw, ubicStr, ubicNum];

      if (n === 0 || sumPos === 0) {
        contadorSinSemanas++;
        await db.collection(politicaCollection).updateOne(
          { _id: p._id },
          { $set: { Demanda_Promedio_Semanal: 0 } }
        );
        continue;
      }

      // Usar fechas AJUSTADAS para Promedio Móvil
      const docsSem = await db.collection(historicoDemandaCollection).aggregate([
        {
          $match: {
            Fecha: { $gte: fechaInicioMovilObj, $lte: fechaFinMovilObj },
            $and: [
              { $or: prodVals.map(v => ({ Producto: v })) },
              { $or: ubicVals.map(v => ({ Ubicacion: v })) }
            ]
          }
        },
        {
          $addFields: {
            ISO_Year: { $isoWeekYear: "$Fecha" },
            ISO_Week: { $isoWeek: "$Fecha" }
          }
        },
        {
          $group: {
            _id: { y: "$ISO_Year", w: "$ISO_Week" },
            Cantidad_Sem: { $sum: "$Cantidad" }
          }
        },
        {
          $project: {
            _id: 0,
            Week_Year: {
              $concat: [
                { $toString: "$_id.w" },
                "_W",
                { $toString: "$_id.y" }
              ]
            },
            Cantidad_Sem: 1
          }
        }
      ]).toArray();

      const mapCant = new Map();
      for (const d of docsSem) {
        mapCant.set(d.Week_Year, Number(d.Cantidad_Sem || 0));
      }

      const serie = semanasHorizonteOrdenadas.map(wy => (mapCant.get(wy) ?? 0));

      let sumaPonderada = 0;
      let sumaPonderadores = 0;

      const logDetalle = contadorMovil < 3;
      if (logDetalle) {
        writeToLog(`\n\t\t=== DETALLE MÓVIL Producto: ${productoRaw} | Ubicación: ${ubicacionRaw} ===`);
        writeToLog(`\t\tPonderador: pos / ${sumPos}`);
      }

      for (let idx = 0; idx < serie.length; idx++) {
        const weekYear = semanasHorizonteOrdenadas[idx];
        const pos = idx + 1;
        const cantidad = serie[idx] || 0;

        const ponderador = pos / sumPos;
        const cantidadPonderada = ponderador * cantidad;

        sumaPonderadores += ponderador;
        sumaPonderada += cantidadPonderada;

        if (logDetalle) {
          writeToLog(
            `\t\tSemana ${weekYear} (Pos=${pos}) | ` +
            `Cantidad=${cantidad} | ` +
            `Ponderador=${ponderador.toFixed(8)} | ` +
            `Cantidad_Ponderada=${cantidadPonderada.toFixed(8)} | ` +
            `Acumulado=${sumaPonderada.toFixed(8)}`
          );
        }
      }

      if (logDetalle) {
        writeToLog(`\t\tSuma ponderadores (≈1.0): ${sumaPonderadores.toFixed(8)}`);
        writeToLog(`\t\tDemanda_Promedio_Semanal (móvil): ${sumaPonderada.toFixed(8)}`);
      }

      await db.collection(politicaCollection).updateOne(
        { _id: p._id },
        { $set: { Demanda_Promedio_Semanal: sumaPonderada } }
      );

      contadorMovil++;
    }

    writeToLog(`\n\tRegistros actualizados con Promedio Móvil: ${contadorMovil}`);
    writeToLog(`\tProductos móvil sin semanas detectadas: ${contadorSinSemanas}`);
    writeToLog(`\n\tTermina el Calculo de la Demanda Promedio Semanal (Híbrido)`);

    client.close();
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
    writeToLog(`${error.stack}`);
  }
}

calcularDemandaPromedioSemanalHibrido();

async function CalculaRangoFechas(dbName) {
  const mongoUriLocal = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
  const client = new MongoClient(mongoUriLocal);

  try {
    await client.connect();
    const database = client.db(`${dbName}`);
    const tabla = database.collection('parametros_usuario');

    const pipeline = [
      { $match: { Tipo: "Horizontes", Num_Param: 1 } },
      { $project: { _id: 0, Horizonte_Historico_dias: '$Horizonte_Historico_dias' } }
    ];

    const resultados = await tabla.aggregate(pipeline).toArray();
    const diasAtras = Number(resultados.map(r => r.Horizonte_Historico_dias).join(', '));

    const pipeline2 = [
      { $match: { Tipo: "Horizontes", Num_Param: 2 } },
      { $project: { _id: 0, Fecha_Fin_Horizonte: '$Fecha_Fin_Horizonte' } }
    ];

    const resultados2 = await tabla.aggregate(pipeline2).toArray();
    const FechaFinHorizonte = resultados2.map(r => r.Fecha_Fin_Horizonte).join(', ');

    const fechaInicio = new Date(FechaFinHorizonte);
    const fechaFin = new Date(FechaFinHorizonte);
    const diasprom = diasAtras;

    fechaInicio.setDate(fechaInicio.getDate() - (diasAtras - 1));

    return { fechaInicio, fechaFin, diasprom };
  } catch (error) {
    console.error('Error al consultar la tabla:', error);
    throw error;
  } finally {
    client.close();
  }
}