const fs = require('fs');
const path = require('path');

const nameFolder = process.argv.slice(2)[0];

//const mainFolder = 'TEST04';
const mainFolder = `../../${nameFolder}`;
const subFolders = ['cfg', 'csv', 'log', 'reportes', 'temp', 'templetes'];
const nestedFolders = {
  csv: ['procesados'],
  log: ['Log_historico']
};

// Verificar la existencia del directorio principal (TEST04)
if (!fs.existsSync(mainFolder)) {
  fs.mkdirSync(mainFolder);
}

// Verificar la existencia y crear los subdirectorios dentro de TEST04
subFolders.forEach(subFolder => {
  const folderPath = path.join(mainFolder, subFolder);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
  }
});

// Verificar la existencia y crear los subdirectorios anidados
Object.entries(nestedFolders).forEach(([parentFolder, childFolders]) => {
  const parentFolderPath = path.join(mainFolder, parentFolder);
  if (!fs.existsSync(parentFolderPath)) {
    fs.mkdirSync(parentFolderPath);
  }

  childFolders.forEach(childFolder => {
    const nestedFolderPath = path.join(parentFolderPath, childFolder);
    if (!fs.existsSync(nestedFolderPath)) {
      fs.mkdirSync(nestedFolderPath);
    }
  });
});

console.log('Estructura de carpetas creada correctamente.');
