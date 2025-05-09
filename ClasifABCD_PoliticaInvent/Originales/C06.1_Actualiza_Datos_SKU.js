const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');

// Desestructuramos las variables de configuración de la base de datos
const { host, puerto } = require('../Configuraciones/ConexionDB');

// Extraemos los parámetros de la línea de comandos
const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

// Construimos la URL de conexión a la base de datos
const mongoUri = conex.getUrl(DBUser, DBPassword, host, puerto, dbName);

// Obtenemos el parámetro para configurar la ruta del archivo de log
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

// Definimos las colecciones que usaremos
const collection1 = 'demanda_abcd_01';
const collection2 = 'sku';

// Función principal para actualizar las descripciones SKU
async function actualizarDatos() {
  // Registramos el inicio de la operación
  writeToLog(`\nPaso 06.1 - Actualizacion de Descripciones SKU`);

  let client;
  try {
    // Conectamos al cliente de MongoDB
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    // Definimos las colecciones donde vamos a realizar la operación
    const col1 = db.collection(collection1);
    const col2 = db.collection(collection2);

    // Realizamos un join entre las dos colecciones y seleccionamos los campos necesarios
    const result = await col1.aggregate([
      {
        $lookup: {
          from: collection2,            // Especificamos la segunda colección
          localField: 'SKU',             // Campo común en la colección 1
          foreignField: 'SKU',          // Campo común en la colección 2
          as: 'joinedData'              // Alias para los datos combinados
        }
      },
      {
        $unwind: '$joinedData'           // Aplanamos el array resultante del join
      },
      {
        $set: {
          // Establecemos los campos que queremos agregar a la colección 1
          'Desc_Producto': '$joinedData.Desc_Producto',
          'Familia_Producto': '$joinedData.Familia_Producto',
          'Categoria': '$joinedData.Categoria',
          'Segmentacion_Producto': '$joinedData.Segmentacion_Producto',
          'Presentacion': '$joinedData.Presentacion',
          'Desc_Ubicacion': '$joinedData.Desc_Ubicacion'
        }
      }
    ]).toArray();  // Convertimos el resultado de la operación a un array

    console.log(result);  // Mostramos el resultado para depuración

    // Ahora actualizamos la colección 1 con los datos obtenidos del join
    for (const doc of result) {
      await col1.updateOne(
        { _id: doc._id },  // Filtramos por el _id de cada documento
        {
          $set: {
            Desc_Producto: doc.Desc_Producto,
            Familia_Producto: doc.Familia_Producto,
            Categoria: doc.Categoria,
            Segmentacion_Producto: doc.Segmentacion_Producto,
            Presentacion: doc.Presentacion,
            Desc_Ubicacion: doc.Desc_Ubicacion
          }
        }
      );
    }

    // Registramos el fin de la operación
    writeToLog(`\tTermina la Actualizacion de Descripciones SKU`);
  } catch (error) {
    // Si ocurre un error, lo registramos en el log
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    // Cerramos la conexión al cliente MongoDB
    if (client) {
      client.close();
    }
  }
}

// Función para escribir mensajes en el archivo de log
function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Llamamos a la función principal para realizar la actualización
actualizarDatos().catch(console.error);
