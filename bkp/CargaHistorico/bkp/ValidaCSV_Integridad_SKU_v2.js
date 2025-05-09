const fs = require('fs');
const csv = require('csv-parser');
const moment = require('moment');

const parametroUsuario = process.argv.slice(2)[0];
const parametroFolder = parametroUsuario.toUpperCase();

const historicoDemandaFile = `../../${parametroFolder}/historico_demanda.csv`;
const skuFile = `../../${parametroFolder}/sku.csv`;


//const logFileName = 'ValidationIntegridad';
const logFileName = 'LogdeCargaCSV';
const logFile = `../../${parametroFolder}/log/${logFileName}.log`;
const logFolder = `../../${parametroFolder}/Log_historico`;


function writeToLog(message) {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  fs.appendFileSync(logFile, `${now} - ${message}\n`);
}

/*
// Verificar si el archivo de log ya existe
if (fs.existsSync(logFile)) {
  const timestamp = moment().format('YYYYMMDD_HHmmss');
  //const renamedLogFile = `${logFileName}_${timestamp}`;
  const renamedLogFile = `../../${parametroFolder}/log/Log_historico/${logFileName}_${timestamp}.log`;

  // Crear el folder Log_historico si no existe
  if (!fs.existsSync(logFolder)) {
    fs.mkdirSync(logFolder);
  }
  
  // Mover el archivo existente a Log_historico
  //fs.renameSync(logFile, `${logFolder}/${renamedLogFile}`);
  fs.renameSync(logFile, `${renamedLogFile}`);
}


// Limpiar y actualizar el archivo de log
fs.writeFileSync(logFile, '');
*/

const skuData = {};

/*function writeToLog(message) {
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  fs.appendFileSync(logFile, `${now} - ${message}\n`);
}*/

// Limpiar y actualizar el archivo de log
//fs.writeFileSync(logFile, '');

// Read SKU data from sku.csv
fs.createReadStream(skuFile)
  .pipe(csv())
  .on('data', (row) => {
    const ubicacion = row.Ubicacion;
    const producto = row.Producto;
    const sku = `${producto}_${ubicacion}`;
    skuData[sku] = true;
  })
  .on('end', () => {
    // Check SKU data in historico_demanda.csv
    fs.createReadStream(historicoDemandaFile)
      .pipe(csv())
      .on('data', (row) => {
        const ubicacion = row.Ubicacion;
        const producto = row.Producto;
        const sku = `${producto}_${ubicacion}`;
        
        if (!skuData[sku]) {
          writeToLog(`SKU no encontrado en sku.csv: ${sku}`);
        }
      })
      .on('end', () => {
        if (fs.readFileSync(logFile, 'utf8').trim() === '') {
          writeToLog('No se encontraron errores en la integridad de los SKU.');
        }
        console.log('Proceso completado. Revisa el archivo de log para ver los resultados.');
      });
  });
