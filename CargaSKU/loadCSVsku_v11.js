const fs = require('fs');
const csv = require('csv-parser');
const { MongoClient, Decimal128, Double } = require('mongodb');
const conex= require('../Configuraciones/ConStrDB');

const dbName = process.argv.slice(2)[0];
const parametroFolder = process.argv.slice(2)[1];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/dbvars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`;

const collectionName = 'sku';
const csvFilePath = `../../${parametroFolder}/csv/in/sku.csv`;


async function insertCSVDataToMongoDB() {
  try {
    const passadminDeCripta = await getDecryptedPassadmin();
    const mongoUri = conex.getUrl(DBUser, passadminDeCripta, host, puerto, dbName);

    writeToLog(`\nPaso 04 - Carga del CSV de SKU`);

    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true });
    const db = client.db();

    const results = [];

    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => {

        const overrideMinPoliticaInventarios =
          data.Override_Min_Politica_Inventarios !== ''
            ? (isNaN(data.Override_Min_Politica_Inventarios)
              ? String(data.Override_Min_Politica_Inventarios)
              : Number(data.Override_Min_Politica_Inventarios))
            : '';

        const overrideMaxPoliticaInventarios =
          data.Override_Max_Politica_Inventarios !== ''
            ? (isNaN(data.Override_Max_Politica_Inventarios)
              ? String(data.Override_Max_Politica_Inventarios)
              : Number(data.Override_Max_Politica_Inventarios))
            : '';

        //  NUEVA LÓGICA PARA Calculo_Demanda
        let calculoDemanda = "Promedio"; // default
        if (data.Calculo_Demanda && data.Calculo_Demanda.trim() !== "") {
          const valor = data.Calculo_Demanda.trim();
          if (valor === "Promedio" || valor === "PromMovil") {
            calculoDemanda = valor;
          }
        }

        const transformedData = {
          SKU: `${String(data.Producto)}@${String(data.Ubicacion)}`,
          Producto: String(data.Producto),
          Desc_Producto: String(data.Desc_Producto) ?? ' ',
          Familia_Producto: data.Familia_Producto !== '' ? String(data.Familia_Producto) : 'DEFAULT',
          Categoria: data.Categoria !== '' ? String(data.Categoria) : 'DEFAULT',
          Segmentacion_Producto: data.Segmentacion_Producto !== '' ? String(data.Segmentacion_Producto) : 'DEFAULT',
          Ubicacion: String(data.Ubicacion),
          Desc_Ubicacion: String(data.Desc_Ubicacion) ?? ' ',
          Origen_Abasto: data.Origen_Abasto || 'Default Value',
          Ignorar: data.Ignorar || 0,

          Cantidad_Demanda_Indirecta: parseFloat(data.Cantidad_Demanda_Indirecta) || 0,
          Nivel_OA: data.Nivel_OA || '1',

          OverrideClasificacionABCD:
            (data.OverrideClasificacionABCD !== null &&
              data.OverrideClasificacionABCD !== '' &&
              data.OverrideClasificacionABCD !== ' ')
              ? String(data.OverrideClasificacionABCD)
              : '-',

          Override_Min_Politica_Inventarios: overrideMinPoliticaInventarios,
          Override_Max_Politica_Inventarios: overrideMaxPoliticaInventarios,

          Medida_Override:
            data.Medida_Override !== '' ? String(data.Medida_Override) : 'Dias de Cobertura',

          Tipo_Override:
            data.Tipo_Override !== '' ? String(data.Tipo_Override) : 'SS',

          MargenUnitario:
            data.MargenUnitario !== '' ? Number(data.MargenUnitario) : 1,

          LeadTime_Abasto_Dias:
            data.LeadTime_Abasto_Dias !== '' ? Number(data.LeadTime_Abasto_Dias) : 1,

          Frecuencia_Revision_Dias:
            data.Frecuencia_Revision_Dias !== '' ? Number(data.Frecuencia_Revision_Dias) : 1,

          Fill_Rate:
            data.Fill_Rate !== '' ? Number(data.Fill_Rate) : 1,

          MOQ: (() => {
            const value = Number(data.MOQ);
            return isNaN(value) || value < 1 ? 1 : value;
          })(),

          Tamano_Lote:
            data.Tamano_Lote !== '' ? Number(data.Tamano_Lote) : 1,

          Unidades_Pallet:
            data.Unidades_Pallet !== '' ? Number(data.Unidades_Pallet) : 1,

          Costo_Unidad:
            (data.Costo_Unidad !== '0' &&
              data.Costo_Unidad !== '' &&
              data.Costo_Unidad !== null &&
              data.Costo_Unidad !== undefined)
              ? Number(data.Costo_Unidad)
              : 0.01,

          Tolerancia_Vida_Util_Dias:
            data.Tolerancia_Vida_Util_Dias !== '' ? Number(data.Tolerancia_Vida_Util_Dias) : 365,

          Vida_Util_Dias:
            data.Vida_Util_Dias !== '' ? Number(data.Vida_Util_Dias) : 365,

          Unidad_Medida_UOM:
            data.Unidad_Medida_UOM !== '' ? String(data.Unidad_Medida_UOM) : 'DEFAULT',

          Presentacion:
            data.Presentacion !== '' ? String(data.Presentacion) : ' ',

          Desc_Empaque_UOM_Base:
            data.Desc_Empaque_UOM_Base !== '' ? String(data.Desc_Empaque_UOM_Base) : ' ',

          Unidades_Empaque:
            data.Unidades_Empaque !== '' ? Number(data.Unidades_Empaque) : 1,

          //  NUEVO CAMPO GUARDADO EN MONGODB
          Calculo_Demanda: calculoDemanda
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

async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error('Error al desencriptar el passadmin:', error);
    throw error;
  }
}

insertCSVDataToMongoDB();
