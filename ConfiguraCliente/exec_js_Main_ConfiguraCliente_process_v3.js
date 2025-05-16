const { exec } = require('child_process');
const fs = require('fs');
const { MongoClient } = require('mongodb');

const { path_sftp, path_opti, path_users } = require(`../Configuraciones/paths_vars`);

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto, dbName, useradmin, passadmin } = require('../Configuraciones/ConexionDB');
const conex= require('../Configuraciones/ConStrDB');

const appUser = process.argv.slice(2)[0];
let userInformation;


async function obtenerDBNamePorAppUser(appUser) {
  const passadminDeCripta = await getDecryptedPassadmin();
  const mongoUri =  conex.getUrl(useradmin,passadminDeCripta,host,puerto,dbName);
  //const mongoUri = 'mongodb://admin:btc0pt1@127.0.0.1:27017/?authSource=admin'; 
  //const mongoUri = `mongodb://${useradmin}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
    
  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  try {
    await client.connect();
    const database = client.db('OptiBTC'); // Cambia el nombre de la base de datos
    const coleccion = database.collection('usuarios'); // Cambia el nombre de la colección
    const resultado = await coleccion.findOne(
      {
        "UserUI.AppUser": appUser,
        "UserUI.Activo": 1
      }
    );
    
    
//console.log(resultado.UserDB[0].DBName);
const parametroFolder = resultado.UserDB[0].DBName


if (resultado && resultado.UserUI) {
  userInformation = resultado.UserUI.find(user => user.AppUser === appUser);
  
  if (userInformation) {
    //console.log(userInformation);
  } else {
    console.log(`No se encontró el subdocumento para el AppUser: ${appUser}`);
  }
} else {
  console.log(`No se encontró el documento para el AppUser: ${appUser}`);
}

const var_AppUser = userInformation.AppUser
const var_AppPassword = userInformation.AppPassword
const var_Type = userInformation.Type
const var_UserName = userInformation.UserName
const var_UserTitle = userInformation.UserTitle
const var_UserCompany = userInformation.CompanyName
const var_DBUser = resultado.UserDB[0].DBUser
const var_DBPassword = resultado.UserDB[0].DBPassword
const var_DBName = resultado.UserDB[0].DBName
const var_Rol = userInformation.rol || "No asignado";

const var_PwBiUser = resultado.UserPwBi[0].PwBiUser
const var_PwBiPassword = resultado.UserPwBi[0].PwBiPassword
const var_PwBiURL = resultado.UserPwBi[0].PwBiURL

const archivos = [
  { nombre: '00_Verifica_Folders_v3.js', parametros: `${parametroFolder} ${var_AppUser}` },
  { nombre: '01_Crea_uservars_v4.js', parametros: `${parametroFolder} ${var_AppUser} ${var_AppPassword} ${var_Type} ${var_DBUser} ${var_DBPassword} ${var_DBName} "${var_UserName}" "${var_UserTitle}" "${var_UserCompany}" ${var_PwBiUser} ${var_PwBiPassword} ${var_PwBiURL} ${var_Rol}` }
];

ejecutarArchivos(archivos);

  } finally {
    await client.close();
  }
}

obtenerDBNamePorAppUser(appUser);






function ejecutarArchivos(archivos) {
  if (archivos.length === 0) {
    return;
  }

  const archivo = archivos.shift();
  const comando = `node ${archivo.nombre} ${archivo.parametros}`;

  exec(comando, (error, stdout, stderr) => {
    if (error) {
      return;
    }
    ejecutarArchivos(archivos);
  });
}

 
async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${passadmin}`);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}