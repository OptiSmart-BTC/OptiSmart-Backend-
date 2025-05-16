<<<<<<< HEAD
const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
=======
// PR10_Formatea_TablaUI.js
const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
>>>>>>> origin/test
const moment = require('moment');

const { host, puerto} = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

<<<<<<< HEAD
//const uri = `mongodb://${host}:${puerto}/${dbName}`;
//const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

=======
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);
>>>>>>> origin/test
const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/PlanReposicion.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');

<<<<<<< HEAD

async function copiarDatos() {

=======
async function copiarDatos() {
>>>>>>> origin/test
  writeToLog(`\nPaso 10 - Formateo de las Tablas Finales para mostrar en UI`);

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const collection = db.collection('plan_reposicion_01');
<<<<<<< HEAD

    const finalCollection = db.collection('ui_plan_reposicion');
    await finalCollection.deleteMany({});


    const datos = await collection.find().toArray();


    const datosFormateados = datos.map((dato) => {
      return {
        ...dato,
        Inventario_Disponible: formatearNumero2(dato.Inventario_Disponible),
        Cantidad_Transito: formatearNumero2(dato.Cantidad_Transito),
        Cantidad_Confirmada_Total: formatearNumero2(dato.Cantidad_Confirmada_Total),
        SS_Cantidad: formatearNumero(dato.SS_Cantidad),
        ROP: formatearNumero(dato.ROP),
        META: formatearNumero(dato.META),
        Cantidad_Reponer: formatearNumero(dato.Cantidad_Reponer),
        MOQ: formatearNumero2(dato.MOQ),
        Plan_Reposicion_Cantidad: formatearNumero2(dato.Plan_Reposicion_Cantidad),
        Plan_Reposicion_Pallets: formatearNumero2(dato.Plan_Reposicion_Pallets),
        Plan_Firme_Pallets: formatearNumero2(dato.Plan_Firme_Pallets),
        Plan_Reposicion_Costo: formatearNumero2(dato.Plan_Reposicion_Costo),
        Costo_Unidad: formatearNumero(dato.Costo_Unidad),
      };
    });

=======
    const finalCollection = db.collection('ui_plan_reposicion');
    await finalCollection.deleteMany({});

    const datos = await collection.find().toArray();

    const datosFormateados = datos.map((dato) => {
      const formateado = {
        SKU: dato.SKU,
        Producto: dato.Producto,
        Desc_Producto: dato.Desc_Producto,
        Familia_Producto: dato.Familia_Producto,
        Categoria: dato.Categoria,
        Segmentacion_Producto: dato.Segmentacion_Producto,
        Presentacion: dato.Presentacion,
        Ubicacion: dato.Ubicacion,
        Desc_Ubicacion: dato.Desc_Ubicacion,
        UOM_Base: dato.UOM_Base,
        Inventario_Disponible: formatearNumero2(dato.Inventario_Disponible ?? 0),
        Cantidad_Transito: formatearNumero2(dato.Cantidad_Transito ?? 0),
        Cantidad_Confirmada_Total: formatearNumero2(dato.Cantidad_Confirmada_Total ?? 0),
        SS_Cantidad: formatearNumero(dato.SS_Cantidad ?? 0),
        ROP: formatearNumero(dato.ROP ?? 0),
        META: formatearNumero(dato.META ?? 0),
        'Cantidad Demanda Indirecta': formatearNumero2(dato.Cantidad_Demanda_Indirecta ?? 0), // renombrada
        Requiere_Reposicion: dato.Requiere_Reposicion,
        Cantidad_Reponer: formatearNumero(dato.Cantidad_Reponer ?? 0),
        MOQ: formatearNumero2(dato.MOQ ?? 0),
        Plan_Reposicion_Cantidad: formatearNumero2(dato.Plan_Reposicion_Cantidad ?? 0),
        Plan_Reposicion_Pallets: formatearNumero2(dato.Plan_Reposicion_Pallets ?? 0),
        Plan_Firme_Pallets: formatearNumero2(dato.Plan_Firme_Pallets ?? 0),
        Plan_Reposicion_Costo: formatearNumero2(dato.Plan_Reposicion_Costo ?? 0),
        Costo_Unidad: formatearNumero(dato.Costo_Unidad ?? 0),
        Origen_Abasto: dato.Origen_Abasto,
        Nivel_OA: dato.Nivel_OA
      };

      return formateado;
    });
>>>>>>> origin/test

    await finalCollection.insertMany(datosFormateados);
    writeToLog(`\tTermina el Formateo de las Tablas Finales`);
  } catch (error) {
<<<<<<< HEAD
    //console.error('Error al copiar los datos:', error);
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
    // Cerrar la conexión a la base de datos
=======
    writeToLog(`${now} - [ERROR] ${error.message}`);
  } finally {
>>>>>>> origin/test
    client.close();
  }
}

<<<<<<< HEAD
// Función para formatear un número y separar los millares por coma y redondear decimales a 4 dígitos
function formatearNumero(numero) {
  if (typeof numero === 'number') {
    return numero.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    });
  }
  return numero;
}



function formatearNumero2(numero) {
    if (typeof numero === 'number') {
      return numero.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
    }
    return numero;
  }

  function writeToLog(message) {
    fs.appendFileSync(logFile, message + '\n');
  }
  
// Llamar a la función para ejecutarla
=======
function formatearNumero(numero) {
  return Number(numero).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  });
}

function formatearNumero2(numero) {
  return Number(numero).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

>>>>>>> origin/test
copiarDatos();
