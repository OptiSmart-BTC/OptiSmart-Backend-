const express = require('express');
const mongoose = require('mongoose');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const app = express();
const PORT = 3000;

// Parámetros de conexión a MongoDB
const mongoDBHost = '127.0.0.1';
const mongoDBPort = 27017;
const mongoDBDatabase = 'btc_opti_USR005';
const mongoDBUser = 'dbUSR005';
const mongoDBPassword = 'ClanN1212';

// Construir la cadena de conexión a MongoDB
const mongoDBURI = `mongodb://${mongoDBUser}:${mongoDBPassword}@${mongoDBHost}:${mongoDBPort}/${mongoDBDatabase}?authSource=admin`;

// Conectar a MongoDB
mongoose.connect(mongoDBURI, { useNewUrlParser: true, useUnifiedTopology: true });

// Definir el esquema de la colección
const demandaSchema = new mongoose.Schema({
  Tipo_Calendario: String,
  SKU: String,
  Producto: String,
  Desc_Producto: String,
  Familia_Producto: String,
  Categoria: String,
  Segmentacion_Producto: String,
  Presentacion: String,
  Ubicacion: String,
  Desc_Ubicacion: String,
  Demanda_Costo: Number,
  Demanda_Promedio_Diaria_Costo: Number,
  Clasificacion_Demanda: String,
  Variabilidad_Demanda: Number,
  DS_Demanda: Number,
  Coeficiente_Variabilidad: Number,
  Clasificacion_Variabilidad: String,
  Margen_Unitario: Number,
  Clasificacion_Margen: String,
  Clasificacion_ABCD: String,
  Override_SI_NO: String,
});

const Demanda = mongoose.model('Demanda', demandaSchema, 'ui_demanda_abcd');

// Endpoint para generar y descargar CSV
app.get('/generar-csv', async (req, res) => {
  try {
    // Consultar datos desde MongoDB
    const datos = await Demanda.find({ /* Filtros si es necesario */ });

    // Configurar el escritor CSV
    const csvWriter = createCsvWriter({
      path: `../../USR005/csv/ClasificacionDemandaABCD.csv`,
      header: Object.keys(demandaSchema.paths),  // Utiliza los nombres de los campos como encabezados
    });

    // Escribir datos en el archivo CSV
    await csvWriter.writeRecords(datos);

    // Enviar el archivo CSV como respuesta
    res.download('../../USR005/csv/ClasificacionDemandaABCD.csv');
  } catch (error) {
    console.error('Error al generar y descargar el archivo CSV:', error);
    res.status(500).send('Error interno del servidor');
  }
});

// Ruta para la raíz
app.get('/', (req, res) => {
  res.send('Bienvenido a la página principal');
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
