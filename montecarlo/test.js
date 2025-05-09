const { MongoClient } = require('mongodb');
const { decryptData } = require("./DeCriptaPassAppDb");
const { host, puerto, passadmin } = require("../Configuraciones/ConexionDB");

const parametroUsuario = process.argv.slice(2)[0];
const { GB_DBName } = require(`../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`);
const parametroFolder = GB_DBName.toUpperCase();
const { DBUser, DBPassword, DBName } = require(`../../${parametroFolder}/cfg/dbvars`);
const dbName = `btc_opti_${DBName}`;

function conexionURL(dbUser, dbPassword, host, port, dbName) {
  return `mongodb://${dbUser}:${dbPassword}@${host}:${port}/?authSource=admin`;
}

async function getUserType(userId) {
  passAdminDecripta = await getDecryptedPassadmin();
  const url = conexionURL("OptiBTC", passAdminDecripta, host, puerto, dbName);

  const client = await MongoClient.connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    const db = client.db(dbName);
    const userDoc = await db.collection("usuarios").findOne({ "UserUI.AppUser": userId });

    if (userDoc) {
      const user = userDoc.UserUI.find((u) => u.AppUser === userId);
      if (user) {
        return { userType: user.Type };
      } else {
        throw new Error("Usuario no encontrado en UserUI");
      }
    } else {
      throw new Error("Documento de usuario no encontrado");
    }
  } catch (error) {
    throw new Error(`Error al conectar con la base de datos: ${error.message}`);
  } finally {
    client.close();
  }
}

getUserType().catch((error) => {
  console.error(error.message);
});

async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error("Error al desencriptar el passadmin:", error);
    throw error;
  }
}

function conexionURL(dbUser, dbPassword, host, port, dbName) {
  return `mongodb://${dbUser}:${dbPassword}@${host}:${port}/?authSource=admin`;
}