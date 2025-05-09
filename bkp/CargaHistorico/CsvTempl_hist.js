const { MongoClient } = require('mongodb');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');


const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];
 
const { decryptData } = require('../CargaHistorico/DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);
const csvFilePath = `../../${parametroFolder}/templetes/templete-historico_demanda.csv`;


const collectionName = 'historico_demanda';


 
// Campos específicos que se incluirán en el archivo CSV
const desiredFields = [
  'Ubicacion',
  'Producto',
  'Fecha',
  'Cantidad'
];

// Ejemplos específicos para cada tipo de campo
const fieldExamples = {
    Ubicacion: '<<Alfanum>>',
    Producto: '<<Alfanum>>',
    Fecha:'<<Fecha con Formato DD/MM/AAAA>>',
    Cantidad:'<<Numerico Decimal>>'
};

async function generateCsvTemplate() {
  try {
    const passadminDeCripta = await getDecryptedPassadmin();
    const mongoUrl = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;

    const client = await MongoClient.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = client.db(dbName);
    
    // Obtener un solo documento de la colección
    const collection = db.collection(collectionName);
    const document = await collection.findOne();

    if (fs.existsSync(csvFilePath)) {
      // Si existe, eliminar el archivo
      fs.unlinkSync(csvFilePath);
  }
    const csvWriter = createCsvWriter({
      path: csvFilePath,
      header: desiredFields.map(fieldName => ({ id: fieldName, title: fieldName })),
    });

    // Insertar una fila de datos de ejemplo para el documento obtenido
    const exampleData = {};
    desiredFields.forEach(fieldName => {
      exampleData[fieldName] = fieldExamples[fieldName] || document[fieldName] || ''; // Priorizar ejemplo específico, luego valor en el documento, luego cadena vacía
    });

    await csvWriter.writeRecords([exampleData]);

    console.log('Archivo CSV generado con éxito.');

    // Cerrar la conexión a MongoDB
    await client.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

// Llamar a la función para generar el archivo CSV
generateCsvTemplate();


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}



async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}