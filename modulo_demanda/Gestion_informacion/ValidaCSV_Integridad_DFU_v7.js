const fs = require('fs');
const moment = require('moment');
const { MongoClient } = require('mongodb');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const dbName = process.argv[2];
const parametroFolder = process.argv[3];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../../${parametroFolder}/cfg/dbvars`);
const logFile = `../../../${parametroFolder}/log/Logs_demanda.log`;
const csvPath = `../../../${parametroFolder}/reportes/DFU_No_Validos.csv`;

const csvWriterOptions = {
  path: csvPath,
  header: [
    { id: 'DFU', title: 'DFU' },
    { id: 'Producto', title: 'Producto' },
    { id: 'Canal', title: 'Canal' },
    { id: 'Ubicacion', title: 'Ubicación' },
    { id: 'Fecha', title: 'Fecha' },
    { id: 'Cantidad', title: 'Cantidad' }
  ],
};

async function main() {
  const passadminDeCripta = await getDecryptedPassadmin();
  const mongoUri = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
  const client = new MongoClient(mongoUri);

  writeToLog(`\nPaso 08 - Validación de Integridad de DFUs con colecciones maestras`);

  try {
    if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);

    await client.connect();
    const db = client.db(dbName);
    const user = parametroFolder.toLowerCase();
    const historiaCollection = db.collection(`historico_demanda_${user}`);
    const respaldoCollection = db.collection('report_sin_dfu_validos');

    // Verificar registros antes de la validación
    const countBefore = await historiaCollection.countDocuments();
    writeToLog(`\tNúmero de registros antes de la validación: ${countBefore}`);
    
    if (countBefore === 0) {
      writeToLog(`\tATENCIÓN: La colección historico_demanda_${user} está vacía. No se pueden validar DFUs.`);
      return;
    }

    // CAMBIO CLAVE: Usar las colecciones con el sufijo del usuario
    const productosCollection = `Listado_productos_${user}`;
    const canalesCollection = `Listado_canales_${user}`;
    const ubicacionesCollection = `Listado_ubicaciones_${user}`;

    // Verificar existencia de colecciones maestras
    const productosCount = await db.collection(productosCollection).countDocuments();
    const canalesCount = await db.collection(canalesCollection).countDocuments();
    const ubicacionesCount = await db.collection(ubicacionesCollection).countDocuments();

    writeToLog(`\tColección ${productosCollection} contiene ${productosCount} registros.`);
    writeToLog(`\tColección ${canalesCollection} contiene ${canalesCount} registros.`);
    writeToLog(`\tColección ${ubicacionesCollection} contiene ${ubicacionesCount} registros.`);

    // Si alguna colección maestra está vacía, DETENER el proceso con error
    if (productosCount === 0 || canalesCount === 0 || ubicacionesCount === 0) {
      const errorMsg = `ERROR: Las colecciones maestras (${productosCollection}, ${canalesCollection}, ${ubicacionesCollection}) deben contener datos antes de procesar el histórico.`;
      writeToLog(`\t${errorMsg}`);
      writeToLog(`\tDebe cargar primero los datos en las colecciones maestras antes de procesar el histórico.`);
      
      // Finalizar con error para detener el proceso
      await client.close();
      process.exit(1);
      return;
    }

    // Obtener las listas válidas con el nombre correcto de las colecciones
    const productosValidos = await db.collection(productosCollection).distinct('Producto');
    const canalesValidos = await db.collection(canalesCollection).distinct('Canal');
    const ubicacionesValidas = await db.collection(ubicacionesCollection).distinct('Ubicacion');

    writeToLog(`\tProductos válidos: ${productosValidos.length}`);
    writeToLog(`\tCanales válidos: ${canalesValidos.length}`);
    writeToLog(`\tUbicaciones válidas: ${ubicacionesValidas.length}`);

    // Leer todo el histórico
    const registros = await historiaCollection.find({}).toArray();

    // Filtrar DFUs inválidos
    const dfusInvalidos = registros.filter(reg => {
      const productoOK = productosValidos.includes(reg.Producto);
      const canalOK = reg.Canal === 'default' || canalesValidos.includes(reg.Canal);
      const ubicacionOK = ubicacionesValidas.includes(reg.Ubicacion);
      return !(productoOK && canalOK && ubicacionOK);
    });

    writeToLog(`\tNúmero de DFUs inválidos encontrados: ${dfusInvalidos.length}`);

    if (dfusInvalidos.length === 0) {
      writeToLog(`\tTodos los DFUs están correctamente referenciados en las colecciones maestras.`);
      return;
    }

    // Si todos los registros son inválidos, también detenemos el proceso
    if (dfusInvalidos.length === countBefore) {
      const errorMsg = `ERROR: Todos los registros (${countBefore}) fueron marcados como inválidos. Verifique que las colecciones maestras contengan los valores correctos.`;
      writeToLog(`\t${errorMsg}`);
      writeToLog(`\tDebe revisar la configuración de las colecciones maestras y asegurarse de que contengan los valores esperados.`);
      
      // Exportar los DFUs inválidos para análisis
      const registrosFormateados = dfusInvalidos.slice(0, 100).map(reg => {
        const fecha = reg.Fecha instanceof Date
          ? reg.Fecha.toISOString().substring(8, 10) + '/' +
            reg.Fecha.toISOString().substring(5, 7) + '/' +
            reg.Fecha.toISOString().substring(0, 4)
          : reg.Fecha;

        return {
          DFU: reg.DFU || `${reg.Producto}@${reg.Canal}@${reg.Ubicacion}`,
          Producto: reg.Producto,
          Canal: reg.Canal,
          Ubicacion: reg.Ubicacion,
          Fecha: fecha,
          Cantidad: reg.Cantidad
        };
      });

      const csvWriter = createCsvWriter(csvWriterOptions);
      await csvWriter.writeRecords(registrosFormateados);
      writeToLog(`\tSe exportaron los primeros 100 registros inválidos al archivo CSV para análisis.`);
      
      // Finalizar con error para detener el proceso
      await client.close();
      process.exit(1);
      return;
    }

    // Exportar DFUs inválidos a CSV
    const registrosFormateados = dfusInvalidos.map(reg => {
      const fecha = reg.Fecha instanceof Date
        ? reg.Fecha.toISOString().substring(8, 10) + '/' +
          reg.Fecha.toISOString().substring(5, 7) + '/' +
          reg.Fecha.toISOString().substring(0, 4)
        : reg.Fecha;

      return {
        DFU: reg.DFU || `${reg.Producto}@${reg.Canal}@${reg.Ubicacion}`,
        Producto: reg.Producto,
        Canal: reg.Canal,
        Ubicacion: reg.Ubicacion,
        Fecha: fecha,
        Cantidad: reg.Cantidad
      };
    });

    const csvWriter = createCsvWriter(csvWriterOptions);
    await csvWriter.writeRecords(registrosFormateados);

    // Respaldo en MongoDB
    await respaldoCollection.deleteMany({});
    await respaldoCollection.insertMany(dfusInvalidos);

    // Eliminar registros inválidos
    const idsAEliminar = dfusInvalidos.map(doc => doc._id);
    await historiaCollection.deleteMany({ _id: { $in: idsAEliminar } });

    // Verificar registros después de la eliminación
    const countAfter = await historiaCollection.countDocuments();
    writeToLog(`\tNúmero de registros después de la eliminación: ${countAfter}`);

    writeToLog(`\tSe eliminaron ${idsAEliminar.length} DFUs no válidos del histórico. Ver CSV de respaldo.`);
  } catch (error) {
    writeToLog(`${now} - Error en validación de DFUs: ${error}`);
    // Asegurar que el proceso termine con error
    process.exit(1);
  } finally {
    await client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
  console.log(message);
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
