//const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
//const { decryptData } = require('./DeCriptaPassAppDb');
//const { host, puerto, useradmin, passadmin } = require('../Configuraciones/ConexionDB');
//const conex= require('../Configuraciones/ConStrDB');

const parametroFolder = process.argv.slice(2)[0];
const p_AppUser = process.argv.slice(2)[1];
const p_AppPassword = process.argv.slice(2)[2];
const p_Tipo = process.argv.slice(2)[3];
const p_DBUser = process.argv.slice(2)[4];
const p_DBPassword = process.argv.slice(2)[5];
const p_DBName = process.argv.slice(2)[6];




async function main() {
  try {

    // Ruta del archivo a crear
    const fileName = `../../${parametroFolder}/cfg/${p_AppUser}.uservars.js`;

    // Verificar si el archivo ya existe y eliminarlo
    if (fs.existsSync(fileName)) {
      fs.unlinkSync(fileName);
      console.log(`Archivo "${fileName}" existente eliminado.`);
    }

    // Crear el contenido del archivo
    const fileContent = `const AppUser = "${p_AppUser}";
const AppPassword = "${p_AppPassword}";
const Tipo = "${p_Tipo}";
const DBUser = "${p_DBUser}";
const DBPassword = "${p_DBPassword}";
const DBName = "${p_DBName}";

module.exports = {
  AppUser,
  AppPassword,
  Tipo,
  DBUser,
  DBPassword,
  DBName
};`;

    // Escribir el contenido en el archivo
    await fs.promises.writeFile(fileName, fileContent);
    console.log(`Se ha creado el archivo "${fileName}" con éxito.`);
    //client.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
