const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv[2];
const DBUser = process.argv[3];
const DBPassword = process.argv[4];
const nivelFiltrado = process.argv[5] ? parseInt(process.argv[5]) : null;

const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);
const parte = dbName.substring(dbName.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion_Sem.log`;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection1 = 'plan_reposicion_01_sem';

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

async function calcularDemandaIndirecta() {
  writeToLog(`\nPaso Extra - Cálculo de Demanda Indirecta para Nivel ${nivelFiltrado}`);
  let client;

  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const planRepCol = db.collection(collection1);

    const documentos = await planRepCol.find({}).toArray();

    const docsConCodigo = documentos.map(doc => {
      const [codigoRaw, ubicacionRaw] = doc.SKU ? doc.SKU.split('@') : [null, null];
      const codigo = String(codigoRaw ?? '').padStart(5, '0').trim();
      const ubicacion = String(ubicacionRaw ?? '').padStart(4, '0').trim();
      const origenAbasto = doc.Origen_Abasto !== undefined && doc.Origen_Abasto !== null
        ? String(doc.Origen_Abasto).padStart(4, '0').trim()
        : null;

      return {
        ...doc,
        Codigo_Producto: codigo,
        Ubicacion: ubicacion,
        Origen_Abasto: origenAbasto
      };
    });

    const updates = [];
    let contadorConDemanda = 0;

    // Filtrar SOLO los documentos del nivel que estamos calculando
    const docsFiltrados = docsConCodigo.filter(d => d.Nivel_OA === nivelFiltrado);

    writeToLog(`\t Documentos en Nivel ${nivelFiltrado}: ${docsFiltrados.length}`);

    for (const doc of docsFiltrados) {
      //  CORRECCIÓN: Buscar CUALQUIER ubicación que tenga como origen a esta ubicación
      const abastecidos = docsConCodigo.filter(d =>
        d.Codigo_Producto === doc.Codigo_Producto &&
        d.Origen_Abasto === doc.Ubicacion &&
        (d.Plan_Reposicion_Cantidad || 0) > 0
      );

      const demanda = abastecidos.reduce((sum, d) => sum + (d.Plan_Reposicion_Cantidad || 0), 0);

      if (demanda > 0) {
        contadorConDemanda++;
        writeToLog(`\t\t ${doc.SKU} (Nivel ${doc.Nivel_OA}) abastece a ${abastecidos.length} SKUs → Demanda: ${demanda}`);
      }

      updates.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { Cantidad_Demanda_Indirecta: demanda } }
        }
      });
    }

    if (updates.length > 0) {
      await planRepCol.bulkWrite(updates);
    }

    writeToLog(`\t  Demanda Indirecta actualizada para nivel ${nivelFiltrado} (${updates.length} docs)`);
    writeToLog(`\t Total con Demanda > 0: ${contadorConDemanda}`);
  } catch (error) {
    writeToLog(`${now} -  ERROR: ${error.message}`);
    console.error(' Error en Calculo_Demanda_Indirecta:', error.message);
  } finally {
    if (client) client.close();
  }
}

calcularDemandaIndirecta();