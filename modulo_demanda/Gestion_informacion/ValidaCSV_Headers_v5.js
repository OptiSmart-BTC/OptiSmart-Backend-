const fs = require('fs').promises;
const path = require('path');
const Papa = require('papaparse');

const parametroUsuario = process.argv.slice(2)[0];
const csvFilePathArg = process.argv.slice(2)[1];
const parametroFolder = parametroUsuario.toUpperCase();

const csvFilePath = csvFilePathArg ? csvFilePathArg.replace(/(^"|"$)/g, '') : '';
const logFile = path.join(__dirname, '..', '..', '..', parametroFolder, 'log', 'Logs_demanda.log');

// NUEVO ORDEN REQUERIDO
const encabezadosRequeridos = [
  'Producto',
  'Canal',
  'Ubicacion',
  'Fecha',
  'Cantidad'
];

async function validarEncabezados() {
  try {
    await writeToLog(`Paso 02.- Validacion de Headers del CSV`);
    
    // Verificar que el archivo existe
    try {
      await fs.access(csvFilePath);
    } catch (error) {
      await writeToLog(`\tError: El archivo ${csvFilePath} no existe`);
      console.log('ERROR');
      process.exit(1);
    }

    if (!csvFilePath) {
      writeToLog(`Error: No se proporcionó ruta de archivo CSV`);
      console.log('ERROR');
      process.exit(1);
    }

    // Leer el contenido del archivo CSV
    const contenidoCSV = await fs.readFile(csvFilePath, 'utf-8');

    // Parsear el contenido CSV
    const resultado = Papa.parse(contenidoCSV, { header: true });
    const data = resultado.data;
    
    // Obtener los encabezados del CSV
    const encabezadosCSV = resultado.meta.fields;
    
    // Validar encabezados faltantes y extras
    const encabezadosFaltantes = encabezadosRequeridos.filter(header => !encabezadosCSV.includes(header));
    const encabezadosExtras = encabezadosCSV.filter(header => !encabezadosRequeridos.includes(header));
    
    // Registrar los resultados
    let hayErrores = false;
    
    if (encabezadosFaltantes.length > 0) {
      hayErrores = true;
      await writeToLog(`\t-Encabezados faltantes: ${encabezadosFaltantes.join(', ')}`);
    }

    if (encabezadosExtras.length > 0) {
      // Esto no es un error fatal, solo una advertencia
      await writeToLog(`\t-Encabezados extras: ${encabezadosExtras.join(', ')}`);
    }

    // Validar el orden de los encabezados
    const ordenCorrecto = encabezadosRequeridos.every((header, index) => 
      encabezadosCSV[index] === header || encabezadosFaltantes.includes(header));
    
    if (!ordenCorrecto && encabezadosFaltantes.length === 0) {
      hayErrores = true;
      await writeToLog(`\t-El orden de los encabezados es incorrecto. Reordenando...`);
      
      // Reordenar los datos según el orden requerido
      const csvReordenado = Papa.unparse({
        fields: encabezadosRequeridos,
        data: data
      });
      
      // Guardar el CSV reordenado
      await fs.writeFile(csvFilePath, csvReordenado, 'utf-8');
      await writeToLog(`\t-Se ha reordenado el archivo para que cumpla con el orden requerido`);
    }

    if (hayErrores && encabezadosFaltantes.length > 0) {
      await writeToLog(`\tError: Revisa la Plantilla. Faltan columnas obligatorias.`);
      console.log('ERROR');
      process.exit(1);
    } else if (!ordenCorrecto) {
      await writeToLog(`\tAdvertencia: Se ha corregido el orden de las columnas.`);
      console.log('OK');
    } else {
      await writeToLog(`\tLos encabezados son válidos y están en el orden correcto.`);
      console.log('OK');
    }
  } catch (error) {
    await writeToLog(`\tError inesperado: ${error.message}`);
    console.error(`Error: ${error.message}`);
    console.log('ERROR');
    process.exit(1);
  }
}

async function writeToLog(message) {
  try {
    await fs.appendFile(logFile, `${message}\n`);
    console.log(message);
  } catch (error) {
    console.error(`Error al escribir en el log: ${error.message}`);
  }
}

// Ejecutar validación
validarEncabezados();
