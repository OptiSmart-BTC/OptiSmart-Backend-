const fs = require('fs');
const path = require('path');

// Script para corregir la función writeToLog en todos los scripts C** y P**
function fixLoggingInAllScripts() {
  const scriptsDir = __dirname;
  
  // Buscar todos los archivos C** y P**
  const files = fs.readdirSync(scriptsDir).filter(file => 
    (file.startsWith('C') || file.startsWith('P')) && 
    file.endsWith('.js') && 
    !file.includes('fix_logging')
  );

  console.log(`Encontrados ${files.length} scripts para corregir:`);
  files.forEach(file => console.log(`  ${file}`));

  const newWriteToLogFunction = `
function writeToLog(message) {
  const moment = require('moment');
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  const logMessage = \`[\${timestamp}] \${message}\`;
  
  try {
    // Lógica mejorada para determinar el directorio de log
    let parametroFolder;
    try {
      if (typeof dbName !== 'undefined' && dbName) {
        const partes = dbName.split("_");
        let parte = partes[partes.length - 1];
        
        // Si la última parte parece un timestamp (12+ dígitos), usar la anterior
        if (/^\\d{12,}$/.test(parte)) {
          parte = partes[partes.length - 2];
        }
        
        parametroFolder = parte.toUpperCase();
      } else {
        parametroFolder = 'DEFAULT';
      }
    } catch (error) {
      parametroFolder = 'DEFAULT';
    }
    
    const logFile = path.resolve(__dirname, \`../../\${parametroFolder}/log/ClasABCD_PolInvent.log\`);
    const logDir = path.dirname(logFile);
    
    // Crear directorio si no existe
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Escribir al archivo de log
    fs.appendFileSync(logFile, logMessage + '\\n');
  } catch (err) {
    // Fallback: escribir en directorio actual si hay problemas
    try {
      const fallbackLogFile = path.join(__dirname, \`\${path.basename(__filename, '.js')}_fallback.log\`);
      fs.appendFileSync(fallbackLogFile, logMessage + '\\n');
      console.error(\`Log escrito en fallback: \${fallbackLogFile}\`);
    } catch (fallbackErr) {
      // Si todo falla, solo mostrar en consola
      console.error(\`Error escribiendo log: \${err.message}\`);
      console.log(logMessage);
    }
  }
}`;

  let scriptsCorregidos = 0;
  let errores = 0;

  for (const fileName of files) {
    try {
      const filePath = path.join(scriptsDir, fileName);
      let content = fs.readFileSync(filePath, 'utf8');

      // Buscar y reemplazar la función writeToLog existente
      const writeToLogRegex = /function writeToLog\s*\([^)]*\)\s*{[^}]*}/g;
      
      if (writeToLogRegex.test(content)) {
        // Reemplazar función existente
        content = content.replace(writeToLogRegex, newWriteToLogFunction.trim());
        console.log(`✓ Reemplazada función writeToLog en ${fileName}`);
      } else {
        // Buscar si usa fs.appendFileSync directamente
        if (content.includes('fs.appendFileSync') && content.includes('logFile')) {
          // Agregar la nueva función al final del archivo, antes de la ejecución
          const mainExecutionRegex = /(if\s*\(\s*require\.main\s*===\s*module\s*\)|^\w+\(\);?\s*$)/m;
          
          if (mainExecutionRegex.test(content)) {
            content = content.replace(mainExecutionRegex, newWriteToLogFunction + '\n\n$1');
          } else {
            // Agregar al final del archivo
            content += '\n' + newWriteToLogFunction + '\n';
          }
          console.log(`✓ Agregada función writeToLog a ${fileName}`);
        } else {
          console.log(`⚠ No se encontró patrón de logging en ${fileName}`);
          continue;
        }
      }

      // Asegurar que se importa path si no está
      if (!content.includes("require('path')") && !content.includes('const path =')) {
        const pathImport = "const path = require('path');\n";
        if (content.includes("require('fs')")) {
          content = content.replace("const fs = require('fs');", `const fs = require('fs');\n${pathImport}`);
        } else {
          content = pathImport + content;
        }
      }

      // Escribir archivo corregido
      fs.writeFileSync(filePath, content);
      scriptsCorregidos++;

    } catch (error) {
      console.error(`❌ Error procesando ${fileName}: ${error.message}`);
      errores++;
    }
  }

  console.log(`\n=== RESUMEN ===`);
  console.log(`Scripts corregidos: ${scriptsCorregidos}`);
  console.log(`Errores: ${errores}`);
  console.log(`Total archivos: ${files.length}`);

  if (scriptsCorregidos > 0) {
    console.log(`\n✅ Scripts corregidos exitosamente. Ahora deberían crear logs correctamente.`);
  }
}

// Ejecutar corrección
if (require.main === module) {
  console.log('========================================');
  console.log('CORRECCIÓN UNIVERSAL DE LOGGING');
  console.log('========================================');
  fixLoggingInAllScripts();
}