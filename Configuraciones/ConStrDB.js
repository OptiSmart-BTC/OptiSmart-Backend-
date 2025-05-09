const { MongoClient } = require('mongodb');
const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto, useradmin, passadmin } = require('../Configuraciones/ConexionDB');

let user;
let pass;
let database;// = 'btc_opti_'+user;
let PassAd;
//let mongoUri = `mongodb://${DBUser}:${PassAd}@${host}:${puerto}/${database}?authSource=admin`;
let mongoUri = 'mongodb://127.0.0.1:27017';
const milocal = false;
let client;

async function connectToDatabase() {
  PassAd = await getDecryptedPassadmin();
  if (milocal) {
    mongoUri = 'mongodb://127.0.0.1:27017';
  }else{
    mongoUri=`mongodb://${useradmin}:${PassAd}@${host}:${puerto}/?authSource=admin`;
  }
  client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });
  //}
  return client;
}

function getClient() {
  return client;
}
function getUser() {
  return user;
}
function getPass() {
  return pass;
}
function getDB() {
  return database;
}

function getUrl(dbuser,passadmin,ho,pu,dbnam) {
  //let url = `mongodb://${dbuser}:${passadmin}@${ho}:${pu}/${dbnam}?authSource=admin`;
  if (milocal){
    return 'mongodb://127.0.0.1:27017/'+dbnam;
  }else{
    return `mongodb://${dbuser}:${passadmin}@${ho}:${pu}/${dbnam}?authSource=admin`;
  }
  
}

function setUserData(newUser,newPass,newdb) {
  user = newUser; // Update the URL
  pass = newPass;
  database = newdb;
  //console.log(newUser+'-'+newPass+'-'+newdb);
}

module.exports = {
  connectToDatabase,
  getClient,
  setUserData,
  getUser,
  getPass,
  getDecryptedPassadmin,
  getUrl,
  getDB
};

// Obtener el valor desencriptado de passadmin
async function getDecryptedPassadmin() {
  try {
    return await decryptData(passadmin);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}