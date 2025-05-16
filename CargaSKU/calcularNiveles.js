const fs = require('fs');
const csvWriter = require('csv-writer').createObjectCsvWriter;
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const moment = require('moment');
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const dbName = process.argv[2];
const parametroFolder = process.argv[3];
const AppUser = process.argv[4];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/dbvars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`;
const outputCsvPath = `../../${parametroFolder}/csv/out/sku_con_niveles.csv`;

function writeToLog(message) {
  fs.appendFileSync(logFile, `${message}\n`);
}

async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}

async function calculateLevels() {
  writeToLog(`\nPaso 07 - Cálculo de Niveles OA (con corrección de autoabastecidos)`);
  try {
    const passadminDeCripta = await getDecryptedPassadmin();
    const mongoUri = conex.getUrl(DBUser, passadminDeCripta, host, puerto, dbName);

    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = client.db();
    const skuCollection = db.collection('sku');

    // 1. Leer todos los documentos
    const skus = await skuCollection.find({}).toArray();

    // 2. Detectar ubicaciones que se autoabastecen
    const autoabastecidos = skus.filter(doc => doc.Ubicacion === doc.Origen_Abasto);
    const origenes = skus.map(doc => doc.Origen_Abasto).filter(Boolean);
    const setOrigenes = new Set(origenes);

    let corregidos = 0;
    for (const doc of autoabastecidos) {
      if (setOrigenes.has(doc.Ubicacion)) {
        await skuCollection.updateMany(
          { Ubicacion: doc.Ubicacion, Origen_Abasto: doc.Ubicacion },
          { $set: { Origen_Abasto: null } }
        );
        corregidos++;
      }
    }
    writeToLog(`\tAutoabastecimientos corregidos: ${corregidos}`);

    // 3. Releer datos ya corregidos
    const skusActualizados = await skuCollection.find({}).toArray();

    // 4. Mapear relaciones de abastecimiento
    const originToDestinations = {};
    skusActualizados.forEach(({ Ubicacion, Origen_Abasto }) => {
      if (Origen_Abasto) {
        if (!originToDestinations[Origen_Abasto]) {
          originToDestinations[Origen_Abasto] = new Set();
        }
        originToDestinations[Origen_Abasto].add(Ubicacion);
      }
    });

    // 5. Calcular niveles OA según reglas corregidas
    const levels = {};
    skusActualizados.forEach(({ Ubicacion, Origen_Abasto }) => {
      const abasteceAotros = originToDestinations[Ubicacion] !== undefined;
      const esAbastecido = Origen_Abasto !== undefined && Origen_Abasto !== null;

      if (!esAbastecido && abasteceAotros) {
        levels[Ubicacion] = 3; // Super almacén
      } else if (esAbastecido && abasteceAotros) {
        levels[Ubicacion] = 2; // Almacén intermedio
      } else {
        levels[Ubicacion] = 1; // Tienda o punto final
      }
    });

    // 6. Actualizar en la colección por SKU concatenado
    const bulkOps = skus.map(({ Producto, Ubicacion }) => {
      const prod = String(Producto).padStart(5, '0');
      const ubi = String(Ubicacion).padStart(4, '0');
      return {
        updateOne: {
          filter: { Producto: prod, Ubicacion: ubi },
          update: { $set: { Nivel_OA: levels[ubi] || 1 } }
        }
      };
    });
    
    const result = await skuCollection.bulkWrite(bulkOps);
    writeToLog(`\tNiveles OA actualizados: ${result.modifiedCount}`);

    // 7. Exportar CSV de salida
    await generateCsvReport(skusActualizados, levels);
    client.close();
  } catch (error) {
    writeToLog(`${now} - Error durante el cálculo de niveles: ${error}`);
    console.error('Error:', error);
  }
}

async function generateCsvReport(skus, levels) {
  const headers = Object.keys(skus[0]).map((key) => ({ id: key, title: key }));
  headers.push({ id: 'Nivel_OA', title: 'Nivel_OA' });
  headers.push({ id: 'Nota', title: 'Nota' });

  const csvWriterInstance = csvWriter({
    path: outputCsvPath,
    header: headers,
  });

  const csvData = skus.map((sku) => ({
    ...sku,
    Nivel_OA: levels[sku.Ubicacion] || 1,
    Nota: !sku.Origen_Abasto ? 'Sin Origen de Abasto' : '',
  }));

  await csvWriterInstance.writeRecords(csvData);
  writeToLog(`\tArchivo CSV generado: ${outputCsvPath}`);
}

calculateLevels();
