const fs = require('fs');
const path = require('path');
const moment = require('moment');
const parametroFolder = process.argv.slice(2)[0];

const sourcePath = `../../${parametroFolder}/csv/in/sku.csv`;
const destinationFolder = `../../${parametroFolder}/csv/in/procesados`;
//const destinationFolder = '/ruta/a/la/carpeta/procesados';
//const sourcePath = `../../CR001/sku.csv`;
//const destinationFolder = `../../CR001/procesados`;
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`; 

 
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}${month}${year}`;
}

function moveFile(sourcePath, destinationPath) {
  fs.rename(sourcePath, destinationPath, (error) => {
    if (error) {
      console.error('\tError al mover el archivo:', error);
    } else {
      console.log('\tArchivo movido exitosamente.');
    }
  });
}

function main() {
  const timestamp = moment().format('YYYYMMDD_HHmmss');
  //writeToLog(`\n`);
  writeToLog(`\nPaso 05 - Mueve Archivo Cargado a Procesados`);

  const currentDate = new Date();
  const formattedDate = formatDate(currentDate);

  const fileName = path.basename(sourcePath);
  const fileExtension = path.extname(sourcePath);
  const newFileName = `sku_${timestamp}${fileExtension}`;

  const destinationPath = path.join(destinationFolder, newFileName);

  moveFile(sourcePath, destinationPath);
  writeToLog(`\tSe movio archivo sin errores`);

}


function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}

main();
