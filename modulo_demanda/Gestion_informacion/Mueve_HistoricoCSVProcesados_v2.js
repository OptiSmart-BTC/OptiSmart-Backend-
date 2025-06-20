const fs = require('fs');
const path = require('path');
const moment = require('moment');
const parametroFolder = process.argv.slice(2)[0];
const csvFilePath = process.argv.slice(2)[1]?.replace(/"/g, '');

// Usar el archivo CSV pasado como parámetro en lugar de una ruta fija
const sourcePath = csvFilePath;
const destinationFolder = path.resolve(__dirname, 'procesados_demanda');
const logFile = path.join(__dirname, '..', '..', '..', parametroFolder, 'log', 'Logs_demanda.log');

 
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}${month}${year}`;
}

function moveFile(sourcePath, destinationPath) {
  // Ensure destination directory exists
  const destinationDir = path.dirname(destinationPath);
  if (!fs.existsSync(destinationDir)) {
    fs.mkdirSync(destinationDir, { recursive: true });
  }
  
  fs.rename(sourcePath, destinationPath, (error) => {
    if (error) {
      console.error('\tError al mover el archivo:', error);
      writeToLog(`\tError al mover el archivo: ${error}`);
    } else {
      console.log('\tArchivo movido exitosamente.');
      writeToLog(`\tArchivo movido exitosamente a ${destinationPath}`);
    }
  });
}

function main() {
  const timestamp = moment().format('YYYYMMDD_HHmmss');
  writeToLog(`\nPaso 05 - Mueve Archivo Cargado a Procesados`);

  if (!sourcePath) {
    writeToLog(`\tError: No se especificó un archivo CSV para procesar.`);
    process.exit(1);
    return;
  }

  const fileName = path.basename(sourcePath);
  const fileExtension = path.extname(sourcePath);
  const newFileName = `historico_demanda_${parametroFolder}_${timestamp}${fileExtension}`;

  const destinationPath = path.join(destinationFolder, newFileName);

  moveFile(sourcePath, destinationPath);
}


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

main();