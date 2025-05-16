const { MongoClient } = require('mongodb');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs/promises'); // Utilizamos fs.promises para trabajar con promesas
//const fs = require('fs');

const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];
 
const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
//const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/dbvars`);
//const csvFilePath = `../../${parametroFolder}/templetes/templete-historico_demanda.csv`;


const collectionName = 'sku';


//const uri = 'mongodb://dbUSR002:ahorasiDB@127.0.0.1:27017/?authSource=admin';

async function exportToCsv() {
  const passadminDeCripta = await getDecryptedPassadmin();
  const uri = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;


  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db(dbName);

//inventario_disponible.csv
    const InvDispocsvFilePath = `../../${parametroFolder}/templates/template-inventario_disponible.csv`;
    const InvDispoCollection = database.collection(collectionName);
    const cursorInvDispo = InvDispoCollection.find({}, { projection: { _id: 0, Producto: 1, Ubicacion: 1 } });
    const InvDispofileExists = await fs.access(InvDispocsvFilePath)
      .then(() => true)
      .catch(() => false);
    if (InvDispofileExists) {
      try {
        await fs.unlink(InvDispocsvFilePath);
      } catch (unlinkError) {

      }
    }
    const InvDispocsvWriter = createCsvWriter({
      path: InvDispocsvFilePath,
      header: [
        { id: 'Producto', title: 'Producto' },
        { id: 'Ubicacion', title: 'Ubicacion' },
        { id: 'Inventario', title: 'Inventario' },
      ],
      fieldDelimiter: ',', 
    });
    const InvDisporecords = await cursorInvDispo.toArray();
    const InvDisporecordsWithEmptyInventory = InvDisporecords.map(record => ({ ...record, Inventario: '0' }));
    await InvDispocsvWriter.writeRecords(InvDisporecordsWithEmptyInventory);
 

    //inventario_transito.csv
    const InvTranscsvFilePath = `../../${parametroFolder}/templates/template-inventario_transito.csv`;
    const InvTransCollection = database.collection(collectionName);
    const cursorInvTrans = InvTransCollection.find({}, { projection: { _id: 0, Producto: 1, Ubicacion: 1 } });
    const InvTransfileExists = await fs.access(InvTranscsvFilePath)
      .then(() => true)
      .catch(() => false);
    if (InvTransfileExists) {
      try {
        await fs.unlink(InvTranscsvFilePath);
      } catch (unlinkError) {

      }
    }
    const InvTranscsvWriter = createCsvWriter({
      path: InvTranscsvFilePath,
      header: [
        { id: 'Producto', title: 'Producto' },
        { id: 'Ubicacion', title: 'Ubicacion' },
        { id: 'Cantidad_Transito', title: 'Cantidad_Transito' },
      ],
      fieldDelimiter: ',', 
    });
    const InvTransrecords = await cursorInvTrans.toArray();
    const InvTransrecordsWithEmptyInventory = InvTransrecords.map(record => ({ ...record, Cantidad_Transito: '0' }));
    await InvTranscsvWriter.writeRecords(InvTransrecordsWithEmptyInventory);
    

    //requerimientos_confirmados.csv
    const RequConfcsvFilePath = `../../${parametroFolder}/templates/template-requerimientos_confirmados.csv`;
    const RequConfCollection = database.collection(collectionName);
    const cursorRequConf = RequConfCollection.find({}, { projection: { _id: 0, Producto: 1, Ubicacion: 1 } });
    const RequConffileExists = await fs.access(RequConfcsvFilePath)
      .then(() => true)
      .catch(() => false);
    if (RequConffileExists) {
      try {
        await fs.unlink(RequConfcsvFilePath);

      } catch (unlinkError) {

      }
    }
    const RequConfcsvWriter = createCsvWriter({
      path: RequConfcsvFilePath,
      header: [
        { id: 'Producto', title: 'Producto' },
        { id: 'Ubicacion', title: 'Ubicacion' },
        { id: 'Cliente', title: 'Cliente' },
        { id: 'Cantidad_Confirmada', title: 'Cantidad_Confirmada' },
      ],
      fieldDelimiter: ',', 
    });
    const RequConfrecords = await cursorRequConf.toArray();
    const RequConfrecordsWithEmptyInventory = RequConfrecords.map(record => ({ ...record, Cliente: '<<Nombre Usuario>>', Cantidad_Confirmada: '0' }));
    await RequConfcsvWriter.writeRecords(RequConfrecordsWithEmptyInventory);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}
// Llamada a la función principal
exportToCsv();


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

