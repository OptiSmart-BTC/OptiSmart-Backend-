const fs = require('fs');
const csv = require('csv-parser');
const moment = require('moment');

const parametroUsuario = process.argv.slice(2)[0];
const parametroFolder = parametroUsuario.toUpperCase();

const inputFile = `../../${parametroFolder}/csv/in/sku.csv`;
const logFileName = 'LogdeCargaCSV';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;

const fieldValidations = {
  Producto: { type: 'string', pattern: /^[A-Za-z0-9]+$/ },
  Ubicacion: { type: 'string', pattern: /^[A-Za-z0-9]+$/ },
  Origen_Abasto: { type: 'stringnullable', pattern: /^[A-Za-z0-9\s]*$/ }, // Permitir valores vacíos o alfanuméricos
  Cantidad_Demanda_Indirecta: { type: 'decimal' },
  Nivel_OA: { type: 'int', validValues: [1, 2, 3] }, // Solo 1, 2 o 3

  Medida_Override: { type: 'stringMO', pattern: /^[A-Za-z0-9 ]+$/ },
  Tipo_Override: { type: 'stringTO', pattern: /^[A-Za-z0-9 ]+$/ },
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
    case 'stringnullable': // Nueva validación para campos que pueden estar vacíos
      return value === null || value === '' || (typeof value === 'string' && validation.pattern.test(value));
    case 'stringnullesp':
      return value === null || value === '' || (typeof value === 'string' && validation.pattern.test(value));
    case 'int':
      return value === null || value === '' || Number.isInteger(Number(value));
    case 'stringMO':
      return (value === 'Cantidad' || value === 'Dias de Cobertura' || value === null || value === '') || 
             (typeof value === 'string' && validation.pattern.test(value));
    case 'stringTO':
      return (value === 'SS' || value === 'ROP' || value === null || value === '') || 
             (typeof value === 'string' && validation.pattern.test(value));
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
writeToLog(`Paso 03.- Validación de tipos de dato`);

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
      writeToLog(`\t-Fila ${filaActual}, Campo(s): ${invalidFields.join(', ')}`);
    }
  })
  .on('end', () => {
    try {
      if (hasErrors) {
        console.log('ERROR');
        writeToLog('Se encontraron errores en el archivo.');
      } else {
        writeToLog(`\tEl archivo está correcto. No se encontraron errores. Total de filas: ${filaActual}`);
        console.log('ÉXITO');
      }
    } catch (error) {
      console.error('Ocurrió un error al procesar el archivo:', error);
    }
  });



  