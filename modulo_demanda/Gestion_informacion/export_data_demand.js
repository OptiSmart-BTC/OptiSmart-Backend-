const fs = require('fs');
const { MongoClient } = require('mongodb');
const moment = require('moment-timezone');
const path = require('path');

// Parámetros recibidos por la línea de comandos
const dbName = process.argv[2];
const user = process.argv[3];
const selectedCollection = process.argv[4]; // Colección seleccionada por el usuario

// Ruta temporal para exportar el CSV según la colección seleccionada
const csvFilePath = path.join(__dirname, '..', 'exports', `${selectedCollection}_${user}.csv`);


// Importar las configuraciones del cliente
const { decryptData } = require('../DeCriptaPassAppDb');
const { host, puerto } = require('../../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../../${user}/cfg/dbvars`);

// Función para obtener la contraseña desencriptada y conectarse a MongoDB
async function getMongoClient() {
  const passadminDeCripta = await decryptData(DBPassword);
  const mongoURI = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/?authSource=admin`;
  return new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
}

// Función para exportar los datos a CSV sin la hora en las fechas
async function exportDataToCSV() {
  try {
    console.log(`Iniciando la exportación de la colección ${selectedCollection}_${user}...`);

    // Conectar a MongoDB
    const client = await getMongoClient();
    await client.connect();
    const db = client.db(`btc_opti_${dbName}`);
    const collectionName = `${selectedCollection}_${user}`;
    const collection = db.collection(collectionName);

    // Consultar los datos de la colección
    const data = await collection.find({}).toArray();

    // Formatear los datos y preparar las filas de CSV según la colección seleccionada
    let csvHeader, csvRows;

    switch (selectedCollection) {
      case 'historico_demanda':
        csvHeader = 'Product,Channel,Loc,Fecha,Cantidad\n';
        csvRows = data.map(record => ({
          Product: record.Product,
          Channel: record.Channel,
          Loc: record.Loc,
          Fecha: moment.utc(record.Fecha).format('YYYY-MM-DD'),
          Cantidad: record.Cantidad
        }));
        break;

      case 'Listado_productos':
        csvHeader = 'Producto,Desc\n';
        csvRows = data.map(record => ({
          Producto: record.Producto,
          Desc: record.Desc
        }));
        break;

      case 'Listado_canales':
        csvHeader = 'Canal,Desc\n';
        csvRows = data.map(record => ({
          Canal: record.Canal,
          Desc: record.Desc
        }));
        break;

      case 'Listado_ubicaciones':
        csvHeader = 'Ubicacion,Desc\n';
        csvRows = data.map(record => ({
          Ubicacion: record.Ubicacion,
          Desc: record.Desc
        }));
        break;

      default:
        console.error('Colección no válida seleccionada');
        client.close();
        return;
    }

    // Escribir los datos formateados a CSV
    const csvStream = fs.createWriteStream(csvFilePath);
    csvStream.write(csvHeader); // Escribir el encabezado del CSV
    csvRows.forEach(row => {
      csvStream.write(Object.values(row).join(',') + '\n');
    });
    csvStream.end();

    console.log(`Datos exportados correctamente a ${csvFilePath}`);
    client.close();
  } catch (error) {
    console.error(`Error al exportar a CSV: ${error.message}`);
  }
}

// Ejecutar la función de exportación
exportDataToCSV();
