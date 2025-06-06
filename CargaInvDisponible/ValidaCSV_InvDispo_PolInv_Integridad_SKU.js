const fs = require('fs');
const moment = require('moment');
const { MongoClient } = require('mongodb');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const { DBUser, DBPassword, DBName } = require(`../../${parametroFolder}/cfg/dbvars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaInvDispoCSV.log`;
const csvPath = `../../${parametroFolder}/reportes/InvDisp_PolInv_SKU_No_Encontrados.csv`;

const csvWriterOptions = {
  path: csvPath,
  header: [
    { id: 'SKU', title: 'SKU' },
    { id: 'Ubicacion', title: 'Ubicacion' },
    { id: 'Producto', title: 'Producto' },
    { id: 'Inventario_Disponible', title: 'Inventario_Disponible' }
  ],
};

async function main() {
  const passadminDeCripta = await getDecryptedPassadmin();
  const mongoUri = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
  const client = new MongoClient(mongoUri);

  writeToLog(`\nPaso 08 - Validacion de Integridad de los SKU de la Politica de Inventarios.`);

  try {
    if (fs.existsSync(csvPath)) {
      fs.unlinkSync(csvPath);
      console.log(`El archivo ${csvPath} ha sido eliminado.`);
    }

    await client.connect();
    const db = client.db(dbName);
    const ColeccionComparada = db.collection('inventario_disponible');
    const ColeccionRespaldo = db.collection('report_sin_sku_invdisp_vs_polinv');

    // 1️⃣ Primero valida contra politica_inventarios_01
    let skuDocs = await db.collection('politica_inventarios_01').find({}).toArray();
    let skus = skuDocs.map((doc) => doc.SKU);

    let skusNoEncontrados = await ColeccionComparada.find({ SKU: { $nin: skus } }).toArray();

    // 2️⃣ Si todavía quedan registros sin coincidencia, valida contra politica_inventarios_01_sem
    if (skusNoEncontrados.length > 0 && skuDocs.length > 0) {
      writeToLog(`\tValidando también contra politica_inventarios_01_sem...`);
      skuDocs = await db.collection('politica_inventarios_01_sem').find({}).toArray();
      skus = skuDocs.map((doc) => doc.SKU);

      // Revalida solo los que no encontró antes
      const idsNoEncontradosAntes = skusNoEncontrados.map((doc) => doc._id);
      skusNoEncontrados = await ColeccionComparada.find({
        _id: { $in: idsNoEncontradosAntes },
        SKU: { $nin: skus }
      }).toArray();
    }

    if (skusNoEncontrados.length === 0) {
      writeToLog(`\tIntegridad de SKUs correcta.`);
      return;
    }

    const registrosFormateados = skusNoEncontrados.map((registro) => ({
      SKU: registro.SKU,
      Ubicacion: registro.Ubicacion,
      Producto: registro.Producto,
      Inventario_Disponible: registro.Inventario_Disponible
    }));

    const csvWriter = createCsvWriter(csvWriterOptions);
    await csvWriter.writeRecords(registrosFormateados);

    const documentosAInsertar = skusNoEncontrados.map((registro) => ({
      _id: registro._id,
      SKU: registro.SKU,
      Ubicacion: registro.Ubicacion,
      Producto: registro.Producto,
      Inventario_Disponible: registro.Inventario_Disponible
    }));

    await ColeccionRespaldo.deleteMany({});
    await ColeccionRespaldo.insertMany(documentosAInsertar);

    const skusNoEncontradosIds = skusNoEncontrados.map((registro) => registro._id);
    await ColeccionComparada.deleteMany({ _id: { $in: skusNoEncontradosIds } });

    writeToLog(`\tSe encontraron ${skusNoEncontradosIds.length} registros en el Inventario Disponible sin coincidencia en ninguna política.`);
    writeToLog(`\tSe eliminan dichos registros para evitar errores en los calculos`);
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
  } finally {
    await client.close();
  }
}

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

main().catch(console.error);
