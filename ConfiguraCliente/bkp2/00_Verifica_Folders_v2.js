const fs = require('fs');
const path = require('path');

const nameFolder = process.argv.slice(2)[0];

//const mainFolder = 'TEST04';
const mainFolder = `../../${nameFolder}`;
const subFolders = ['cfg', 'csv', 'log', 'reportes', 'temp', 'templates'];

// Verificar la existencia del directorio principal (TEST04)
if (!fs.existsSync(mainFolder)) {
  fs.mkdirSync(mainFolder);
}

// Función para crear subcarpetas dentro de una carpeta
function crearSubCarpetas(rutaPadre, carpetas) {
  carpetas.forEach(carpeta => {
    const ruta = path.join(rutaPadre, carpeta);
    if (!fs.existsSync(ruta)) {
      fs.mkdirSync(ruta);
    }
    // Verificar si la carpeta es 'csv' para crear subcarpetas 'in' y 'out'
    if (carpeta === 'csv') {
      const subcarpetas = ['in', 'out'];
      subcarpetas.forEach(subcarpeta => {
        const subruta = path.join(ruta, subcarpeta);
        if (!fs.existsSync(subruta)) {
          fs.mkdirSync(subruta);
        }
        // Crear el subfolder 'procesados' dentro de 'in' y 'out'
        const subrutaProcesados = path.join(subruta, 'procesados');
        if (!fs.existsSync(subrutaProcesados)) {
          fs.mkdirSync(subrutaProcesados);
        }

        const subrutaProcesados1 = path.join(subruta, 'no_procesados');
        if (!fs.existsSync(subrutaProcesados1)) {
          fs.mkdirSync(subrutaProcesados1);
        }



      });
    }

    if (carpeta === 'log') {
      const subcarpetas = ['Log_historico'];
      subcarpetas.forEach(subcarpeta => {
        const subruta = path.join(ruta, subcarpeta);
        if (!fs.existsSync(subruta)) {
          fs.mkdirSync(subruta);
        }
      });
    }

  });
}

// Crear las subcarpetas en el directorio principal
crearSubCarpetas(mainFolder, subFolders);

console.log('Estructura de carpetas creada exitosamente.');