const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { path_sftp, path_opti, path_users } = require(`../Configuraciones/paths_vars`);

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];
const AppUser = process.argv.slice(2)[3];

const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `${path_users}/${parametroFolder}/log/PowerBI_PlanReposicion.log`; 
const UserPath = `${path_users}/${parametroFolder}/users/${AppUser}/csv`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

const collection = 'powerbi_plan_reposicion_01';
const filePath = `${UserPath}/powerbi_plan_reposicion.csv`;

async function exportToCsv() {
  writeToLog(`\nPaso 16 - Exporta Datos`);
  try {
    client = await MongoClient.connect(mongoUri);
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection('powerbi_plan_reposicion_01');

    const fields = [
      'SKU', 'Producto', 'Desc_Producto', 'Familia_Producto', 'Categoria',
      'Segmentacion_Producto', 'Presentacion', 'Ubicacion', 'Desc_Ubicacion', 'UOM_Base',
      'Inventario_Disponible', 'Cantidad_Transito', 'SS_Cantidad', 'ROP', 'META',
      'Requiere_Reposicion', 'Cantidad_Reponer', 'MOQ', 'Plan_Reposicion_Cantidad', 
      'Plan_Reposicion_Pallets', 'Plan_Firme_Pallets', 'Plan_Reposicion_Costo', 'Costo_Unidad', 
      'Costo_Inv', 'CERO_INV', 'Clasificacion', 'Costo_OK', 'Costo_Down', 'Costo_UP', 
      'Demanda_Promedio_Diaria', 'Inventario_Promedio', 'Costo_A', 'Costo_B', 'Costo_C', 
      'Costo_D', 'Demanda_Diaria', 'Rotacion_Anual_Dias', 'Dias_Cobertura', 'Tipo_Caso', 
      'Intervalos_Dias_Cobertura', 'Cero_Inv2'
    ];

    const data = await collection.find({}, { projection: fields.reduce((acc, field) => {
        acc[field] = 1;
        return acc;
    }, {}) }).toArray();


    // Verificar si el archivo ya existe
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath); // Eliminar el archivo si existe
      console.log(`Archivo existente "${filePath}" eliminado.`);
    }
    
    // Crear el archivo CSV
    const csvWriter = createCsvWriter({
      path: filePath,
      header: fields.map(field => ({ id: field, title: field }))
    });
    

    await csvWriter.writeRecords(data);

    writeToLog(`\tArchivo CSV creado correctamente en la ruta especificada.`);
  } catch (error) {
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    await client.close();
  }
}

exportToCsv();


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}
