// testMontecarloSS.js
const { MongoClient } = require("mongodb");
const { decryptData } = require("../Configuraciones/DeCriptaPassAppDb");
const { host, puerto, passadmin } = require("../Configuraciones/ConexionDB");

async function main() {
  const decryptedPass = await decryptData(passadmin);
  const uri = `mongodb://admin:${decryptedPass}@${host}:${puerto}/?authSource=admin`;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const dbName = "btc_opti_try"; // 👈 ajusta el DBName según tu prueba
    const db = client.db(dbName);

    // 1) Leer slow-movers de resultados_simulaciones
    const slowMovers = await db
      .collection("resultados_simulaciones")
      .find({ "Normal?": "No" })
      .project({ SKU: 1 })
      .toArray();

    const skusSlow = slowMovers.map((d) => d.SKU);

    // 2) Buscar esos SKUs en la colección Montecarlo final
    const montecarloDocs = await db
      .collection("ui_all_pol_inv_montecarlo")
      .find({ SKU: { $in: skusSlow } })
      .project({ SKU: 1, SS_Cantidad: 1, FromMontecarlo: 1 })
      .toArray();

    // 3) Métricas rápidas
    const totalSlow = skusSlow.length;
    const withSS = montecarloDocs.filter((d) => d.SS_Cantidad != null).length;
    const withFlag = montecarloDocs.filter(
      (d) => d.FromMontecarlo === true
    ).length;

    console.log("=== Validación Montecarlo ===");
    console.log("Total slow-movers:", totalSlow);
    console.log("Con SS_Cantidad en Montecarlo:", withSS);
    console.log("Con flag FromMontecarlo:", withFlag);

    // 4) Mostrar una muestra
    console.log("Ejemplo de SKUs Montecarlo:", montecarloDocs.slice(0, 10));
  } finally {
    await client.close();
  }
}

main().catch(console.error);
