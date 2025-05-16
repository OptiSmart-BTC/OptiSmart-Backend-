const { spawn } = require('child_process');
//const dataToEncrypt = 'JT01DBPassword';
const dataToDeEncrypt = process.argv.slice(2)[0];


function decryptData(dataToDeEncrypt) {
  return new Promise((resolve, reject) => {
    const javaProcess = spawn('java', ['DeCriptaUtil', dataToDeEncrypt]);

    let decryptedData = '';

    javaProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output.startsWith('')) {
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

//module.exports = decryptData;

// Exportar los parámetros de conexión
module.exports = { decryptData };

