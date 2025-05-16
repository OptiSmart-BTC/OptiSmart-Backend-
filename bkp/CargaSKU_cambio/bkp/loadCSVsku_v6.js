const fs = require('fs');
const csv = require('csv-parser');
const { MongoClient } = require('mongodb');
const conex= require('../../Configuraciones/ConStrDB');

//const moment = require('moment');

const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];

const { decryptData } = require('../DeCriptaPassAppDb');
const { host, puerto } = require('../../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`; 


const collectionName = 'sku'; // Cambia el nombre de la colección en la que deseas cargar los registros
const csvFilePath = `../../${parametroFolder}/csv/sku.csv`; // Cambia esta ruta según la ubicación de tu archivo CSV



async function insertCSVDataToMongoDB() {
  try {

    const passadminDeCripta = await getDecryptedPassadmin();
    //const mongoURI = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
    const mongoUri =  conex.getUrl(DBUser,passadminDeCripta,host,puerto,dbName);


    writeToLog(`\nPaso 04 - Carga del CSV de SKU`);
   
    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });

    const db = client.db();

    // Leer el archivo CSV y insertar los registros en MongoDB
    const results = [];
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => {
        const transformedData = {
          SKU: `${String(data.Producto)}@${String(data.Ubicacion)}`, 
          Producto: String(data.Producto), 
          Desc_Producto: String(data.Desc_Producto),
          Familia_Producto: String(data.Familia_Producto), 
          Categoria: String(data.Categoria), 
          Segmentacion_Producto: String(data.Segmentacion_Producto), 
          Ubicacion: String(data.Ubicacion), 
          Desc_Ubicacion: String(data.Desc_Ubicacion), 
          OverrideClasificacionABCD: String(data.OverrideClasificacionABCD), 
          OverrideSafetyStock_UOM_Base: String(data.OverrideSafetyStock_UOM_Base), 
          MargenUnitario: data.MargenUnitario,
          LeadTime_Abasto_Dias: Number(data.LeadTime_Abasto_Dias), 
          Frecuencia_Revision_Dias: Number(data.Frecuencia_Revision_Dias), 
          Fill_Rate: Number(data.Fill_Rate), 
          MOQ: Number(data.MOQ), 
          Tamano_Lote: Number(data.Tamano_Lote), 
          Unidades_Pallet: Number(data.Unidades_Pallet), 
          Costo_Unidad: Number(data.Costo_Unidad), 
          Tolerancia_Vida_Util_Dias: Number(data.Tolerancia_Vida_Util_Dias),
          Vida_Util_Dias: Number(data.Vida_Util_Dias),
          Unidad_Medida_UOM: String(data.Unidad_Medida_UOM), 
          Presentacion:	String(data.Presentacion), 
          Desc_Empaque_UOM_Base: String(data.Desc_Empaque_UOM_Base), 
          Unidades_Empaque: Number(data.Unidades_Empaque), 
        };
        results.push(transformedData);
      })
      .on('end', async () => {
        const collection = db.collection(collectionName);
        await collection.deleteMany({});
        await collection.insertMany(results);
        const numRegistrosCargados = results.length;
        fs.appendFileSync(logFile, `\tNúmero de registros cargados: ${numRegistrosCargados}\n`);
        client.close();
      });



      
  } catch (error) {

    writeToLog(`Error: ${error}`);

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



insertCSVDataToMongoDB();
