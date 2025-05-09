const fs = require('fs');
const csv = require('csv-parser');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`; 


async function eliminarRegistros() {
  writeToLog(`\nPaso 06 - Limpieza de Filas Vacias`);
  try {
    const passadminDeCripta = await getDecryptedPassadmin();
    const mongoUri =  conex.getUrl(DBUser,passadminDeCripta,host,puerto,dbName);

    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });
    const db = client.db();

    const skuCollection = db.collection('sku');
    

      const skuFilter = {
      SKU: 'undefined@undefined',
      Producto: 'undefined',
      Desc_Producto: 'undefined',
      Familia_Producto: 'undefined',
      Categoria: 'undefined',
      Segmentacion_Producto: 'undefined',
      Ubicacion: 'undefined',
      Desc_Ubicacion: 'undefined',
      OverrideClasificacionABCD: 'undefined',
      Override_Politica_Inventarios: 'undefined',
      Medida_Override: 'undefined',
      Tipo_Override: 'undefined',
      MargenUnitario: null,
      LeadTime_Abasto_Dias: NaN,
      Frecuencia_Revision_Dias: NaN,
      Fill_Rate: NaN,
      MOQ: NaN,
      Tamano_Lote: NaN,
      Unidades_Pallet: NaN,
      Costo_Unidad: NaN,
      Tolerancia_Vida_Util_Dias: NaN,
      Vida_Util_Dias: NaN,
      Unidad_Medida_UOM: 'undefined',
      Presentacion: 'undefined',
      Desc_Empaque_UOM_Base: 'undefined',
      Unidades_Empaque: NaN

    };

    const skuDeleteResult = await skuCollection.deleteMany(skuFilter);
    const numRegistrosSkuEliminados = skuDeleteResult.deletedCount;

    fs.appendFileSync(logFile, `\tRegistros Vacios Eliminados En 'SKU': ${numRegistrosSkuEliminados}`);
    
    client.close();
  } catch (error) {
    writeToLog(`${now} - Error: ${error}`);
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


eliminarRegistros();
