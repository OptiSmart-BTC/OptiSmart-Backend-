// /planner/db/conn.manager.js
const { MongoClient } = require('mongodb');
const { decryptData } = require('../../../DeCriptaPassAppDb');
const { host, puerto } = require('../../../Configuraciones/ConexionDB');
const path = require('path');

const clientCache = new Map(); // clave: `${appUser}|${dbName}`

async function getDb(appUser, dbName) {
  const key = `${appUser}|${dbName}`;
  if (clientCache.has(key)) return clientCache.get(key).db;

  // Carga credenciales del usuario (igual que tus scripts)
const configPath = path.join(__dirname, `../../../../${appUser}/cfg/dbvars`);
const { DBUser, DBPassword } = require(configPath);
  const decryptedPassword = await decryptData(DBPassword);

  const mongoURI = `mongodb://${DBUser}:${decryptedPassword}@${host}:${puerto}/?authSource=admin`;
  const client = new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
  await client.connect();

  const normalized = dbName.startsWith('btc_opti_') ? dbName : `btc_opti_${dbName}`;
  const db = client.db(normalized);
  clientCache.set(key, { client, db });

  return db;
}

module.exports = { getDb };