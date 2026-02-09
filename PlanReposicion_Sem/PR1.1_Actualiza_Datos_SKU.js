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
const logFile = `../../${parametroFolder}/log/PlanReposicion_Sem.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection1 = 'plan_reposicion_01_sem';
const collection2 = 'sku';
const collectionPoliticas = 'politica_inventarios_01_sem'; // Ajusta al nombre real

async function actualizarDatos() {
  writeToLog(`\nPaso 01.1 - Actualizacion de Descripciones SKU`);

  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const col1 = db.collection(collection1);
    const col2 = db.collection(collection2);
    const colPoliticas = db.collection(collectionPoliticas);

    const docs = await col1.find({}).toArray();
    
    // Cargar políticas (que ya tienen la info descriptiva)
    const politicasDocs = await colPoliticas.find({}).toArray();
    const politicasMap = new Map();
    politicasDocs.forEach(pol => {
      const key = `${pol.SKU?.trim()}@${pol.Ubicacion}`;
      politicasMap.set(key, pol);
    });

    // Cargar SKUs como fallback
    const skuDocs = await col2.find({}).toArray();
    const skuMap = new Map();
    skuDocs.forEach(sku => skuMap.set(sku.SKU?.trim(), sku));

    const updates = docs.map(doc => {
      const key = `${doc.SKU?.trim()}@${doc.Ubicacion}`;
      
      // Primero buscar en políticas (tiene info completa)
      let source = politicasMap.get(key);
      
      // Si no existe, buscar en SKU (fallback)
      if (!source) {
        source = skuMap.get(doc.SKU?.trim());
      }
      
      if (!source) return null;

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              Desc_Producto: source.Desc_Producto || "0",
              Familia_Producto: source.Familia_Producto || "0",
              Categoria: source.Categoria || "0",
              Segmentacion_Producto: source.Segmentacion_Producto || "0",
              Presentacion: source.Presentacion || "0",
              Desc_Ubicacion: source.Desc_Ubicacion || "0",
              UOM_Base: source.UOM_Base || source.Desc_Empaque_UOM_Base || "0"
            }
          }
        }
      };
    }).filter(Boolean);

    if (updates.length > 0) {
      await col1.bulkWrite(updates);
    }

    writeToLog(`\tTermina la Actualizacion de Descripciones SKU (${updates.length} registros)`);
    writeToLog(`\t  - Encontrados en políticas: ${docs.filter(d => politicasMap.has(`${d.SKU?.trim()}@${d.Ubicacion}`)).length}`);
    writeToLog(`\t  - Encontrados en SKU: ${docs.filter(d => !politicasMap.has(`${d.SKU?.trim()}@${d.Ubicacion}`) && skuMap.has(d.SKU?.trim())).length}`);
    writeToLog(`\t  - No encontrados: ${docs.length - updates.length}`);
    
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    if (client) client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

actualizarDatos().catch(console.error);