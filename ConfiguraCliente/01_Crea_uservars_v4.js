const fs = require('fs');
const { path_sftp, path_opti, path_users } = require(`../Configuraciones/paths_vars`);

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
const p_PwBiUser = process.argv.slice(2)[10];
const p_PwBiPassword = process.argv.slice(2)[11];
const p_PwBiURL = process.argv.slice(2)[12];
const p_Rol = process.argv.slice(2)[13];

async function main() {
  try {
    console.log('\n=== INICIANDO CREACIÃ“N DE ARCHIVOS DE CONFIGURACIÃ“N ===\n');

    // ==================== CREAR ARCHIVO USERVARS (INDIVIDUAL POR USUARIO) ====================
    const fileusrName = `${path_users}/${parametroFolder}/cfg/${p_AppUser}.uservars.js`;
    if (fs.existsSync(fileusrName)) {
      fs.unlinkSync(fileusrName);
      console.log(`âœ“ Archivo "${fileusrName}" existente eliminado.`);
    }

    const fileusrContent = `const AppUser = "${p_AppUser}";
const AppPassword = "${p_AppPassword}";
const Type = "${p_Type}";
const UserName = "${p_UserName}";
const UserTitle = "${p_UserTitle}";
const UserCompany = "${p_UserCompany}";
const Rol = "${p_Rol}";

module.exports = {
  AppUser,
  AppPassword,
  Type,
  UserName,
  UserTitle,
  UserCompany,
  Rol
};`;

    await fs.promises.writeFile(fileusrName, fileusrContent);
    console.log(` Creado: ${fileusrName}`);

    // ==================== CREAR ARCHIVO DBVARS INDIVIDUAL ====================
    if (p_Type === 'A') {
      // Crear archivo INDIVIDUAL de credenciales para este usuario
      const filedbNameIndividual = `${path_users}/${parametroFolder}/cfg/${p_AppUser}.dbvars.js`;
      
      if (fs.existsSync(filedbNameIndividual)) {
        fs.unlinkSync(filedbNameIndividual);
        console.log(` Archivo "${filedbNameIndividual}" existente eliminado.`);
      }

      const filedbContentIndividual = `const DBUser = "${p_DBUser}";
const DBPassword = "${p_DBPassword}";
const DBName = "${p_DBName}";

module.exports = {
  DBUser,
  DBPassword,
  DBName
};`;

      await fs.promises.writeFile(filedbNameIndividual, filedbContentIndividual);
      console.log(` Creado: ${filedbNameIndividual} (CREDENCIALES INDIVIDUALES)`);

      // ==================== MANTENER DBVARS.JS COMPARTIDO (COMPATIBILIDAD) ====================
      const filedbNameShared = `${path_users}/${parametroFolder}/cfg/dbvars.js`;
      
      if (!fs.existsSync(filedbNameShared)) {
        // Solo crear si no existe (para el primer usuario)
        await fs.promises.writeFile(filedbNameShared, filedbContentIndividual);
        console.log(` Creado: ${filedbNameShared} (archivo compartido - compatibilidad)`);
      } else {
        console.log(`  Archivo compartido "${filedbNameShared}" ya existe (NO se modifica)`);
        console.log(`   â†’ Este usuario (${p_AppUser}) usarÃ¡: ${p_AppUser}.dbvars.js`);
      }
    }

    // ==================== CREAR ARCHIVO DBNAMEVAR (INDIVIDUAL) ====================
    const filedbName2 = `../Configuraciones/dbUsers/${p_AppUser}.dbnamevar.js`;
    if (fs.existsSync(filedbName2)) {
      fs.unlinkSync(filedbName2);
      console.log(` Archivo "${filedbName2}" existente eliminado.`);
    }

    const filedbContent2 = `const GB_DBName = "${p_DBName}";

module.exports = {
  GB_DBName
};`;

    await fs.promises.writeFile(filedbName2, filedbContent2);
    console.log(` Creado: ${filedbName2}`);

    // ==================== CREAR ARCHIVO PWBIUSERVARS (INDIVIDUAL) ====================
    const fileusrNamePwBi = `${path_users}/${parametroFolder}/users/${p_AppUser}/cfg/pwbiuservars.js`;

    if (fs.existsSync(fileusrNamePwBi)) {
      fs.unlinkSync(fileusrNamePwBi);
      console.log(` Archivo "${fileusrNamePwBi}" existente eliminado.`);
    }

    const fileusrPwBiContent = `const PwBiUser = "${p_PwBiUser}";
const PwBiPassword = "${p_PwBiPassword}";
const PwBiURL = "${p_PwBiURL}";

module.exports = {
  PwBiUser,
  PwBiPassword,
  PwBiURL
};`;

    await fs.promises.writeFile(fileusrNamePwBi, fileusrPwBiContent);
    console.log(` Creado: ${fileusrNamePwBi}`);

    console.log("\n===  CONFIGURACIÃ“N COMPLETADA EXITOSAMENTE ===");
    console.log(`\n Resumen:`);
    console.log(`   Usuario: ${p_AppUser}`);
    console.log(`   Base de datos: ${p_DBName}`);
    console.log(`   Archivo de credenciales: ${p_AppUser}.dbvars.js`);
    console.log(`\n Importante: Los scripts deben usar require(\`.../${p_AppUser}.dbvars\`) para cargar estas credenciales.\n`);

  } catch (err) {
    console.error('\n ERROR:', err);
    process.exit(1);
  }
}

main();