const fs = require('fs').promises;
const Papa = require('papaparse');

const parametroUsuario = process.argv.slice(2)[0];
const parametroFolder = parametroUsuario.toUpperCase();

const csvFilePath = `../../${parametroFolder}/csv/in/sku.csv`;
const logFileName = 'LogdeCargaCSV';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;


//const csvFilePath = `../../USR002/csv/sku_test.csv`; 
//const encabezadosRequeridos = ['Producto', 'Desc_Producto', 'Familia_Producto']; 

const encabezadosRequeridos = [
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
<<<<<<< HEAD
'Unidades_Empaque'
=======
'Unidades_Empaque',
'Cantidad_Demanda_Indirecta',
'Nivel_OA'
>>>>>>> origin/test
]; 



async function validarEncabezados() {
  const errores = [];
  writeToLog(`Paso 02.- Validacion de Headers del CSV`);
  try {
    // Leer el contenido del archivo CSV
    const contenidoCSV = await fs.readFile(csvFilePath, 'utf-8');

    // Parsear el contenido CSV
    const resultado = Papa.parse(contenidoCSV, { header: true });

    // Obtener los encabezados del CSV
    const encabezadosCSV = resultado.meta.fields;

    // Validar la cantidad de encabezados
    //if (encabezadosCSV.length !== encabezadosRequeridos.length) {
      const encabezadosFaltantes = encabezadosRequeridos.filter(header => !encabezadosCSV.includes(header));
      const encabezadosExtras = encabezadosCSV.filter(header => !encabezadosRequeridos.includes(header));

      if (encabezadosFaltantes.length > 0) {
        const mensajeErrorFaltantes = `\t-Encabezados faltantes: ${encabezadosFaltantes.join(', ')}\n`;
        errores.push(mensajeErrorFaltantes);
        await writeToLog(mensajeErrorFaltantes);
      }

      if (encabezadosExtras.length > 0) {
        const mensajeErrorExtras = `\t-Encabezados extras: ${encabezadosExtras.join(', ')}\n`;
        errores.push(mensajeErrorExtras);
        await writeToLog(mensajeErrorExtras);
      }
    //}

    // Validar el orden de los encabezados
    const encabezadosOrdenIncorrecto = encabezadosRequeridos.filter((header, index) => header !== encabezadosCSV[index]);

    if (encabezadosOrdenIncorrecto.length > 0) {
      const mensajeErrorOrden = `\t-El orden de los encabezados es incorrecto.\n`;
      errores.push(mensajeErrorOrden);
      await writeToLog(mensajeErrorOrden);
    }

    if (errores.length > 0) {
      console.log('OK');
      writeToLog('\tRevisa la Plantilla.');
      throw new Error(errores.join('\n'));
      
    }

    //console.log('Los encabezados son válidos y están en el orden correcto.');
    writeToLog('\tLos encabezados son válidos y están en el orden correcto.\n');
    console.log('OK');
  } catch (error) {
    console.error('Error:\n', error.message);
    console.log('ERROR');
  }
}

// Llamada a la función principal
validarEncabezados();


async function writeToLog(message) {
  try {
    await fs.appendFile(logFile, `${message}\n`);
  } catch (error) {
    console.error('Error al escribir en el archivo de registro:', error.message);
  }
}



