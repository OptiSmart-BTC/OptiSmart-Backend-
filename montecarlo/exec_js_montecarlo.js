const { spawn } = require("child_process");
const { MongoClient } = require("mongodb");
const { decryptData } = require("./DeCriptaPassAppDb");
const { host, puerto, passadmin } = require("../Configuraciones/ConexionDB");

const [parametroUsuario, tipoProceso] = process.argv.slice(2);
const {
  GB_DBName,
} = require(`../Configuraciones/dbUsers/${parametroUsuario}.dbnamevar.js`);
const parametroFolder = GB_DBName.toUpperCase();
const {
  DBUser,
  DBPassword,
  DBName,
} = require(`../../${parametroFolder}/cfg/dbvars`);
const dbName = `btc_opti_${DBName}`;
const rutaBaseScripts = "C:/OptiBack/ClasifABCD_PoliticaInvent"; // Ruta a los scripts

async function copiarColeccion(client, dbName, tipoProceso) {
  const db = client.db(dbName);
  const origen =
    tipoProceso === "Diario"
      ? "politica_inventarios_01"
      : "politica_inventarios_01_sem";
  const destino =
    tipoProceso === "Diario"
      ? "politica_inventarios_montecarlo"
      : "politica_inventarios_montecarlo_sem";

  await db.collection(destino).deleteMany({});
  const documentos = await db.collection(origen).find({}).toArray();
  if (documentos.length > 0) {
    await db.collection(destino).insertMany(documentos);
    console.log(`Copiada colección ${origen} a ${destino}.`);
  } else {
    console.log(`No hay documentos en ${origen} para copiar.`);
  }
  return destino;
}

async function actualizarDatos(client, coleccionMontecarlo) {
  try {
    const db = client.db(`btc_opti_${DBName}`);
    const simulacionesCollection = db.collection("resultados_simulaciones");
    const inventariosCollection = db.collection(coleccionMontecarlo);

    const simulacionesDocs = await simulacionesCollection.find({}).toArray();
    const inventariosDocs = await inventariosCollection.find({}).toArray();

    for (const inventario of inventariosDocs) {
      const skuInventario = inventario.SKU;
      const matchingSimulacion = simulacionesDocs.find(
        (simulacion) => simulacion.SKU === skuInventario
      );

      if (matchingSimulacion) {
        const mejor = matchingSimulacion.mejor?.toLowerCase();
        const columnas = {
          dia: "SS_Diario",
          sem: "SS_Semanal",
          opti: "SS_Opti",
          mod: "SS_Modelo",
        };

        if (!columnas[mejor]) {
          console.warn(
            `Valor de 'mejor' inválido o no definido para SKU: ${skuInventario}`
          );
          continue;
        }

        const columnaSeleccionada = columnas[mejor];
        const valorSeleccionado = matchingSimulacion[columnaSeleccionada];

        if (valorSeleccionado == null) {
          console.warn(
            `Columna ${columnaSeleccionada} no tiene valor para SKU: ${skuInventario}`
          );
          continue;
        }

        await inventariosCollection.updateOne(
          { _id: inventario._id },
          { $set: { SS_Cantidad: valorSeleccionado } }
        );

        console.log(
          `Actualizado SKU ${skuInventario} con valor ${valorSeleccionado} en SS_Cantidad`
        );
      }
    }

    console.log("Actualización completada.");
  } catch (error) {
    console.error("Error al actualizar los datos:", error);
  }
}

