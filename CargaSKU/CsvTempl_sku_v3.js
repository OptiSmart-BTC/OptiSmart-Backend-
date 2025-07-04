const { MongoClient } = require('mongodb');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');


const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];
const AppUser = process.argv.slice(2)[2];
 
const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
//const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/uservars`);
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/dbvars`);
const csvFilePath = `../../${parametroFolder}/templates/template-sku.csv`;
//const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`;


const collectionName = 'sku';


const desiredFields = [
  'Producto',
  'Desc_Producto',
  'Familia_Producto',
  'Categoria',
  'Segmentacion_Producto',
  'Ubicacion',
  'Desc_Ubicacion',
<<<<<<< HEAD
=======
  'Origen_Abasto',
  'Cantidad_Demanda_Indirecta',
  'Nivel_OA',
>>>>>>> origin/test
  'OverrideClasificacionABCD',
  'Override_Min_Politica_Inventarios',
  'Override_Max_Politica_Inventarios',
  'Medida_Override',
  'Tipo_Override',
  'MargenUnitario',
  'LeadTime_Abasto_Dias',
  'Frecuencia_Revision_Dias',
  'Fill_Rate',
  'MOQ',
  'Tamano_Lote',
  'Unidades_Pallet',
  'Costo_Unidad',
  'Tolerancia_Vida_Util_Dias',
  'Vida_Util_Dias',
  'Unidad_Medida_UOM',
  'Presentacion',
  'Desc_Empaque_UOM_Base',
  'Unidades_Empaque',
];

// Ejemplos específicos para cada tipo de campo
const fieldExamples = {
    Producto: '<<Alfanum>>',
    Desc_Producto: '<<Alfanum+Simbolos>>',
    Familia_Producto: '<<Alfanum+Simbolos>>',
    Categoria: '<<Alfanum+Simbolos>>',
    Segmentacion_Producto: '<<Alfanum+Simbolos>>',
    Ubicacion: '<<Alfanum>>',
    Desc_Ubicacion:'<<Alfanum+Simbolos>>',
<<<<<<< HEAD
=======
    Origen_Abasto: 'Tienda A', // Ejemplo genérico, ajusta según los valores esperados
    Cantidad_Demanda_Indirecta: '150', // Asumiendo un número como ejemplo
    Nivel_OA: '1',
>>>>>>> origin/test
    OverrideClasificacionABCD:"<<Numerico o '-'>>",
    Override_Min_Politica_Inventarios:'<<Numerico o Vacio>>',
    Override_Max_Politica_Inventarios:'<<Numerico o Vacio>>',
    Medida_Override:'<<Alfabético>>',
    Tipo_Override:'<<Alfabético>>',
    MargenUnitario:'<<Numerico Decimal>>',
    LeadTime_Abasto_Dias:'<<Numerico Entero>>',
    Frecuencia_Revision_Dias:'<<Numerico Entero>>',
    Fill_Rate:'<<Porcenaje en Numerico Decimal (El 90% es 0.9)>>',
    MOQ:'<<Numerico Entero>>',
    Tamano_Lote:'<<Numerico Entero>>',
    Unidades_Pallet:'<<Numerico Entero>>',
    Costo_Unidad:'<<Numerico Decimal>>',
    Tolerancia_Vida_Util_Dias:'<<Numerico Entero>>',
    Vida_Util_Dias:'<<Numerico Entero>>',
    Unidad_Medida_UOM:'<<Alfabético>>',
    Presentacion:'<<Alfanum+Simbolos>>',
    Desc_Empaque_UOM_Base:'<<Alfanum+Simbolos>>',
    Unidades_Empaque:'<<Numerico Entero>>',
};

async function generateCsvTemplate() {
  try {
    const passadminDeCripta = await getDecryptedPassadmin();
    const mongoUrl = `mongodb://${DBUser}:${passadminDeCripta}@${host}:${puerto}/${dbName}?authSource=admin`;
    // Conectar a MongoDB
    const client = await MongoClient.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = client.db(dbName);
    
    // Obtener un solo documento de la colección
    const collection = db.collection(collectionName);
    const document = await collection.findOne();



    if (fs.existsSync(csvFilePath)) {
      // Si existe, eliminar el archivo
      fs.unlinkSync(csvFilePath);
  }

  
    // Crear el archivo CSV
    const csvWriter = createCsvWriter({
      path: csvFilePath,
      header: desiredFields.map(fieldName => ({ id: fieldName, title: fieldName })),
    });

    // Insertar una fila de datos de ejemplo para el documento obtenido
    const exampleData = {};
    desiredFields.forEach(fieldName => {
      exampleData[fieldName] = fieldExamples[fieldName] || document[fieldName] || ''; // Priorizar ejemplo específico, luego valor en el documento, luego cadena vacía
    });

    await csvWriter.writeRecords([exampleData]);

    console.log('Archivo CSV generado con éxito.');

    // Cerrar la conexión a MongoDB
    await client.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

// Llamar a la función para generar el archivo CSV
generateCsvTemplate();



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