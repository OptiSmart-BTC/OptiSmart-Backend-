const fs = require('fs');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');
const moment = require('moment');

const now = moment().format('YYYY-MM-DD');

const parametroUsuario = process.argv.slice(2)[0];
const parametroFolder = parametroUsuario.toUpperCase();

const filePath = `../../${parametroFolder}/csv/historico_demanda.csv`;
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`; // Cambia esta ruta según la ubicación de tu archivo CSV

writeToLog(`Paso 01 - Revision de Encoding del CSV`);
// Leer el contenido del archivo en un buffer
const contentBuffer = fs.readFileSync(filePath);

// Detectar la codificación del archivo
const detectedResult = jschardet.detect(contentBuffer);
const detectedEncoding = detectedResult.encoding;

//console.log(detectedEncoding);

const originalFilePath = filePath.replace('.csv', `_org_${now}.csv`);
const newFilePath = filePath;
const tempFolderPath = `../../${parametroFolder}/temp`;
const movedFilePath = `${tempFolderPath}/historico_demanda_org_${now}.csv`;

// Renombrar el archivo original agregando el sufijo "_org.csv"
fs.renameSync(filePath, originalFilePath);
//console.log(`El archivo original se ha renombrado a "${originalFilePath}".`);

// Convertir el contenido a UTF-8 sin BOM
const content = iconv.decode(contentBuffer, detectedEncoding);
const utf8Content = iconv.encode(content, 'utf-8');

// Guardar el contenido convertido en un nuevo archivo
fs.writeFileSync(newFilePath, utf8Content);
//console.log(`El archivo "${newFilePath}" se ha convertido a UTF-8 sin BOM.`);
writeToLog(`\tValidacion de Encoding del archivo historico_demanda.csv realizada con exito.\n`);

// Mover el archivo renombrado a la carpeta temporal
if (!fs.existsSync(tempFolderPath)) {
  fs.mkdirSync(tempFolderPath);
}

fs.renameSync(originalFilePath, movedFilePath);
//console.log(`El archivo "${originalFilePath}" se ha movido a "${movedFilePath}".`);

function writeToLog(message) {
  fs.appendFileSync(logFile, message + '\n');
}