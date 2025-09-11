const fs = require('fs');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');
const path = require('path');
const csv = require('csv-parser'); // (no se usa aquí, lo dejamos por consistencia)
const Papa = require('papaparse');

// Parámetros y rutas
const parametroFolder = process.argv[2];
const csvFilePathArg = process.argv[3]?.replace(/"/g, '');

// Configurar logs
const logFile = path.join(__dirname, '..', '..', '..', parametroFolder, 'log', 'Logs_demanda.log');

async function validarEncoding() {
  try {
    writeToLog('Paso 01 - Revisión de Encoding y Columnas del CSV');

    // 1) Leer y detectar encoding (fallback a UTF-8)
    const contentBuffer = fs.readFileSync(csvFilePathArg);
    const detection = jschardet.detect(contentBuffer);
    const detectedEncoding = (detection && detection.encoding) ? detection.encoding : 'utf-8';
    writeToLog(`\tEncoding detectado: ${detectedEncoding}`);

    // 2) Convertir a UTF-8
    const content = iconv.decode(contentBuffer, detectedEncoding);

    // 3) Parsear el CSV
    const parsedResult = Papa.parse(content, {
      header: true,
      skipEmptyLines: true
    });

    if (!parsedResult || !parsedResult.meta || !Array.isArray(parsedResult.data)) {
      throw new Error('No se pudo parsear el CSV o está vacío.');
    }

    const originalFields = parsedResult.meta.fields || [];
    const rows = parsedResult.data;

    // 4) Asegurar columna "Canal" (si no existe, poner "default")
    let columnaAgregada = false;
    if (!originalFields.includes('Canal')) {
      rows.forEach(row => { row.Canal = 'default'; });
      columnaAgregada = true;
      writeToLog(`\tSe agregó la columna 'Canal' con valor 'default'`);
    }

    // 5) Orden preferido base
    const baseOrder = ['Producto', 'Canal', 'Ubicacion', 'Fecha', 'Cantidad'];

    // 6) Incluir "Categoria" si existe en el CSV (opcional)
    const hasCategoria = originalFields.includes('Categoria') || rows.some(r => r.Categoria !== undefined);
    const optionalOrder = hasCategoria ? ['Categoria'] : [];

    // 7) Conservar columnas extra (para no perder información)
    const known = new Set([...baseOrder, ...optionalOrder]);
    const extras = originalFields.filter(f => !known.has(f));

    // 8) Order final: requeridos → Categoria (si existe) → extras
    const finalFields = [...baseOrder, ...optionalOrder, ...extras];

    // 9) Reescribir filas respetando el nuevo orden (rellenar vacíos con '')
    const normalizedRows = rows.map(row => {
      const out = {};
      finalFields.forEach(f => { out[f] = (row[f] !== undefined && row[f] !== null) ? row[f] : ''; });
      return out;
    });

    // 10) Generar CSV UTF-8 con el nuevo orden
    const csvActualizado = Papa.unparse({
      fields: finalFields,
      data: normalizedRows
    });

    fs.writeFileSync(csvFilePathArg, csvActualizado, 'utf8');

    writeToLog(
      `\tArchivo convertido a UTF-8${
        columnaAgregada ? ' y columna Canal agregada' : ''
      }. Columnas finales: ${finalFields.join(', ')}`
    );
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
