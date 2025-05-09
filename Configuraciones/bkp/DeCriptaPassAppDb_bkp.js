const { spawn } = require('child_process');
//const dataToEncrypt = 'JT01DBPassword';
const dataToDeEncrypt = process.argv.slice(2)[0];

const javaProcess = spawn('java', ['DeCriptaUtil', dataToDeEncrypt]);
//const javaProcess = spawn('C:/Program Files/Java/jdk-20/bin/java', ['DeCriptaUtil', dataToDeEncrypt]);

let decryptedData = '';


javaProcess.stdout.on('data', (data) => {
  const output = data.toString().trim();
if (output.startsWith('Datos desencriptados:')) {
    decryptedData = output.split(':')[1].trim();
  }
});


javaProcess.stderr.on('data', (data) => {
  console.error(data.toString());
});


javaProcess.on('close', (code) => {
  if (code === 0) {
    console.log('Datos desencriptados:', decryptedData);
  } else {
    console.error(`Error: El proceso Java se cerró con código de salida ${code}.`);
  }
});
