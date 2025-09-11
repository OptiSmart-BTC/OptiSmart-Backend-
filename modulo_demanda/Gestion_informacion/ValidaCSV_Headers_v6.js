const fs = require('fs').promises;
const path = require('path');
const Papa = require('papaparse');

const parametroUsuario = process.argv.slice(2)[0];
const csvFilePathArg = process.argv.slice(2)[1];
const parametroFolder = parametroUsuario.toUpperCase();

const csvFilePath = csvFilePathArg ? csvFilePathArg.replace(/(^"|"$)/g, '') : '';
const logFile = path.join(__dirname, '..', '..', '..', parametroFolder, 'log', 'Logs_demanda.log');

// Requeridos (SIN CAMBIO)
const encabezadosRequeridos = [
  'Producto',
  'Canal',
  'Ubicacion',
  'Fecha',
  'Cantidad'
];

// 👇 Opcionales (NUEVO: incluir Categoria como opcional)
const encabezadosOpcionales = [
  'Categoria'
];

async function validarEncabezados() {
  try {
    await writeToLog(`Paso 02.- Validacion de Headers del CSV`);

    // Verificar que el archivo existe
    try {
      await fs.access(csvFilePath);
    } catch (error) {
      await writeToLog(`\tError: El archivo ${csvFilePath} no existe`);
      console.log('ERROR');
      process.exit(1);
    }

    if (!csvFilePath) {
      await writeToLog(`Error: No se proporcionó ruta de archivo CSV`);
      console.log('ERROR');
      process.exit(1);
    }

    // Leer el contenido del archivo CSV
    const contenidoCSV = await fs.readFile(csvFilePath, 'utf-8');

    // Parsear el contenido CSV
    const resultado = Papa.parse(contenidoCSV, { header: true });
    const data = resultado.data || [];

    // Obtener los encabezados del CSV
    const encabezadosCSV = resultado.meta.fields || [];

    // Validar requeridos
    const faltantes = encabezadosRequeridos.filter(h => !encabezadosCSV.includes(h));
    if (faltantes.length > 0) {
      await writeToLog(`\t-Encabezados faltantes: ${faltantes.join(', ')}`);
      await writeToLog(`\tError: Revisa la Plantilla. Faltan columnas obligatorias.`);
      console.log('ERROR');
      process.exit(1);
    }

    // Determinar opcionales presentes y extras
    const opcionalesPresentes = encabezadosOpcionales.filter(h => encabezadosCSV.includes(h));
    const extras = encabezadosCSV.filter(h => !encabezadosRequeridos.includes(h) && !opcionalesPresentes.includes(h));

    if (extras.length > 0) {
      // Advertencia pero no error
      await writeToLog(`\t-Encabezados extra detectados: ${extras.join(', ')}`);
    }

    // Orden preferido: Requeridos → Opcionales presentes → Extras
    const ordenPreferido = [...encabezadosRequeridos, ...opcionalesPresentes, ...extras];

    // ¿Está ya en ese orden?
    const mismoOrden = encabezadosCSV.length === ordenPreferido.length &&
      encabezadosCSV.every((h, i) => h === ordenPreferido[i]);

    if (!mismoOrden) {
      await writeToLog(`\t-El orden de los encabezados es diferente al preferido. Reordenando...`);

      // Reordenar las filas bajo el ordenPreferido, sin perder columnas
      const dataReordenada = data.map(row => {
        const nuevo = {};
        ordenPreferido.forEach(h => { nuevo[h] = row[h] ?? ''; });
        return nuevo;
      });

      const csvReordenado = Papa.unparse({
        fields: ordenPreferido,
        data: dataReordenada
      });

      await fs.writeFile(csvFilePath, csvReordenado, 'utf-8');
      await writeToLog(`\t-Se ha reordenado el archivo para que cumpla con el orden preferido (incluye Categoria si existe).`);
      console.log('OK');
    } else {
      await writeToLog(`\tLos encabezados son válidos y ya están en el orden preferido.`);
      console.log('OK');
    }

  } catch (error) {
    await writeToLog(`\tError inesperado: ${error.message}`);
    console.error(`Error: ${error.message}`);
    console.log('ERROR');
    process.exit(1);
  }
}

async function writeToLog(message) {
  try {
    await fs.appendFile(logFile, `${message}\n`);
    console.log(message);
  } catch (error) {
    console.error(`Error al escribir en el log: ${error.message}`);
  }
}

// Ejecutar validación
validarEncabezados();