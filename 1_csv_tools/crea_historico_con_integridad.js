const fs = require('fs');
const csv = require('csv-parser');

const historicoDemandaOriginalFile = '../A001/historico_demanda_org.csv';
const skuFile = '../A001/sku.csv';
const historicoDemandaValidadoFile = '../A001/historico_demanda.csv';

fs.copyFileSync(historicoDemandaValidadoFile, historicoDemandaOriginalFile);

const skuData = {};

// Read SKU data from sku.csv
fs.createReadStream(skuFile)
  .pipe(csv())
  .on('data', (row) => {
    const ubicacion = row.Ubicacion;
    const producto = row.Producto;
    const sku = `${producto}_${ubicacion}`;
    skuData[sku] = true;
  })
  .on('end', () => {
    // Filter and write validated records to historico_demanda.csv
    const writeStream = fs.createWriteStream(historicoDemandaValidadoFile);
    writeStream.write('Ubicacion,Producto,Fecha,CantidadFacturada\n'); // Write header to the new file

    fs.createReadStream(historicoDemandaOriginalFile)
      .pipe(csv())
      .on('data', (row) => {
        const ubicacion = row.Ubicacion;
        const producto = row.Producto;
        const fecha = row.Fecha;
        const cantidadfacturada = row.CantidadFacturada;
        const sku = `${producto}_${ubicacion}`;

        if (skuData[sku]) {
          writeStream.write(`${ubicacion},${producto},${fecha},${cantidadfacturada}\n`);
        }
      })
      .on('end', () => {
        writeStream.end();
        console.log('Proceso completado. Los registros validados se han guardado en historico_demanda.csv');
      });
  });
