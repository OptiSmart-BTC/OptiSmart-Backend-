const { spawn } = require('child_process');

function decryptData(dataToDeEncrypt) {
  return new Promise((resolve, reject) => {
    const javaProcess = spawn('java', ['DeCriptaUtil', dataToDeEncrypt]);
    let decryptedData = '';

    javaProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output.startsWith('Datos desencriptados:')) {
        decryptedData = output.split(':')[1].trim();
      }
    });

    javaProcess.stderr.on('data', (data) => {
      reject(data.toString());
    });

    javaProcess.on('close', (code) => {
      if (code === 0) {
        resolve(decryptedData);
      } else {
        reject(`Error: El proceso Java se cerró con código de salida ${code}.`);
      }
    });
  });
}

// Llamar a la función decryptData con el dato que deseas desencriptar
//const dataToDeEncrypt = 'Hu9oLwNPs9Z4RnCKUeMWBQ==';
const dataToDeEncrypt = process.argv.slice(2)[0];
decryptData(dataToDeEncrypt)
  .then((decryptedData) => {
    //console.log("Datos desencriptados:", decryptedData);
  })
  .catch((err) => {
    //console.error("Error al desencriptar:", err);
  });



  // Exportar los parámetros de conexión
module.exports = { decryptData };