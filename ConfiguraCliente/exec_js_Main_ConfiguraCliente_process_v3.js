const { exec } = require('child_process');
const fs = require('fs');
const { MongoClient } = require('mongodb');

const { path_sftp, path_opti, path_users } = require(`../Configuraciones/paths_vars`);

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto, dbName, useradmin, passadmin } = require('../Configuraciones/ConexionDB');
const conex = require('../Configuraciones/ConStrDB');

const appUser = process.argv.slice(2)[0];
let userInformation;

async function obtenerDBNamePorAppUser(appUser) {
  const passadminDeCripta = await getDecryptedPassadmin();
  const mongoUri = conex.getUrl(useradmin, passadminDeCripta, host, puerto, dbName);
    
  const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
  try {
    await client.connect();
    const database = client.db('OptiBTC');
    const coleccion = database.collection('usuarios');
    const resultado = await coleccion.findOne(
      {
        "UserUI.AppUser": appUser,
        "UserUI.Activo": 1
      }
    );
    
    if (!resultado) {
      console.log(`No se encontró el usuario: ${appUser}`);
      return;
    }

    const parametroFolder = resultado.UserDB[0].DBName;

    if (resultado && resultado.UserUI) {
      userInformation = resultado.UserUI.find(user => user.AppUser === appUser);
      
      if (!userInformation) {
        console.log(`No se encontró el subdocumento para el AppUser: ${appUser}`);
        return;
      }
    } else {
      console.log(`No se encontró el documento para el AppUser: ${appUser}`);
      return;
    }

    const var_AppUser = userInformation.AppUser;
    const var_AppPassword = userInformation.AppPassword;
    const var_Type = userInformation.Type;
    const var_UserName = userInformation.UserName;
    const var_UserTitle = userInformation.UserTitle;
    const var_UserCompany = userInformation.CompanyName;
    const var_DBUser = resultado.UserDB[0].DBUser;
    const var_DBPassword = resultado.UserDB[0].DBPassword;
    const var_DBName = resultado.UserDB[0].DBName;
    const var_Rol = userInformation.rol || "No asignado";

    // PowerBI credentials - with validation
    let var_PwBiUser = "";
    let var_PwBiPassword = "";
    let var_PwBiURL = "";

    if (resultado.UserPwBi && resultado.UserPwBi.length > 0) {
      var_PwBiUser = resultado.UserPwBi[0].PwBiUser || "";
      var_PwBiPassword = resultado.UserPwBi[0].PwBiPassword || "";
      var_PwBiURL = resultado.UserPwBi[0].PwBiURL || "";
    } else {
      console.log(`  PowerBI no configurado para el usuario: ${appUser}`);
    }

    const archivos = [
      { 
        nombre: '00_Verifica_Folders_v3.js', 
        parametros: `${parametroFolder} ${var_AppUser}` 
      },
      { 
        nombre: '01_Crea_uservars_v4.js', 
        parametros: `${parametroFolder} ${var_AppUser} ${var_AppPassword} ${var_Type} ${var_DBUser} ${var_DBPassword} ${var_DBName} "${var_UserName}" "${var_UserTitle}" "${var_UserCompany}" ${var_PwBiUser} ${var_PwBiPassword} ${var_PwBiURL} ${var_Rol}` 
      }
    ];

    ejecutarArchivos(archivos);

  } catch (error) {
    console.error('Error al obtener información del usuario:', error);
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
      console.error(`Error ejecutando ${archivo.nombre}:`, error.message);
      return;
    }
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
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