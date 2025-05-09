const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

//const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto, useradmin, passadmin } = require('../../Configuraciones/ConexionDB');
//const conex= require('../Configuraciones/ConStrDB');

//const nameFolder = process.argv.slice(2)[0];
const appUser = process.argv.slice(2)[0];

// La URL de conexión a tu base de datos MongoDB
//const url = 'mongodb://admin:btc0pt1@127.0.0.1:27017/?authSource=admin'; 

async function obtenerDBNamePorAppUser(appUser) {
  //const passadminDeCripta = await getDecryptedPassadmin();
  //const mongoUri =  conex.getUrl(useradmin,passadminDeCripta,host,puerto,dbName);
  const mongoUri = 'mongodb://admin:btc0pt1@127.0.0.1:27017/?authSource=admin'; 
  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  try {
    await client.connect();

    const database = client.db('OptiBTC'); // Cambia el nombre de la base de datos
    const coleccion = database.collection('usuarios'); // Cambia el nombre de la colección

    //const resultado = await coleccion.findOne({ "UserUI.AppUser": appUser });
    const resultado = await coleccion.findOne({
      "UserUI.AppUser": appUser,
      "UserUI.Activo": 1
    });
    
console.log(resultado.UserUI[1].Tipo);


if (resultado && resultado.UserUI[0].Tipo === "A") {
  const nameFolder = resultado.UserDB[0].DBName;
  const mainFolder = `../../${nameFolder}`;
  const subFolders = ['cfg', 'csv', 'log', 'reportes', 'temp', 'templetes'];
  const nestedFolders = {
    csv: ['procesados'],
    log: ['Log_historico']
  };

  // Verificar la existencia del directorio principal (TEST04)
  if (!fs.existsSync(mainFolder)) {
    fs.mkdirSync(mainFolder);
  }
  // Verificar la existencia y crear los subdirectorios dentro de TEST04
  subFolders.forEach(subFolder => {
    const folderPath = path.join(mainFolder, subFolder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
    }
  });
  // Verificar la existencia y crear los subdirectorios anidados
  Object.entries(nestedFolders).forEach(([parentFolder, childFolders]) => {
    const parentFolderPath = path.join(mainFolder, parentFolder);
    if (!fs.existsSync(parentFolderPath)) {
      fs.mkdirSync(parentFolderPath);
    }

    childFolders.forEach(childFolder => {
      const nestedFolderPath = path.join(parentFolderPath, childFolder);
      if (!fs.existsSync(nestedFolderPath)) {
        fs.mkdirSync(nestedFolderPath);
      }
    });
  });

  console.log('Estructura de carpetas creada correctamente.');
}

/*

const nameFolder = resultado.UserDB[0].DBName;
const mainFolder = `../../${nameFolder}`;
const subFolders = ['cfg', 'csv', 'log', 'reportes', 'temp', 'templetes'];
const nestedFolders = {
  csv: ['procesados'],
  log: ['Log_historico']
};

// Verificar la existencia del directorio principal (TEST04)
if (!fs.existsSync(mainFolder)) {
  fs.mkdirSync(mainFolder);
}
// Verificar la existencia y crear los subdirectorios dentro de TEST04
subFolders.forEach(subFolder => {
  const folderPath = path.join(mainFolder, subFolder);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
  }
});
// Verificar la existencia y crear los subdirectorios anidados
Object.entries(nestedFolders).forEach(([parentFolder, childFolders]) => {
  const parentFolderPath = path.join(mainFolder, parentFolder);
  if (!fs.existsSync(parentFolderPath)) {
    fs.mkdirSync(parentFolderPath);
  }

  childFolders.forEach(childFolder => {
    const nestedFolderPath = path.join(parentFolderPath, childFolder);
    if (!fs.existsSync(nestedFolderPath)) {
      fs.mkdirSync(nestedFolderPath);
    }
  });
});

console.log('Estructura de carpetas creada correctamente.');
*/

  } finally {
    await client.close();
  }
}


obtenerDBNamePorAppUser(appUser);









