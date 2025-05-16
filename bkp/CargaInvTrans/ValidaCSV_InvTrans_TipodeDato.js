const fs = require('fs');
const csv = require('csv-parser');
const moment = require('moment');


const parametroUsuario = process.argv.slice(2)[0];
const parametroFolder = parametroUsuario.toUpperCase();

const inputFile = `../../${parametroFolder}/csv/inventario_transito.csv`;
const logFileName = 'LogdeCargaInvCSV';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;


const fieldValidations = {
  Producto: { type: 'string', pattern: /^[A-Za-z0-9]+$/ },
  Ubicacion: { type: 'string', pattern: /^[A-Za-z0-9]+$/ },
  Cantidad_Transito: { type: 'int' }
};

function validateField(field, value) {

  const validation = fieldValidations[field];

  if (!validation) {
    return true; // Campo no definido, se considera válido
  }

  switch (validation.type) {
    case 'string':
      return typeof value === 'string' && validation.pattern.test(value);
    case 'int':
      return Number.isInteger(Number(value));
    case 'decimal':
      return !isNaN(value) && !Number.isNaN(parseFloat(value));
    case 'decimalOrBlank':
      return value.trim() === '' || (!isNaN(value) && !Number.isNaN(parseFloat(value)));
    default:
      return true;
  }
}

function writeToLog(message) {
  fs.appendFileSync(logFile, `${message}\n`);
}


let hasErrors = false; // Variable para verificar si se encontraron errores

writeToLog(`Paso 02.- Validacion de tipos de Dato`);


fs.createReadStream(inputFile)
  .pipe(csv())
  .on('data', (row) => {
    let isValid = true;
    const invalidFields = [];

    for (const field in row) {
      const value = row[field];
      if (!validateField(field, value)) {
        isValid = false;
        invalidFields.push(field);
      }
    }

    if (!isValid) {
      hasErrors = true;
      writeToLog(`Fila inválida: ${JSON.stringify(row)}, \nCampos inválidos: ${invalidFields.join(', ')} \n`);
    }
  })
  .on('end', () => {
    try {
      if (hasErrors) {
        console.log('ERROR');
        const error = new Error('ERROR');
      } else {
        writeToLog('\tEl archivo está correcto. No se encontraron errores.');
        console.log('EXITO');
      }
    } catch (error) {
      console.error('\tOcurrió un error al procesar el archivo:', error);
    }
  });

