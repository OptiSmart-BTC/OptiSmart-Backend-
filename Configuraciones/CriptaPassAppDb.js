const { spawn } = require('child_process');
//const dataToEncrypt = 'JT01DBPassword';
const dataToEncrypt = process.argv.slice(2)[0];
const javaProcess = spawn('java', ['CriptaUtil', dataToEncrypt]);

let encryptedData = '';

javaProcess.stdout.on('data', (data) => {
  const output = data.toString().trim();
  if (output.startsWith('Datos encriptados:')) {
    encryptedData = output.split(':')[1].trim();
  } 
});

javaProcess.stderr.on('data', (data) => {
  console.error(data.toString());
});

javaProcess.on('close', (code) => {
  if (code === 0) {
    console.log('Datos encriptados:', encryptedData);
  } else {
    console.error(`Error: El proceso Java se cerró con código de salida ${code}.`);
  }
});
