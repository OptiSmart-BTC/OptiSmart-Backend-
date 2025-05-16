const { MongoClient } = require("mongodb");

async function main() {
  //const uri = "mongodb://localhost:27017"; // Cambia la URI de conexión a tu instancia de MongoDB
  const uri = 'mongodb://admin:btc0pt1@127.0.0.1:27017/?authSource=admin'; // Cambia la URI de conexión a tu instancia de MongoDB
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    console.log("Conectado a MongoDB");

    const db = client.db("btc_opti_CFEX"); // Reemplaza 'tu_basedatos' con el nombre de tu base de datos
/*
    const pipelineAgrupado = [
        {
          $group: {
            _id: {
              Producto: "$Producto",
              Ubicacion: "$Ubicacion",
            },
            Cantidad: { $sum: "$Cantidad" },
          },
        },
        {
          $out: "historico_agrupado", // Nombre de la colección para el resultado agrupado
        },
      ];
      
      await db.collection("historico_demanda").aggregate(pipelineAgrupado).toArray();
      console.log("Agrupación completada. Resultado guardado en la colección 'historico_agrupado'");
      
      const pipelineDemandaCalculada = [
        {
          $lookup: {
            from: "sku", // Nombre de la colección SKU
            let: { producto: "$_id.Producto", ubicacion: "$_id.Ubicacion" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$Producto", "$$producto"] },
                      { $eq: ["$Ubicacion", "$$ubicacion"] }
                    ]
                  }
                }
              },
              {
                $project: {
                  Costo_Unidad: 1
                }
              }
            ],
            as: "skuData"
          },
        },
        {
          $unwind: "$skuData",
        },
        {
          $addFields: {
            Demanda_Costo: { $multiply: ["$Cantidad", "$skuData.Costo_Unidad"] },
          },
        },
        {
          $project: {
            _id: 0,
            Producto: "$_id.Producto",
            Ubicacion: "$_id.Ubicacion",
            Demanda_Costo: 1,
          },
        },
      ];
            
      const resultadoDemandaCalculada = await db.collection("historico_agrupado").aggregate(pipelineDemandaCalculada).toArray();
      
      // Insertar los resultados en la colección "demanda_calculada"
      await db.collection("demanda_calculada").insertMany(resultadoDemandaCalculada);
      
      console.log("Cálculo de demanda completado. Resultado guardado en la colección 'demanda_calculada'");
  */


      const pipelineAgrupado = [
       /* {
          $match: {
            Fecha: {
              $gte: fechaInicioObj,
              $lte: fechaFinObj
            }
          }
        },*/
        {
          $group: {
            _id: {
              Producto: "$Producto",
              Ubicacion: "$Ubicacion",
            },
            Cantidad: { $sum: "$Cantidad" },
          },
        },
        {
          $out: "historico_agrupado", // Nombre de la colección para el resultado agrupado
        },
      ];
      
      await db.collection("historico_demanda").aggregate(pipelineAgrupado).toArray();
      console.log("Agrupación completada. Resultado guardado en la colección 'historico_agrupado'");
      
      const pipelineDemandaCalculada = [
        {
          $lookup: {
            from: "sku", // Nombre de la colección SKU
            let: { producto: "$_id.Producto", ubicacion: "$_id.Ubicacion" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$Producto", "$$producto"] },
                      { $eq: ["$Ubicacion", "$$ubicacion"] }
                    ]
                  }
                }
              },
              {
                $project: {
                  Costo_Unidad: 1
                }
              }
            ],
            as: "skuData"
          },
        },
        {
          $unwind: "$skuData",
        },
        {
          $addFields: {
            Demanda_Costo: { $multiply: ["$Cantidad", "$skuData.Costo_Unidad"] },
          },
        },
        {
          $project: {
            _id: 0,
            Producto: "$_id.Producto",
            Ubicacion: "$_id.Ubicacion",
            Demanda_Costo: 1,
          },
        },
      ];
      
      const resultadoDemandaCalculada = await db.collection("historico_agrupado").aggregate(pipelineDemandaCalculada).toArray();
      
      // Ordenar resultados
      resultadoDemandaCalculada.sort((a, b) => {
        if (a.Ubicacion === b.Ubicacion) {
          return a.Demanda_Costo - b.Demanda_Costo;
        } else {
          return a.Ubicacion.localeCompare(b.Ubicacion);
        }
      });
      
      // Insertar los resultados en la colección "demanda_calculada"
      await db.collection("demanda_calculada").insertMany(resultadoDemandaCalculada);
      
      console.log("Cálculo de demanda completado. Resultado guardado en la colección 'demanda_calculada'");
      
  
    } catch (error) {
    console.error("Error:", error);
  } finally {
    client.close();
    console.log("Desconectado de MongoDB");
  }
}

main().catch(console.error);
