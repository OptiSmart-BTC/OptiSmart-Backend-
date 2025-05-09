const fs = require('fs');
const { MongoClient } = require('mongodb');
const conex= require('../../Configuraciones/ConStrDB');
const moment = require('moment');
 
  // Configuración de conexión a la base de datos MongoDB
  //const uri = 'mongodb://127.0.0.1:27017'; // Cambia esto si tu MongoDB se encuentra en un servidor diferente
  //const dbName = 'btc_opti_a001';

const { host, puerto } = require('../../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

//const uri = `mongodb://${host}:${puerto}/${dbName}`;
//const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent.log`; 
const now = moment().format('YYYY-MM-DD HH:mm:ss');


async function crearTablaPoliticaInventarios() {
  //writeToLog('------------------------------------------------------------------------------');
  writeToLog(`\nPaso 02 - Calculo de los Campos Iniciales`);



  const client = new MongoClient(mongoUri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const demandaCollection = db.collection('demanda_abcd_01');
    const politicaCollection = db.collection('politica_inventarios_01');

    // se limpia la tabla política_inventarios_01 antes de insertar nuevos datos
    await politicaCollection.deleteMany({});

    // se leen los datos de la tabla demanda_abcd_01
    const datosDemanda = await demandaCollection.find().toArray();

    // se crea un nuevo objeto con los campos y lógica especificados para cada registro
    const politicaInventarios = datosDemanda.map((dato) => {
      return {
        Tipo_Calendario:"Dia",
        SKU: dato.SKU,
        Producto: dato.Producto,
        Desc_Producto: dato.Desc_Producto,
        Familia_Producto: dato.Familia_Producto,
        Categoria: dato.Categoria,
        Segmentacion_Producto: dato.Segmentacion_Producto,
        Presentacion: dato.Presentacion,
        Ubicacion: dato.Ubicacion,
        Desc_Ubicacion: dato.Desc_Ubicacion,
        Clasificacion: dato.Clasificacion_ABCD,
        Nivel_Servicio: "0",
        Valor_Z: "0",
        UOM: "0",
        UOM_Base: "0",
        Unidades_Empaque:"0",
        Demanda_Promedio_Diaria: "0",
        Lead_Time_Abasto: "0",
        Variabilidad_Demanda_Cantidad: "0",
        DS_Demanda: "0",
        Fill_Rate: "0",
        Frecuencia_Revision_dias: "0",
        Prom_LT: "0",
        DS_LT: "0",
        Override_SI_NO: "0",
        Override_SS_Cantidad: "0", 
        SS_Cantidad: "0",
        Demanda_LT: "0",
        MOQ: "0",
        ROQ: "0",
        Override_ROP: "0",
        ROP: "0",
        META: "0",
        Inventario_Promedio: "0"
      };
    });

    // ya que esta armado se insertan los datos en la tabla política_inventarios_01
    await politicaCollection.insertMany(politicaInventarios);

    //console.log('La tabla política_inventarios_01 se ha creado y llenado correctamente.');
    //writeToLog(`${now} - La tabla política_inventarios_01 se ha creado y llenado correctamente.`);
    //writeToLog('------------------------------------------------------------------------------');
    //writeToLog(`${now} - Ejecucion exitosa`);
    writeToLog(`\tTermina el Calculo de los Campos Iniciales`);
  } catch (err) {
    //console.error('Error al crear la tabla política_inventarios_01:', err);
    writeToLog(`${now} - Error al crear la tabla política_inventarios_01: ${err}`);
    //writeToLog('------------------------------------------------------------------------------');
  } finally {
    // Cerrar la conexión a la base de datos
    client.close();
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Llamar a la función para ejecutarla
crearTablaPoliticaInventarios();