async function ejecutarMontecarlo(passadminDeCripta) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("py", [
      "outputAExcel.py",
      dbName,
      DBUser,
      passadminDeCripta,
      host,
      puerto,
    ]);

    pythonProcess.stdout.on("data", (data) => console.log(`stdout: ${data}`));
    pythonProcess.stderr.on("data", (data) => console.error(`stderr: ${data}`));

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Error en Montecarlo: código ${code}`));
      } else {
        console.log("Montecarlo ejecutado correctamente.");
        resolve();
      }
    });
  });
}

async function ejecutarScript(
  nombreScript,
  dbName,
  DBUser,
  passadminDeCripta,
  coleccionMontecarlo
) {
  return new Promise((resolve, reject) => {
    console.log(
      `\n[INFO] Ejecutando ${nombreScript} sobre colección: ${coleccionMontecarlo}`
    );
    const proceso = spawn("node", [
      nombreScript,
      dbName,
      DBUser,
      passadminDeCripta,
      coleccionMontecarlo,
    ]);

    proceso.stdout.on("data", (data) =>
      console.log(`stdout [${nombreScript}]: ${data}`)
    );
    proceso.stderr.on("data", (data) =>
      console.error(`stderr [${nombreScript}]: ${data}`)
    );

    proceso.on("close", (code) => {
      if (code === 0) {
        console.log(`${nombreScript} ejecutado con éxito.`);
        resolve();
      } else {
        console.error(`${nombreScript} terminó con error código ${code}`);
        reject(new Error(`${nombreScript} terminó con error código ${code}`));
      }
    });
  });
}

async function getDecryptedPassadmin() {
  try {
    return await decryptData(`${DBPassword}`);
  } catch (error) {
    console.error("Error al desencriptar la contraseña:", error);
    throw error;
  }
}

async function main() {
  try {
    if (!tipoProceso)
      throw new Error(
        "Debe especificar el tipo de proceso: 'Diario' o 'Semanal'"
      );

    const passadminDeCripta = await getDecryptedPassadmin();
    const uri = `mongodb://${encodeURIComponent(DBUser)}:${encodeURIComponent(
      passadminDeCripta
    )}@${host}:${puerto}/?authSource=admin`;
    const client = new MongoClient(uri);
    await client.connect();

    const coleccionMontecarlo = await copiarColeccion(
      client,
      `btc_opti_${DBName}`,
      tipoProceso
    );
    await ejecutarMontecarlo(passadminDeCripta);
    await actualizarDatos(client, coleccionMontecarlo, passadminDeCripta);

    console.log(
      "Esperando 10 segundos para asegurar que MongoDB procese los cambios..."
    );
    await new Promise((resolve) => setTimeout(resolve, 10000));

    await client.close();
    console.log("Conexión a MongoDB cerrada después de actualizar datos.");

    const client2 = new MongoClient(uri);
    await client2.connect();
    console.log("Conexión a MongoDB reabierta para ejecución de scripts.");

    const db = client2.db(`btc_opti_${DBName}`);
    const postUpdateCheck = await db
      .collection(coleccionMontecarlo)
      .find({ SS_Cantidad: { $ne: 0 } })
      .count();

    if (postUpdateCheck === 0) {
      console.warn(
        `SS_Cantidad sigue en 0 para todos los SKUs en ${coleccionMontecarlo}`
      );
    } else {
      console.log(
        `${postUpdateCheck} SKUs tienen SS_Cantidad actualizado correctamente en ${coleccionMontecarlo}`
      );
    }

    const scripts = [
      "P11_Calcula_Demanda_LT.js",
      "P12_Calcula_ROQ.js",
      "P13_Calcula_ROP_v2.js",
      "P14_Calcula_META.js",
      "P15_Calcula_Inventario_Promedio.js",
      "P16_Formatea_TablaUI.js",
      "P17_Calcula_Dias_Cobertura_v2.js",
      "P17.1_Calcula_VidaUtilDias_ROPAlto_SobreinventarioDias.js",
      "P18_Calcula_Pallets.js",
      "P19_Calcula_Costo.js",
      "P19.1_Calcula_UOM.js",
      "P20_Formatea_TablasUI_Costos.js",
      "P21_UneTablas.js",
    ];

    for (const script of scripts) {
      const scriptCompleto = `${rutaBaseScripts}\\${script}`;
      console.log(`Ejecutando script: ${scriptCompleto}`);

      if (script === "P16_Formatea_TablaUI.js") {
        await ejecutarScript(
          scriptCompleto,
          dbName,
          DBUser,
          passadminDeCripta,
          coleccionMontecarlo
        );
      } else if (
        script === "P17.1_Calcula_VidaUtilDias_ROPAlto_SobreinventarioDias.js"
      ) {
        const diasCoberturaTarget = coleccionMontecarlo.includes("sem")
          ? "ui_pol_inv_dias_cobertura_montecarlo_sem"
          : "ui_pol_inv_dias_cobertura_montecarlo";

        await ejecutarScript(
          scriptCompleto,
          dbName,
          DBUser,
          passadminDeCripta,
          diasCoberturaTarget
        );
      } else if (script === "P20_Formatea_TablasUI_Costos.js") {
        const coleccionCostoMontecarlo = coleccionMontecarlo.includes("sem")
          ? "politica_inventarios_costo_montecarlo_sem"
          : "politica_inventarios_costo_montecarlo";

        await ejecutarScript(
          scriptCompleto,
          dbName,
          DBUser,
          passadminDeCripta,
          coleccionCostoMontecarlo
        );
      } else if (script === "P21_UneTablas.js") {
        const finalUI = coleccionMontecarlo.includes("sem")
          ? "ui_politica_inventarios_montecarlo_sem"
          : "ui_politica_inventarios_montecarlo";
        await ejecutarScript(
          scriptCompleto,
          dbName,
          DBUser,
          passadminDeCripta,
          finalUI
        );
      } else {
        await ejecutarScript(
          scriptCompleto,
          dbName,
          DBUser,
          passadminDeCripta,
          coleccionMontecarlo
        );
      }
    }

    await client2.close();
    console.log("Todos los procesos completados exitosamente.");
  } catch (error) {
    console.error("Error en la ejecución principal:", error);
  }
}

main().catch(console.error);
