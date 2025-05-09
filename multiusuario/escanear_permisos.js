const fs = require('fs');
const path = require('path');

// esta direccion debe apuntar a donde esten las paginas
const BASE_DIR = 'C:\\BTCOpti-WebApp\\opti-webapp\\src';

// escanea los permisos
const scanFiles = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir);

  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat && stat.isDirectory()) {
      results = results.concat(scanFiles(filePath));
    } else if (file.endsWith('.jsx') || file.endsWith('.tsx')) {
      results.push(filePath);
    }
  });

  return results;
};

// y esta extrae los permisos
const extractPermissions = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');

  // esto es lo que hace que nos traigamos los permisos, es un regex para identificar "data-permision" correctamente 
  const jsxContent = content.match(/<[^>]+>/g) || [];

  const regex = /data-permission\s*=\s*"(.*?)"/g;
  const matches = [];
  jsxContent.forEach((line) => {
    let match;
    while ((match = regex.exec(line)) !== null) {
      matches.push({
        file: filePath,
        permission: match[1],
      });
    }
  });

  return matches;
};


const generatePermissions = () => {
  try {
    const files = scanFiles(BASE_DIR);
    let permissions = [];

    files.forEach((file) => {
      const extracted = extractPermissions(file);
      if (extracted.length > 0) {
        permissions = permissions.concat(extracted);
      }
    });

    // guardamos los permisos a un json
    const outputPath = path.join(__dirname, 'permissions.json');
    fs.writeFileSync(outputPath, JSON.stringify(permissions, null, 2), 'utf8');

    console.log(`Permissions extracted and saved to ${outputPath}`);
  } catch (error) {
    console.error('Error while generating permissions:', error.message);
  }
};

generatePermissions();