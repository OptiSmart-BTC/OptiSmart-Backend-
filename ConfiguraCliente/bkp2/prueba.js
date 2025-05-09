const { MongoClient } = require('mongodb');

const appUser = process.argv.slice(2)[0];

// La URL de conexión a tu base de datos MongoDB
const url = 'mongodb://admin:btc0pt1@127.0.0.1:27017/?authSource=admin'; 

async function obtenerDBNamePorAppUser(appUser) {
  const client = new MongoClient(url, { useUnifiedTopology: true });

  try {
    await client.connect();

    const database = client.db('OptiBTC'); // Cambia el nombre de la base de datos
    const coleccion = database.collection('usuarios'); // Cambia el nombre de la colección

    const resultado = await coleccion.findOne({ "UserUI.AppUser": appUser });

    if (resultado) {
      return resultado.UserDB[0].DBName;
    } else {
      console.log(`No se encontró el documento para el AppUser: ${appUser}`);
      return null;
    }
  } finally {
    await client.close();
  }
}

// Uso de la función
//const appUser = 'JorgeATB';
obtenerDBNamePorAppUser(appUser)
  .then(dbName => {
    if (dbName) {
      console.log(`El DBName para ${appUser} es: ${dbName}`);
    }
  })
  .catch(error => console.error(error));
