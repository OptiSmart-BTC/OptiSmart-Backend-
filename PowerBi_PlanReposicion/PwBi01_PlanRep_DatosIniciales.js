const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');
const { path_sftp, path_opti, path_users } = require(`../Configuraciones/paths_vars`);

const { host, puerto } = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `${path_users}/${parametroFolder}/log/PowerBI_PlanReposicion.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


async function crearTablaPoliticaInventarios() {
  writeToLog(`\nPaso 01 - Datos Iniciales del Plan de Reposicion`);



  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const planrepoCollection = db.collection('plan_reposicion_01');
    const pwrbiplanRepoCollection = db.collection('powerbi_plan_reposicion_01');

    await pwrbiplanRepoCollection.deleteMany({});
    const datosplanrepo = await planrepoCollection.find().toArray();

    const planRepopipeline = datosplanrepo.map((dato) => {
      return {
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
          Inventario_Disponible: dato.Inventario_Disponible,
          Cantidad_Transito: dato.Cantidad_Transito,
          SS_Cantidad: dato.SS_Cantidad != null ? dato.SS_Cantidad : 0,
          ROP: dato.ROP != null ? dato.ROP : 0,
          META: dato.META,
          Requiere_Reposicion: dato.Requiere_Reposicion,
          Cantidad_Reponer: dato.Cantidad_Reponer,
          MOQ: dato.MOQ,
          Plan_Reposicion_Cantidad: dato.Plan_Reposicion_Cantidad,
          Plan_Reposicion_Pallets: dato.Plan_Reposicion_Pallets,
          Plan_Firme_Pallets: dato.Plan_Firme_Pallets,
          Plan_Reposicion_Costo: dato.Plan_Reposicion_Costo,
          Costo_Unidad: dato.Costo_Unidad,
          Costo_Inv: 0,
          CERO_INV: 0,
          Clasificacion: 0,
          Costo_OK: 0,
          Costo_Down: 0,
          Costo_UP: 0,
          Demanda_Promedio_Diaria: 0,
          Inventario_Promedio: 0,
          Costo_A: 0,
          Costo_B: 0,
          Costo_C: 0,
          Costo_D: 0,
          Demanda_Diaria: 0,
          Rotacion_Anual_Dias: 0,
          Dias_Cobertura: 0,
          Tipo_Caso:0,
          Intervalos_Dias_Cobertura:0,
          Cero_Inv2:0,
      };
    });

    await pwrbiplanRepoCollection.insertMany(planRepopipeline);

    writeToLog(`\tTermina el Calculo del Inventario Disponible`);
  } catch (err) {
    writeToLog(`${now} - Error al crear la tabla plan_reposicion_01: ${err}`);
  } finally {
    client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Llamar a la función para ejecutarla
crearTablaPoliticaInventarios();
