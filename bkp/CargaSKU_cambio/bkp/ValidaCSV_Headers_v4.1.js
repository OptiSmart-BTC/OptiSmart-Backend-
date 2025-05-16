const fs = require('fs').promises;
const Papa = require('papaparse');

const parametroUsuario = process.argv.slice(2)[0];
const parametroFolder = parametroUsuario.toUpperCase();

const csvFilePath = `../../${parametroFolder}/csv/sku.csv`;
const logFileName = 'LogdeCargaCSV';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;


//const csvFilePath = `../../USR002/csv/sku_test.csv`; 
//const encabezadosRequeridos = ['Producto', 'Desc_Producto', 'Familia_Producto']; 

const encabezadosRequeridos = [
'Producto',
'Desc_Producto',
'Familia_Producto',
'Ubicacion',
'Desc_Ubicacion',
'OverrideClasificacionABCD',
'OverrideSafetyStock_UOM_Base',
'MargenUnitario',
'LeadTime_Abasto_Dias',
'Frecuencia_Revision_Dias',
'Fill_Rate',
'MOQ',
'Tamano_Lote',
'Unidades_Pallet',
'Costo_Unidad',
'Vida_Util_Dias',
'Unidad_Medida_UOM',
'Presentacion',
'Desc_Empaque_UOM_Base',
'Unidades_Empaque'
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
    if (encabezadosCSV.length !== encabezadosRequeridos.length) {
      const encabezadosFaltantes = encabezadosRequeridos.filter(header => !encabezadosCSV.includes(header));
      const encabezadosExtras = encabezadosCSV.filter(header => !encabezadosRequeridos.includes(header));

      if (encabezadosFaltantes.length > 0) {
        const mensajeErrorFaltantes = `\tEncabezados faltantes: ${encabezadosFaltantes.join(', ')}`;
        errores.push(mensajeErrorFaltantes);
        await writeToLog(mensajeErrorFaltantes);
      }

      if (encabezadosExtras.length > 0) {
        const mensajeErrorExtras = `\tEncabezados extras: ${encabezadosExtras.join(', ')}`;
        errores.push(mensajeErrorExtras);
        await writeToLog(mensajeErrorExtras);
      }
    }

    // Validar el orden de los encabezados
    const encabezadosOrdenIncorrecto = encabezadosRequeridos.filter((header, index) => header !== encabezadosCSV[index]);

    if (encabezadosOrdenIncorrecto.length > 0) {
      const mensajeErrorOrden = `\tEl orden de los encabezados es incorrecto. Revisa el Templete`;
      errores.push(mensajeErrorOrden);
      await writeToLog(mensajeErrorOrden);
    }

    if (errores.length > 0) {
      throw new Error(errores.join('\n'));
      return new Promise(resolve => {
        setTimeout(() => {
          resolve('Resultado de la operación');
        }, 1000);
      });
    }



    console.log('OK');
    writeToLog('\tLos encabezados son válidos y están en el orden correcto.');

  } catch (error) {
    console.error('ERROR:\n', error.message);
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



