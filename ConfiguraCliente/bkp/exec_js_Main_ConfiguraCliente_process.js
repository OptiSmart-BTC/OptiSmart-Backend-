const { exec } = require('child_process');
const fs = require('fs');



const parametroUsuario = process.argv.slice(2)[0];
const parametroFolder = parametroUsuario.toUpperCase();


const archivos = [
  { nombre: '00_Verifica_Folders.js', parametros: `${parametroFolder}` },
  { nombre: '01_Crea_uservars.js', parametros: `${parametroFolder}` }
];



function ejecutarArchivos(archivos) {
  if (archivos.length === 0) {
    return;
  }

  const archivo = archivos.shift();
  const comando = `node ${archivo.nombre} ${archivo.parametros}`;

  exec(comando, (error, stdout, stderr) => {
    if (error) {
      return;
    }
    ejecutarArchivos(archivos);
  });
}


  ejecutarArchivos(archivos);
