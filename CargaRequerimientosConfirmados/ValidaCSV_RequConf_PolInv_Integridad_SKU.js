const fs = require('fs');
const moment = require('moment');
const { MongoClient } = require('mongodb');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
//const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);
const { DBUser, DBPassword, DBName } = require(`../../${parametroFolder}/cfg/dbvars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaRequConfCSV.log`; // Cambia esta ruta según la ubicación de tu archivo CSV
const csvPath = `../../${parametroFolder}/reportes/ReqConf_PolInv_SKU_No_Encontrados.csv`;

//const mongoUri = `mongodb://${host}:${puerto}/${dbName}`;



const csvWriterOptions = {
  path: csvPath,
  header: [
    { id: 'SKU', title: 'SKU' },
    { id: 'Ubicacion', title: 'Ubicacion' },
    { id: 'Producto', title: 'Producto' },
    { id: 'Cliente', title: 'Cliente' },
    { id: 'Cantidad_Confirmada', title: 'Cantidad_Confirmada' }
  ],
};


async function main() {
  //const mongoUri = `mongodb://dbTEST05:dfgh2354ikofhdsf@${host}:${puerto}/${dbName}?authSource=admin`;
  const passadminDeCripta = await getDecryptedPassadmin();
  const mongoUri = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
  const client = new MongoClient(mongoUri);

  writeToLog(`\nPaso 08 - Validacion de Integridad de los SKU de la Politica de Inventarios.`);

  try {

    // Comprueba si el archivo existe
    if (fs.existsSync(csvPath)) {
      // Elimina el archivo si existe
      fs.unlinkSync(csvPath);
      console.log(`El archivo ${csvPath} ha sido eliminado.`);
    } else {
      console.log(`El archivo ${csvPath} no existe, no se ha realizado ninguna acción.`);
    }

    
    
    
    


    await client.connect();

    const db = client.db(dbName);
    //const skuCollection = db.collection('sku');
    //const historicoDemandaCollection = db.collection('historico_demanda');
    const CollectionComparacion = db.collection('politica_inventarios_01');
    const ColeccionComparada = db.collection('requerimientos_confirmados');
    const ColeccionRespaldo = db.collection('report_sin_sku_reqconf_vs_polinv');

    const skuDocs = await CollectionComparacion.find({}).toArray();
    const skus = skuDocs.map((doc) => doc.SKU);

    const skusNoEncontrados = await ColeccionComparada
      .find({ SKU: { $nin: skus } })
      .toArray();

    if (skusNoEncontrados.length === 0) {
      writeToLog(`\tIntegridad de SKUs correcta.`);
      return;
    }

    // Formatear la fecha en el formato "DD/MM/YYYY"
    const registrosFormateados = skusNoEncontrados.map((registro) => {
     // const fecha = registro.Fecha.toISOString().substring(8, 10) + '/' +
       // registro.Fecha.toISOString().substring(5, 7) + '/' +
        //registro.Fecha.toISOString().substring(0, 4);
        
      return {
        SKU: registro.SKU,
        Ubicacion: registro.Ubicacion,
        Producto: registro.Producto,
        Cliente: registro.Cliente,
        Cantidad_Confirmada: registro.Cantidad_Confirmada
      };
    });

    const csvWriter = createCsvWriter(csvWriterOptions);
    await csvWriter.writeRecords(registrosFormateados);


    const documentosAInsertar = skusNoEncontrados.map((registro) => {
      return {
        _id: registro._id,
        SKU: registro.SKU,
        Ubicacion: registro.Ubicacion,
        Producto: registro.Producto,
        Cliente: registro.Cliente,
        Cantidad_Confirmada: registro.Cantidad_Confirmada
      };
    });
    

    await ColeccionRespaldo.deleteMany({});
    await ColeccionRespaldo.insertMany(documentosAInsertar);


    const skusNoEncontradosIds = skusNoEncontrados.map((registro) => registro._id);
    await ColeccionComparada.deleteMany({ _id: { $in: skusNoEncontradosIds } });

    writeToLog(`\tSe encontraron ${skusNoEncontradosIds.length} registros en los Requerimientos Confirmados cargados con problemas de Integridad de SKUs`);
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


// Obtener el valor desencriptado de passadmin
async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}



main().catch(console.error);
