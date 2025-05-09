const fs = require('fs');
const csv = require('csv-parser');
const moment = require('moment');
const { Console } = require('console');

const parametroUsuario = process.argv.slice(2)[0];
const parametroFolder = parametroUsuario.toUpperCase();

const inputFile = `../../${parametroFolder}/csv/historico_demanda.csv`;
//const logFile = `../../${parametroFolder}/log/ValidationHistorico_Demanda.log`;

const logFileName = 'LogdeCargaCSV';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
//const logFolder = `../../${parametroFolder}/log/Log_historico`;



const fieldValidations = {
  Ubicacion: { type: 'string', order: 1 },
  Producto: { type: 'string', order: 2 },
  Fecha: { type: 'date', format: 'DD/MM/YYYY', order: 3 },
  CantidadFacturada: { type: 'decimal', order: 4 }
};

function validateField(field, value, currentIndex) {
  const validation = fieldValidations[field];
  
  if (!validation) {
    return true; // cuando el campo no definido, se considera válido
  }

  // se calida el orden del campo
  if (validation.order !== currentIndex) {
    return false;
  }
  
  switch (validation.type) {
    case 'int':
      return !isNaN(value) && Number.isInteger(Number(value));
    case 'decimal':
      return !isNaN(value) && !Number.isNaN(parseFloat(value));
    case 'date':
      return moment(value, validation.format, true).isValid();
    case 'string':
      const forbiddenChars = ['@', '#', '$', '%'];
      return !forbiddenChars.some(char => value.includes(char));
    default:
      return true;
  }
}

function writeToLog(message) {
  //const now = moment().format('YYYY-MM-DD HH:mm:ss');
  fs.appendFileSync(logFile, `${message}\n`);
}


/*
if (fs.existsSync(logFile)) {
  const timestamp = moment().format('YYYYMMDD_HHmmss');
  const renamedLogFile = `../../${parametroFolder}/log/Log_historico/${logFileName}_${timestamp}.log`;
  
  // con esto se creal el folder si no existe
  if (!fs.existsSync(logFolder)) {
    fs.mkdirSync(logFolder);
  }
  
  //console.log(`${renamedLogFile}`);
  // aqui se mueve el archivo existente a Log_historico
  fs.renameSync(logFile, `${renamedLogFile}`);
}*/
//---------------------------------------------------------------

// limpiar y actualizar el archivo de log
//fs.writeFileSync(logFile, '');

let hasErrors = false; // es una variable para verificar si se encontraron errores

writeToLog(`Paso 02 - Validacion de tipos de Dato`);

fs.createReadStream(inputFile)
  .pipe(csv())
  .on('data', (row) => {
    let isValid = true;
    const invalidFields = [];

    let currentIndex = 1;

    for (const field in row) {
      const value = row[field];
      if (!validateField(field, value, currentIndex)) {
        isValid = false;
        invalidFields.push(field);
      }
      currentIndex++;
    }

    if (!isValid) {
      hasErrors = true;
      writeToLog(`Fila inválida: ${JSON.stringify(row)}, Campos inválidos: ${invalidFields.join(', ')}`);
    }
  })
  .on('end', () => {
    if (hasErrors) {
      console.log('ERROR');
      const error = new Error('ERROR');
      //console.log('Se encontraron errores. Revisa el archivo de log para ver los detalles.');
    } else {
      writeToLog('\tEl archivo está correcto. No se encontraron errores.\n');
      console.log('EXITO');
      //writeToLog('El archivo está correcto. No se encontraron errores.');
      //console.log('El archivo está correcto. Revisa el archivo de log para confirmar.');
    }
  });
