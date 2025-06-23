const { MongoClient } = require('mongodb');

async function createHistoricoDemandaSemCollection() {
  //const uri = 'mongodb://localhost:27017'; // Reemplaza con la URI de tu base de datos MongoDB
  const uri = 'mongodb://dbOPTIWEEK01:passDB123@127.0.0.1:27017/?authSource=admin';
  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();

    const session = client.startSession();
    const database = client.db('btc_opti_OPTIWEEK01'); // Reemplaza 'tu_base_de_datos' con el nombre de tu base de datos
    const historicoDemandaCollection = database.collection('historico_demanda');
    const historicoDemandaSemCollection = database.collection('historico_demanda_sem');

    const cursor = historicoDemandaCollection.find();

    await cursor.forEach(async (doc) => {
      const fecha = new Date(doc.Fecha);
      const week = getWeekNumber(fecha);
      const year = fecha.getFullYear();
      const weekYear = `${week}_${year}`;

      await historicoDemandaSemCollection.insertOne(
        {
          SKU: doc.SKU,
          Ubicacion: doc.Ubicacion,
          Producto: doc.Producto,
          Week: week,
          Year: year,
          Week_Year: weekYear,
        },
        { session }
      );
    });

    session.endSession(); // Cierra la sesión después de usarla
    console.log('La tabla historico_demanda_sem se ha creado correctamente.');
  } catch (error) {
    console.error('Ocurrió un error:', error);
  } finally {
    await client.close();
  }
}

function getWeekNumber(date) {
  // Calcula el número de semana para una fecha dada
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

createHistoricoDemandaSemCollection();
