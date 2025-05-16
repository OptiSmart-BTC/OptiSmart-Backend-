const fs = require('fs');
const csv = require('csv-parser');
const moment = require('moment');

const inputFile = '../A000/historico_demanda.csv';
const outputFileOk = '../A000/historico_demanda_ok.csv';
const outputFileError = '../A000/historico_demanda_error.csv';

const validateFields = (row) => {
  const ubicacion = row.Ubicacion;
  const producto = row.Producto;
  const fecha = row.Fecha;
  const cantidadFacturada = row.CantidadFacturada;

  const isAlphanumeric = /^[a-zA-Z0-9\s]+$/;
  const isDecimal = /^\d+(\.\d+)?$/;
  const isValidDate = moment(fecha, 'DD/MM/YYYY', true).isValid();

  const isValidUbicacion = isAlphanumeric.test(ubicacion);
  const isValidProducto = isAlphanumeric.test(producto);
  const isValidFecha = isValidDate;
  const isValidCantidadFacturada = isDecimal.test(cantidadFacturada);

  return {
    isValidUbicacion,
    isValidProducto,
    isValidFecha,
    isValidCantidadFacturada,
  };
};

fs.createReadStream(inputFile)
  .pipe(csv())
  .on('data', (row) => {
    const validationResult = validateFields(row);

    if (
      validationResult.isValidUbicacion &&
      validationResult.isValidProducto &&
      validationResult.isValidFecha &&
      validationResult.isValidCantidadFacturada
    ) {
      fs.appendFileSync(outputFileOk, `${Object.values(row).join(',')}\n`);
    } else {
      fs.appendFileSync(outputFileError, `${Object.values(row).join(',')}\n`);
    }
  })
  .on('end', () => {
    console.log('Análisis completado. Archivos generados: historico_demanda_ok.csv e historico_demanda_error.csv');
  });
