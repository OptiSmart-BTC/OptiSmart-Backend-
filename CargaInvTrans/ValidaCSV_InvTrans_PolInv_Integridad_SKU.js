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
const logFile = `../../${parametroFolder}/log/LogdeCargaInvTransCSV.log`;
const csvPath = `../../${parametroFolder}/reportes/InvTrans_PolInv_SKU_No_Encontrados.csv`;

const csvWriterOptions = {
  path: csvPath,
  header: [
    { id: 'SKU', title: 'SKU' },
    { id: 'Ubicacion', title: 'Ubicacion' },
    { id: 'Producto', title: 'Producto' },
    { id: 'Cantidad_Transito', title: 'Cantidad_Transito' }
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
    const ColeccionComparada = db.collection('inventario_transito');
    const ColeccionRespaldo = db.collection('report_sin_sku_invtrans_vs_polinv');

    // Verificar ambas políticas para determinar cuál usar
    const politicaDiariaCount = await db.collection('politica_inventarios_01').countDocuments();
    const politicaSemanalCount = await db.collection('politica_inventarios_01_sem').countDocuments();
    
    writeToLog(`\tPolitica diaria tiene ${politicaDiariaCount} registros.`);
    writeToLog(`\tPolitica semanal tiene ${politicaSemanalCount} registros.`);

    let skus = [];
    let politicaUsada = '';

    // Decidir qué política usar basado en la cantidad de SKUs
    if (politicaSemanalCount > politicaDiariaCount) {
      // La semanal tiene más registros, probablemente más actualizada
      const skuDocs = await db.collection('politica_inventarios_01_sem').find({}).toArray();
      skus = skuDocs.map((doc) => doc.SKU);
      politicaUsada = 'politica_inventarios_01_sem (Semanal)';
      writeToLog(`\tUsando politica semanal porque tiene mas SKUs (${politicaSemanalCount} vs ${politicaDiariaCount}).`);
    } else if (politicaDiariaCount > 0) {
      // La diaria tiene datos y es mayor o igual a la semanal
      const skuDocs = await db.collection('politica_inventarios_01').find({}).toArray();
      skus = skuDocs.map((doc) => doc.SKU);
      politicaUsada = 'politica_inventarios_01 (Diaria)';
      writeToLog(`\tUsando politica diaria porque tiene ${politicaDiariaCount} SKUs (>= semanal: ${politicaSemanalCount}).`);
    } else if (politicaSemanalCount > 0) {
      // La diaria está vacía, usar la semanal como respaldo
      const skuDocs = await db.collection('politica_inventarios_01_sem').find({}).toArray();
      skus = skuDocs.map((doc) => doc.SKU);
      politicaUsada = 'politica_inventarios_01_sem (Semanal - Respaldo)';
      writeToLog(`\tPolitica diaria vacia. Usando semanal como respaldo con ${politicaSemanalCount} SKUs.`);
    }

    // Verificar que al menos una política tenga datos
    if (skus.length === 0) {
      writeToLog(`\tERROR: Ambas politicas estan vacias. No se puede validar integridad.`);
      return;
    }

    // Buscar SKUs que NO están en la política seleccionada
    const skusNoEncontrados = await ColeccionComparada.find({ SKU: { $nin: skus } }).toArray();

    writeToLog(`\tPolitica usada: ${politicaUsada}`);
    writeToLog(`\tSKUs en politica: ${skus.length}`);
    writeToLog(`\tRegistros en inventario transito: ${await ColeccionComparada.countDocuments()}`);
    writeToLog(`\tSKUs sin coincidencia: ${skusNoEncontrados.length}`);

    if (skusNoEncontrados.length === 0) {
      writeToLog(`\tIntegridad de SKUs correcta. Todos los SKUs del inventario transito coinciden con la politica.`);
      return;
    }

    // Mostrar algunos ejemplos de SKUs no encontrados para debug
    const ejemplosNoEncontrados = skusNoEncontrados.slice(0, 5).map(doc => doc.SKU);
    writeToLog(`\tEjemplos de SKUs no encontrados: ${ejemplosNoEncontrados.join(', ')}`);

    // Generar CSV y respaldo
    const registrosFormateados = skusNoEncontrados.map((registro) => ({
      SKU: registro.SKU,
      Ubicacion: registro.Ubicacion,
      Producto: registro.Producto,
      Cantidad_Transito: registro.Cantidad_Transito
    }));

    const csvWriter = createCsvWriter(csvWriterOptions);
    await csvWriter.writeRecords(registrosFormateados);

    const documentosAInsertar = skusNoEncontrados.map((registro) => ({
      _id: registro._id,
      SKU: registro.SKU,
      Ubicacion: registro.Ubicacion,
      Producto: registro.Producto,
      Cantidad_Transito: registro.Cantidad_Transito
    }));

    await ColeccionRespaldo.deleteMany({});
    await ColeccionRespaldo.insertMany(documentosAInsertar);

    const skusNoEncontradosIds = skusNoEncontrados.map((registro) => registro._id);
    await ColeccionComparada.deleteMany({ _id: { $in: skusNoEncontradosIds } });

    writeToLog(`\tSe encontraron ${skusNoEncontradosIds.length} registros en el Inventario Transito sin coincidencia en ${politicaUsada}.`);
    writeToLog(`\tSe eliminaron dichos registros para evitar errores en los calculos.`);
    writeToLog(`\tCSV generado: ${csvPath}`);

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