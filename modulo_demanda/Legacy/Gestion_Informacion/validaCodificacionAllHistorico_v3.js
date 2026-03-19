const fs = require('fs');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');
const path = require('path');
const csv = require('csv-parser');
const Papa = require('papaparse');

// Parámetros y rutas
const parametroFolder = process.argv[2];
const csvFilePathArg = process.argv[3]?.replace(/"/g, '');

// Configurar logs
const logFile = path.join(__dirname, '..', '..', '..', parametroFolder, 'log', 'Logs_demanda.log');

// Función principal
async function validarEncoding() {
  try {
    writeToLog('Paso 01 - Revisión de Encoding y Columnas del CSV');
    
    // 1. Leer el archivo y detectar encoding
    const contentBuffer = fs.readFileSync(csvFilePathArg);
    const detectedEncoding = jschardet.detect(contentBuffer).encoding;
    writeToLog(`\tEncoding detectado: ${detectedEncoding}`);
    
    // 2. Convertir a UTF-8
    const content = iconv.decode(contentBuffer, detectedEncoding);
    
    // 3. Parsear el CSV para manipular columnas
    const parsedResult = Papa.parse(content, {
      header: true,
      skipEmptyLines: true
    });
    
    // 4. Verificar columnas y añadir Canal si no existe
    let columnaAgregada = false;
    if (!parsedResult.meta.fields.includes('Canal')) {
      parsedResult.data.forEach(row => {
        row['Canal'] = 'default';
      });
      columnaAgregada = true;
      writeToLog(`\tSe agregó la columna 'Canal' con valor 'default'`);
    }
    
    // 5. Reordenar columnas (Producto, Canal, Ubicacion, Fecha, Cantidad)
    const columnasDeseadas = ['Producto', 'Canal', 'Ubicacion', 'Fecha', 'Cantidad'];
    
    // 6. Generar nuevo contenido CSV
    const csvActualizado = Papa.unparse(parsedResult.data, {
      columns: columnasDeseadas.filter(col => parsedResult.meta.fields.includes(col) || col === 'Canal')
    });
    
    // 7. Guardar el archivo actualizado
    fs.writeFileSync(csvFilePathArg, csvActualizado);
    
    writeToLog(`\tArchivo convertido a UTF-8${columnaAgregada ? ' y columna Canal agregada' : ''}`);
    return true;
  } catch (error) {
    writeToLog(`\tError: ${error.message}`);
    console.error(error);
    return false;
  }
}

function writeToLog(message) {
  try {
    fs.appendFileSync(logFile, `${message}\n`);
    console.log(message);
  } catch (error) {
    console.error(`Error escribiendo en log: ${error.message}`);
  }
}

// Ejecutar
validarEncoding();
