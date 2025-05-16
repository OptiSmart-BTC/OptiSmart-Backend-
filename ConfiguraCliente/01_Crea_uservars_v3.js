//const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
//const { decryptData } = require('./DeCriptaPassAppDb');
//const { host, puerto, useradmin, passadmin } = require('../Configuraciones/ConexionDB');
//const conex= require('../Configuraciones/ConStrDB');

const parametroFolder = process.argv.slice(2)[0];
const p_AppUser = process.argv.slice(2)[1];
const p_AppPassword = process.argv.slice(2)[2];
const p_Type = process.argv.slice(2)[3];
const p_DBUser = process.argv.slice(2)[4];
const p_DBPassword = process.argv.slice(2)[5];
const p_DBName = process.argv.slice(2)[6];
const p_UserName = process.argv.slice(2)[7];
const p_UserTitle = process.argv.slice(2)[8];
const p_UserCompany = process.argv.slice(2)[9];




async function main() {
  try {

    const fileusrName = `../../${parametroFolder}/cfg/${p_AppUser}.uservars.js`;
    if (fs.existsSync(fileusrName)) {
      fs.unlinkSync(fileusrName);
      console.log(`Archivo "${fileusrName}" existente eliminado.`);
    }

    const fileusrContent = `const AppUser = "${p_AppUser}";
const AppPassword = "${p_AppPassword}";
const Type = "${p_Type}";
const UserName = "${p_UserName}";
const UserTitle = "${p_UserTitle}";
const UserCompany = "${p_UserCompany}";

module.exports = {
  AppUser,
  AppPassword,
  Type,
  UserName,
  UserTitle,
  UserCompany
};`;

    // Escribir el contenido en el archivo
    await fs.promises.writeFile(fileusrName, fileusrContent);
    console.log(`Se ha creado el archivo "${fileusrName}" con éxito.`);

//--------------------------------------------------------------------

if (p_Type === 'A') {

  const filedbName = `../../${parametroFolder}/cfg/dbvars.js`;
  if (fs.existsSync(filedbName)) {
    fs.unlinkSync(filedbName);
    console.log(`Archivo "${filedbName}" existente eliminado.`);
  }

const filedbContent = `const DBUser = "${p_DBUser}";
const DBPassword = "${p_DBPassword}";
const DBName = "${p_DBName}";

module.exports = {
DBUser,
DBPassword,
DBName
};`;

// Escribir el contenido en el archivo
await fs.promises.writeFile(filedbName, filedbContent);
console.log(`Se ha creado el archivo "${filedbName}" con éxito.`);

}

//--------------------------------------------------------------------

  const filedbName2 = `../Configuraciones/dbUsers/${p_AppUser}.dbnamevar.js`;
  if (fs.existsSync(filedbName2)) {
    fs.unlinkSync(filedbName2);
    console.log(`Archivo "${filedbName2}" existente eliminado.`);
  }

const filedbContent2 = `const GB_DBName = "${p_DBName}";

module.exports = {
  GB_DBName
};`;

// Escribir el contenido en el archivo
await fs.promises.writeFile(filedbName2, filedbContent2);
console.log(`Se ha creado el archivo "${filedbName2}" con éxito.`);



    //client.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
