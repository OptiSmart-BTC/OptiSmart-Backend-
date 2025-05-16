const fs = require('fs');
const mongodb = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');
const moment = require('moment');


const { host, puerto} = require('../Configuraciones/ConexionDB');

const dbName = process.argv.slice(2)[0];
const DBUser = process.argv.slice(2)[1];
const DBPassword = process.argv.slice(2)[2];

const parametro = dbName;
const parte = parametro.substring(parametro.lastIndexOf("_") + 1);
const parametroFolder = parte.toUpperCase();
const logFile = `../../${parametroFolder}/log/ClasABCD_PolInvent_Sem.log`; 


const { MongoClient } = require('mongodb');

//const uri = `mongodb://${DBUser}:${DBPassword}@${host}:${puerto}/${dbName}?authSource=admin`;
const mongoUri =  conex.getUrl(DBUser,DBPassword,host,puerto,dbName);


const database = `${dbName}`;

async function actualizarClasificacionDemanda() {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  writeToLog(`\nPaso 08 - Calculo de la Clasificacion de la Demanda por Semana`);

    const client = new MongoClient(mongoUri);
    
    try {
      await client.connect();
    
      const db = client.db(database);
      const parametrosUsuarioCollection = db.collection('parametros_usuario');
      const demandaOrdenadaDescCollection = db.collection('demanda_ordenada_desc_sem');

      const parametrosAlta = await parametrosUsuarioCollection.findOne({
        Tipo: 'Criterios',
        Criterio_Clasificacion: 'Demanda',
        SubClasificacion: 'Alta'
      });
      //const alta = parametrosAlta.Parametros;
      const alta = parseFloat(parametrosAlta.Parametros);
    
      // Consulta los parámetros requeridos para la clasificación 'Media'
      const parametrosMedia = await parametrosUsuarioCollection.findOne({
        Tipo: 'Criterios',
        Criterio_Clasificacion: 'Demanda',
        SubClasificacion: 'Media'
      });
      //const media = parametrosMedia.Parametros;
      const media = parseFloat(parametrosMedia.Parametros);

      // Consulta los parámetros requeridos para la clasificación 'Media'
      const parametrosBaja = await parametrosUsuarioCollection.findOne({
        Tipo: 'Criterios',
        Criterio_Clasificacion: 'Demanda',
        SubClasificacion: 'Baja'
      });
      //const baja = parametrosBaja.Parametros;
      const baja = parseFloat(parametrosBaja.Parametros);

    
      // Realiza una consulta para obtener los documentos a actualizar
      const documentos = await demandaOrdenadaDescCollection.find().toArray();
    
      // Itera sobre los documentos y actualiza el campo Clasificación Demanda
      for (const documento of documentos) {
        let clasificacionDemanda;
    
        if (documento.Demanda_Acumulada_Previa <= alta) {
          clasificacionDemanda = 'Alta';
        } else if (documento.Demanda_Acumulada_Previa > alta && documento.Demanda_Acumulada_Previa <= (alta + media)) {
          clasificacionDemanda = 'Media';
        } else if (documento.Demanda_Acumulada_Previa > (alta + media) && documento.Demanda_Acumulada_Previa <= (alta + media + baja)) {
          clasificacionDemanda = 'Baja';
        } else if (documento.Demanda_Acumulada_Previa > (alta + media + baja)) {
          clasificacionDemanda = 'Muy Baja';
        }

   
        // Actualiza el campo Clasificación Demanda en el documento actual
        await demandaOrdenadaDescCollection.updateOne(
          { _id: documento._id },
          { $set: { 'Clasificacion_Demanda': clasificacionDemanda } }
        );
      }
    

      writeToLog(`\tTermina el Calculo de la Clasificacion de la Demanda por Semana`);
    } catch (error) {
      writeToLog(`${now} - Ocurrió un error al actualizar la clasificación de demanda: ${error}`);
    } finally {
      client.close();
    }
  }

  function writeToLog(message) {
    fs.appendFileSync(logFile, message + '\n');
  }
  

  actualizarClasificacionDemanda();
  