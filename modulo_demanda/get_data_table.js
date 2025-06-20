const { MongoClient } = require('mongodb');
const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const fs = require('fs');
const path = require('path');

const selectedTable = process.argv[2]; // Tabla seleccionada
const user = process.argv[3];
const DBName = process.argv[4];
const outputFile = process.argv[5]; // Nuevo parámetro para la ruta del archivo

async function getTableData() {
  if (!selectedTable || !user || !DBName || !outputFile) {
    console.error('Faltan parámetros: selectedTable, appUser, DBName o outputFile.');
    process.exit(1);
  }

  const configPath = path.join(__dirname, `../../${user}/cfg/dbvars`);
  const { DBUser, DBPassword } = require(configPath);

  try {
    const decryptedPassword = await decryptData(DBPassword);
    const mongoURI = `mongodb://${DBUser}:${decryptedPassword}@${host}:${puerto}/?authSource=admin`;

    const client = new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    const db = client.db(`btc_opti_${DBName}`);
    const collectionName = `${selectedTable}_${user}`;
    const collection = db.collection(collectionName);

    let tableData = await collection.find({}).toArray();

    // Si es necesario, puedes agregar lógica de formateo para diferentes tablas
    tableData = tableData.map(item => {
      if (item.Fecha) {
        item.Fecha = new Date(item.Fecha).toISOString().split('T')[0]; // Formato 'YYYY-MM-DD'
      }
      return item;
    });

    await client.close();

    // En lugar de imprimir en stdout, escribir al archivo
    fs.writeFileSync(outputFile, JSON.stringify(tableData));
    
    // Solo imprimir un mensaje de éxito en stdout (esto es pequeño y no causará problemas)
    console.log(`Datos escritos exitosamente en ${outputFile}`);
  } catch (error) {
    console.error('Error al conectar a MongoDB o recuperar datos:', error);
    process.exit(1);
  }
}

getTableData();
