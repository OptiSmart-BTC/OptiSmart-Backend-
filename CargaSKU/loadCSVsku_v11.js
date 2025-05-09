const fs = require('fs');
const csv = require('csv-parser');
const { MongoClient, Decimal128, Double } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');

//const moment = require('moment');

const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
//const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/dbvars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`; 


const collectionName = 'sku'; // Cambia el nombre de la colección en la que deseas cargar los registros
const csvFilePath = `../../${parametroFolder}/csv/in/sku.csv`; // Cambia esta ruta según la ubicación de tu archivo CSV



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
        const overrideMinPoliticaInventarios = data.Override_Min_Politica_Inventarios !== '' ? (isNaN(data.Override_Min_Politica_Inventarios) ? String(data.Override_Min_Politica_Inventarios) : Number(data.Override_Min_Politica_Inventarios)) : '';
        const overrideMaxPoliticaInventarios = data.Override_Max_Politica_Inventarios !== '' ? (isNaN(data.Override_Max_Politica_Inventarios) ? String(data.Override_Max_Politica_Inventarios) : Number(data.Override_Max_Politica_Inventarios)) : '';
        const transformedData = {
          SKU: `${String(data.Producto)}@${String(data.Ubicacion)}`, 
          Producto: String(data.Producto), 
          Desc_Producto: String(data.Desc_Producto) ?? ' ',
          Familia_Producto: data.Familia_Producto !== '' ? String(data.Familia_Producto) : 'DEFAULT',
          Categoria: data.Categoria !== '' ? String(data.Categoria) : 'DEFAULT',
          Segmentacion_Producto: data.Segmentacion_Producto !== '' ? String(data.Segmentacion_Producto) : 'DEFAULT',
          Ubicacion: String(data.Ubicacion), 
          Desc_Ubicacion: String(data.Desc_Ubicacion) ?? ' ', 
          Origen_Abasto: data.Origen_Abasto || 'Default Value', // Asegúrate de proporcionar un valor predeterminado si es necesario
          Cantidad_Demanda_Indirecta: parseFloat(data.Cantidad_Demanda_Indirecta) || 0, // Convierte a float y proporciona un valor predeterminado
          Nivel_OA: data.Nivel_OA || '1', // Asume '1' como valor predeterminado si no se proporciona
          OverrideClasificacionABCD: (data.OverrideClasificacionABCD !== null && data.OverrideClasificacionABCD !== '' && data.OverrideClasificacionABCD !== ' ') ? String(data.OverrideClasificacionABCD) : '-',
          Override_Min_Politica_Inventarios: overrideMinPoliticaInventarios,
          Override_Max_Politica_Inventarios: overrideMaxPoliticaInventarios,
          Medida_Override: data.Medida_Override !== '' ? String(data.Medida_Override) : 'Dias de Cobertura',
          Tipo_Override: data.Tipo_Override !== '' ? String(data.Tipo_Override) : 'SS',
          MargenUnitario: data.MargenUnitario !== '' ? Number(data.MargenUnitario) : 1,
          LeadTime_Abasto_Dias: data.LeadTime_Abasto_Dias !== '' ? Number(data.LeadTime_Abasto_Dias) : 1,
          Frecuencia_Revision_Dias: data.Frecuencia_Revision_Dias !== '' ? Number(data.Frecuencia_Revision_Dias) : 1,
          Fill_Rate: data.Fill_Rate !== '' ? Number(data.Fill_Rate) : 1,
          MOQ: (() => {
            const value = Number(data.MOQ);
            return isNaN(value) || value < 1 ? 1 : value;
          })(),
          Tamano_Lote: data.Tamano_Lote !== '' ? Number(data.Tamano_Lote) : 1, 
          Unidades_Pallet: data.Unidades_Pallet !== '' ? Number(data.Unidades_Pallet) : 1, 
          Costo_Unidad: (data.Costo_Unidad !== '0' && data.Costo_Unidad !== '' && data.Costo_Unidad !== null && data.Costo_Unidad !== undefined) ? Number(data.Costo_Unidad) : 0.01,
          Tolerancia_Vida_Util_Dias: data.Tolerancia_Vida_Util_Dias !== '' ? Number(data.Tolerancia_Vida_Util_Dias) : 365, 
          Vida_Util_Dias: data.Vida_Util_Dias !== '' ? Number(data.Vida_Util_Dias) : 365, 
          Unidad_Medida_UOM: data.Unidad_Medida_UOM !== '' ? String(data.Unidad_Medida_UOM) : 'DEFAULT',
          Presentacion: data.Presentacion !== '' ? String(data.Presentacion) : ' ',
          Desc_Empaque_UOM_Base: data.Desc_Empaque_UOM_Base !== '' ? String(data.Desc_Empaque_UOM_Base) : ' ',
          Unidades_Empaque: data.Unidades_Empaque !== '' ? Number(data.Unidades_Empaque) : 1, 
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

function isValidNumber(value) {
  return !isNaN(value);
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
