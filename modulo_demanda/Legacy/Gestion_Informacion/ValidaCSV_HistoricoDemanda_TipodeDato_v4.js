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

// Definición de validaciones por campo
const fieldValidations = {
  Producto: { type: 'string', order: 1 },
  Canal: { type: 'string', order: 2 },
  Ubicacion: { type: 'string', order: 3 },
  Fecha: { type: 'date', format: 'DD/MM/YYYY', order: 4 },
  Cantidad: { type: 'decimal', order: 5 }
};

// Función para validar un campo según su tipo
function validateField(field, value, rowFields) {
  const validation = fieldValidations[field];
  
  if (!validation) {
    return true; // campos no definidos se consideran válidos
  }

  // Validar el orden relativo (no el índice absoluto)
  const requiredOrder = validation.order;
  const actualOrder = Object.keys(rowFields).indexOf(field) + 1;
  
  if (requiredOrder !== actualOrder) {
    return false;
  }
  
  // Validación por tipo
  switch (validation.type) {
    case 'int':
      return !isNaN(value) && Number.isInteger(Number(value));
    case 'decimal':
      return !isNaN(value) && !Number.isNaN(parseFloat(value));
    case 'date':
      return moment(value, validation.format, true).isValid();
    case 'string':
      const forbiddenChars = ['@', '#', '$', '%'];
      return typeof value === 'string' && !forbiddenChars.some(char => value.includes(char));
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

    // Validar todos los campos requeridos
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
