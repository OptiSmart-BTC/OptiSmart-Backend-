const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto, useradmin, passadmin } = require('../Configuraciones/ConexionDB');
const conex= require('../Configuraciones/ConStrDB');

const parametroFolder = process.argv.slice(2)[0];
const p_AppUser = process.argv.slice(2)[0];

// Nombre de la base de datos y colección
const dbName = 'OptiBTC';
const collectionName = 'usuarios';

// Obtener el valor desencriptado de passadmin
async function getDecryptedPassadmin() {
  try {
    return await decryptData(passadmin);
  } catch (error) {
    console.error('Error al desencrip01 tar el passadmin:', error);
    throw error;
  }
}

async function main() {
  try {
    const passadminDeCripta = await getDecryptedPassadmin();

    // URL de conexión a MongoDB
    //const url = `mongodb://${useradmin}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
    const mongoUri =  conex.getUrl(useradmin,passadminDeCripta,host,puerto,dbName);
    console.log(mongoUri);
    // Ruta del archivo a crear
    const fileName = `../../${parametroFolder}/cfg/uservars.js`;

    // Verificar si el archivo ya existe y eliminarlo
    if (fs.existsSync(fileName)) {
      fs.unlinkSync(fileName);
      console.log(`Archivo "${fileName}" existente eliminado.`);
    }

    // Conexión a MongoDB
    const client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Filtro para obtener los documentos con AppUser y Activo=1
    const filter = { AppUser: `${p_AppUser}`, Activo: 1 };

    // Consulta para obtener los campos requeridos
    const result = await collection.findOne(filter);
    if (!result) {
      console.log('No se encontraron documentos que coincidan con el filtro.');
      client.close();
      return;
    }

    // Obtener los valores de los campos
    const { AppUser, AppPassword, DBUser, DBPassword } = result;

    // Crear el contenido del archivo
    const fileContent = `const AppUser = "${AppUser}";
const AppPassword = "${AppPassword}";
const DBUser = "${DBUser}";
const DBPassword = "${DBPassword}";

module.exports = {
  AppUser,
  AppPassword,
  DBUser,
  DBPassword
};`;

    // Escribir el contenido en el archivo
    await fs.promises.writeFile(fileName, fileContent);
    console.log(`Se ha creado el archivo "${fileName}" con éxito.`);
    client.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
