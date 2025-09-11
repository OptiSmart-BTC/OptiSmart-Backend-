const fs = require('fs');
const csv = require('csv-parser');
const moment = require('moment');
const path = require('path');

// Parámetros
const parametroUsuario = process.argv[2];
const inputFile = process.argv[3]?.replace(/"/g, '');
const parametroFolder = parametroUsuario.toUpperCase();

// Configuración de logs
const logFile = path.join(__dirname, '..', '..', '..', parametroFolder, 'log', 'Logs_demanda.log');

// Verificar que el archivo existe
if (!inputFile || !fs.existsSync(inputFile)) {
  writeToLog(`Error: El archivo ${inputFile} no existe o no se proporcionó`);
  console.log('ERROR');
  process.exit(1);
}

// Campos opcionales (para reglas suaves)
const OPTIONAL_FIELDS = new Set(['Categoria']);

// Definición de validaciones por campo
// NOTA: "Categoria" se agrega como OPCIONAL con orden 6.
const fieldValidations = {
  Producto:  { type: 'string',  order: 1 },
  Canal:     { type: 'string',  order: 2 },
  Ubicacion: { type: 'string',  order: 3 },
  Fecha:     { type: 'date',    format: 'DD/MM/YYYY', order: 4 },
  Cantidad:  { type: 'decimal', order: 5 },
  Categoria: { type: 'string',  order: 6 } // OPCIONAL
};

// Función para validar un campo según su tipo
function validateField(field, value, rowFields) {
  const validation = fieldValidations[field];
  if (!validation) {
    // Campos no definidos se consideran válidos
    return true;
  }

  // Validar el orden relativo (no el índice absoluto)
  // (csv-parser preserva el orden de columnas del CSV)
  const requiredOrder = validation.order;
  const actualOrder = Object.keys(rowFields).indexOf(field) + 1;

  // Si el campo está presente en la fila, verificamos su posición
  if (actualOrder > 0 && requiredOrder !== actualOrder) {
    return false;
  }

  // Si el campo es opcional y viene vacío o null, lo consideramos válido
  if (OPTIONAL_FIELDS.has(field)) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return true;
    }
  }

  // Validación por tipo
  switch (validation.type) {
    case 'int':
      return !isNaN(value) && Number.isInteger(Number(value));

    case 'decimal':
      return !isNaN(value) && !Number.isNaN(parseFloat(value));

    case 'date':
      return moment(String(value).trim(), validation.format, true).isValid();

    case 'string':
      // Permitir letras, números, espacios y algunos signos comunes; prohibir '@', '#', '$', '%'
      const forbiddenChars = ['@', '#', '$', '%'];
      const val = String(value);
      return typeof val === 'string' && !forbiddenChars.some(char => val.includes(char));

    default:
      return true;
  }
}

function writeToLog(message) {
  try {
    fs.appendFileSync(logFile, `${message}\n`);
    console.log(message);
  } catch (error) {
    console.error(`Error al escribir en el log: ${error.message}`);
  }
}

// Inicio de validación
let hasErrors = false;
writeToLog(`Paso 03 - Validacion de tipos de Datos`);

fs.createReadStream(inputFile)
  .on('error', (error) => {
    writeToLog(`Error al leer el archivo: ${error.message}`);
    console.log('ERROR');
    process.exit(1);
  })
  .pipe(csv())
  .on('data', (row) => {
    let isValid = true;
    const invalidFields = [];

    // Validar todos los campos presentes en la fila
    for (const field in row) {
      const value = row[field];
      if (!validateField(field, value, row)) {
        isValid = false;
        invalidFields.push(field);
      }
    }

    if (!isValid) {
      hasErrors = true;
      writeToLog(`Fila inválida: ${JSON.stringify(row)}, Campos inválidos: ${invalidFields.join(', ')}`);
    }
  })
  .on('end', () => {
    if (hasErrors) {
      writeToLog('\tSe encontraron errores en el archivo. Revise los detalles anteriores.');
      console.log('ERROR');
      process.exit(1);
    } else {
      writeToLog('\tEl archivo está correcto. No se encontraron errores.\n');
      console.log('EXITO');
      process.exit(0);
    }
  });