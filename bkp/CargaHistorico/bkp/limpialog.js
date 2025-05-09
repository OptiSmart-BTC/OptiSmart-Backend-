const fs = require('fs');

const parametroFolder = 'CR001';
const logFileName = 'LogdeCargaCSV';
const filePath = `../../${parametroFolder}/log/${logFileName}.log`;

fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error(err);
    return;
  }

  const lines = data.split('\n');
  const keyword = 'HISTORICO DE DEMANDA';
  const resultLines = [];
  let deleteLines = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(keyword)) {
      deleteLines = true;
      continue;
    }

    if (!deleteLines) {
        
      resultLines.push(lines[i-1]);
    }
  }

  const result = resultLines.join('\n');

  // Write the result back to the file
  fs.writeFile(filePath, result, 'utf8', (err) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log('Lines after the keyword have been removed successfully.');
  });
});
