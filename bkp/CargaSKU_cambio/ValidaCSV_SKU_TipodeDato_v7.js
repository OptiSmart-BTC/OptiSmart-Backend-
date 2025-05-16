const fs = require('fs');
const csv = require('csv-parser');
const moment = require('moment');




const parametroUsuario = process.argv.slice(2)[0];
const parametroFolder = parametroUsuario.toUpperCase();

const inputFile = `../../${parametroFolder}/csv/sku.csv`;
const logFileName = 'LogdeCargaCSV';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;


const fieldValidations = {
  Producto: { type: 'string', pattern: /^[A-Za-z0-9]+$/ },
  Ubicacion: { type: 'string', pattern: /^[A-Za-z0-9]+$/ },
  //OverrideClasificacionABCD: { type: 'string', pattern: /^[ABCD-]$/ },
  OverrideSafetyStock_UOM_Base: { type: 'decimalOrBlank' },
  MargenUnitario: { type: 'decimal' },
  LeadTime_Abasto_Dias: { type: 'int' },
  Frecuencia_Revision_Dias: { type: 'int' },
  Fill_Rate: { type: 'decimal' },
  MOQ: { type: 'int' },
  Tamano_Lote: { type: 'int' },
  Unidades_Pallet: { type: 'decimal' },
  Costo_Unidad: { type: 'decimal' },
  Tolerancia_Vida_Util_Dias: { type: 'int' },
  Vida_Util_Dias: { type: 'int' },
  Unidad_Medida_UOM: { type: 'stringnullesp', pattern: /^[A-Za-z0-9 ]+$/ },
  Unidades_Empaque: { type: 'decimal' },
};

function validateField(field, value) {

  const validation = fieldValidations[field];

  if (!validation) {
    return true; // Campo no definido, se considera válido
  }

  switch (validation.type) {
    case 'string':
      return typeof value === 'string' && validation.pattern.test(value);
    case 'stringnullesp':
      return value === null || value === '' || (typeof value === 'string' && validation.pattern.test(value));
    case 'int':
      return value === null || value === '' || (Number.isInteger(Number(value)));
    //case 'int':
      //return Number.isInteger(Number(value));
    //case 'decimal':
      //return !isNaN(value) && !Number.isNaN(parseFloat(value));
    case 'decimal':
      return value === null || value === '' || (!isNaN(value) && !Number.isNaN(parseFloat(value)));
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
let filaActual = 0;
writeToLog(`Paso 03.- Validacion de tipos de Dato`);



fs.createReadStream(inputFile)
  .pipe(csv())
  .on('data', (row) => {
    filaActual++;

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
      writeToLog(`\t-Fila ${filaActual}, Campo: ${invalidFields.join(', ')}`);
    }
  })
  .on('end', () => {
    try {
      if (hasErrors) {
        console.log('ERROR');
        const error = new Error('ERROR');
        // Puedes hacer algo con el error si lo necesitas
      } else {
        writeToLog(`\tEl archivo está correcto. No se encontraron errores. Total de filas: ${filaActual}`);
        console.log('EXITO');
      }
    } catch (error) {
      console.error('Ocurrió un error al procesar el archivo:', error);
    }
  });



  