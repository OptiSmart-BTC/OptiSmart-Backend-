const { MongoClient } = require('mongodb');
const conex = require('../Configuraciones/ConStrDB');
const fs = require('fs');
const moment = require('moment');

const now = moment().format('YYYY-MM-DD HH:mm:ss');

const dbName = process.argv[2];
const parametroFolder = process.argv[3];
const AppUser = process.argv[4];

const { decryptData } = require('./DeCriptaPassAppDb');
const { host, puerto } = require('../Configuraciones/ConexionDB');
const { DBUser, DBPassword } = require(`../../${parametroFolder}/cfg/dbvars`);
const logFile = `../../${parametroFolder}/log/LogdeCargaCSV.log`;

async function writeToLog(message) {
  fs.appendFileSync(logFile, `${message}\n`);
}

async function actualizarUbisSaved() {
  writeToLog(`\nPaso 08 - Actualización de la colección 'ubis_saved' (MODO ACUMULATIVO)`);

  try {
    const passadminDeCripta = await decryptData(`${DBPassword}`);
    const mongoUri = conex.getUrl(DBUser, passadminDeCripta, host, puerto, dbName);
    const client = await MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = client.db();

    const skuCollection = db.collection('sku');
    const ubisSavedCollection = db.collection('ubis_saved');
    const cambiosCollection = db.collection('cambios_ubicaciones_temp');

    // OBTENER UBICACIONES ACTUALES DE SKU
    const ubicacionesSKU = await skuCollection
      .aggregate([
        {
          $group: {
            _id: '$Ubicacion',
            Desc_Ubicacion: { $first: '$Desc_Ubicacion' }
          }
        }
      ])
      .toArray();

    const ubicacionesSKUMap = new Map(ubicacionesSKU.map(u => [u._id, u.Desc_Ubicacion]));

    // OBTENER UBICACIONES GUARDADAS PREVIAMENTE
    const ubicacionesGuardadas = await ubisSavedCollection.find({}).toArray();
    const guardadasMap = new Map(ubicacionesGuardadas.map(u => [u.Ubicacion, u.Desc_Ubicacion]));

    let insertadas = 0;
    let actualizadas = 0;
    let marcadasInactivas = 0;
    
    // ARRAY PARA REGISTRAR CAMBIOS
    const cambios = [];

    writeToLog(`\tProcesando ${ubicacionesSKU.length} ubicaciones actuales vs ${ubicacionesGuardadas.length} guardadas`);

    // PROCESAR UBICACIONES ACTUALES
    
    for (const [ubi, desc] of ubicacionesSKUMap) {
      if (!guardadasMap.has(ubi)) {
        // UBICACIÓN NUEVA
        await ubisSavedCollection.insertOne({ 
          Ubicacion: ubi, 
          Desc_Ubicacion: desc,
          fecha_creacion: now,
          activa: true 
        });
        insertadas++;
        
        // Registrar cambio
        cambios.push({
          ubicacion: ubi,
          tipo_cambio: 'NUEVA',
          desc_ubicacion: desc,
          fecha_cambio: new Date(),
          procesado: false
        });
        
        writeToLog(`\t  NUEVA: ${ubi} - ${desc}`);
        
      } else if (guardadasMap.get(ubi) !== desc) {
        // UBICACIÓN ACTUALIZADA (cambió descripción)
        await ubisSavedCollection.updateOne(
          { Ubicacion: ubi }, 
          { 
            $set: { 
              Desc_Ubicacion: desc,
              fecha_actualizacion: now,
              activa: true 
            } 
          }
        );
        actualizadas++;
        
        // Registrar cambio
        cambios.push({
          ubicacion: ubi,
          tipo_cambio: 'ACTUALIZADA',
          desc_ubicacion: desc,
          desc_anterior: guardadasMap.get(ubi),
          fecha_cambio: new Date(),
          procesado: false
        });
        
        writeToLog(`\t  ACTUALIZADA: ${ubi} - "${guardadasMap.get(ubi)}" -> "${desc}"`);
        
      } else {
        // *** NUEVA LÓGICA: VERIFICAR DATOS NUEVOS EN UBICACIONES EXISTENTES ***
        const ubicacionGuardada = ubicacionesGuardadas.find(u => u.Ubicacion === ubi);
        const datosNuevos = await verificarDatosNuevosEnUbicacion(db, ubi, ubicacionGuardada);
        
        if (datosNuevos.hayNuevosDatos) {
          writeToLog(`\t  DATOS NUEVOS EN UBICACIÓN EXISTENTE: ${ubi} - ${datosNuevos.descripcion}`);
          
          // Actualizar información en ubis_saved
          await ubisSavedCollection.updateOne(
            { Ubicacion: ubi }, 
            { 
              $set: { 
                activa: true,
                fecha_ultima_vista: now,
                ultima_carga_datos: datosNuevos.fechaCarga,
                total_registros: datosNuevos.totalRegistros,
                hash_datos: datosNuevos.hashDatos
              } 
            }
          );
          
          // Registrar cambio para modo incremental
          cambios.push({
            ubicacion: ubi,
            tipo_cambio: 'DATOS_NUEVOS',
            desc_ubicacion: desc,
            fecha_cambio: new Date(),
            procesado: false,
            detalles_cambio: {
              registros_anteriores: datosNuevos.registrosAnteriores,
              registros_actuales: datosNuevos.totalRegistros,
              diferencia: datosNuevos.totalRegistros - datosNuevos.registrosAnteriores,
              fecha_carga_anterior: ubicacionGuardada?.ultima_carga_datos,
              fecha_carga_actual: datosNuevos.fechaCarga
            }
          });
          
        } else {
          // UBICACIÓN SIN CAMBIOS - Solo marcar como activa y actualizar fecha
          await ubisSavedCollection.updateOne(
            { Ubicacion: ubi }, 
            { 
              $set: { 
                activa: true,
                fecha_ultima_vista: now 
              } 
            }
          );
        }
      }
    }

    // MARCAR COMO INACTIVAS LAS UBICACIONES QUE YA NO ESTÁN EN SKU ACTUAL
    const ubicacionesActuales = [...ubicacionesSKUMap.keys()];
    const ubicacionesAInactivar = [...guardadasMap.keys()].filter(ubi => !ubicacionesActuales.includes(ubi));
    
    if (ubicacionesAInactivar.length > 0) {
      const resultadoInactivas = await ubisSavedCollection.updateMany(
        { Ubicacion: { $in: ubicacionesAInactivar } },
        { 
          $set: { 
            activa: false,
            fecha_inactivacion: now 
          } 
        }
      );
      marcadasInactivas = resultadoInactivas.modifiedCount;
      
      // Registrar cambios de inactivación
      for (const ubi of ubicacionesAInactivar) {
        cambios.push({
          ubicacion: ubi,
          tipo_cambio: 'INACTIVA',
          desc_ubicacion: guardadasMap.get(ubi),
          fecha_cambio: new Date(),
          procesado: false
        });
        
        writeToLog(`\t  INACTIVA: ${ubi} - ${guardadasMap.get(ubi)}`);
      }
    }

    // *** NUEVA LÓGICA: MANEJAR CAMBIOS INCREMENTALMENTE (NO BORRAR TODO) ***
    writeToLog(`\tActualizando tabla de cambios para modo incremental...`);
    
    // OBTENER CAMBIOS EXISTENTES NO PROCESADOS
    const cambiosExistentes = await cambiosCollection.find({ procesado: false }).toArray();
    const ubicacionesConCambiosExistentes = new Set(cambiosExistentes.map(c => c.ubicacion));
    
    writeToLog(`\tCambios existentes no procesados: ${cambiosExistentes.length}`);
    if (cambiosExistentes.length > 0) {
      const tiposExistentes = cambiosExistentes.reduce((acc, c) => {
        acc[c.tipo_cambio] = (acc[c.tipo_cambio] || 0) + 1;
        return acc;
      }, {});
      writeToLog(`\t  Tipos existentes: ${JSON.stringify(tiposExistentes)}`);
    }

    // SOLO AGREGAR CAMBIOS NUEVOS (no duplicar existentes)
    const cambiosNuevos = cambios.filter(cambio => {
      const yaExiste = ubicacionesConCambiosExistentes.has(cambio.ubicacion);
      
      if (yaExiste) {
        // Si ya existe un cambio para esta ubicación, verificar si es más reciente o diferente
        const cambioExistente = cambiosExistentes.find(c => c.ubicacion === cambio.ubicacion);
        
        // Si el cambio nuevo es más prioritario (DATOS_NUEVOS vs INACTIVA), reemplazar
        if (cambio.tipo_cambio === 'DATOS_NUEVOS' && cambioExistente.tipo_cambio === 'INACTIVA') {
          return true; // Agregar el nuevo y marcar el viejo como reemplazado
        }
        
        if (cambio.tipo_cambio === 'INACTIVA' && cambioExistente.tipo_cambio === 'DATOS_NUEVOS') {
          return false; // No agregar, el existente es más importante
        }
        
        return false; // No duplicar
      }
      
      return true; // Agregar cambio nuevo
    });

    if (cambiosNuevos.length > 0) {
      await cambiosCollection.insertMany(cambiosNuevos);
      writeToLog(`\tAgregados ${cambiosNuevos.length} cambios nuevos en 'cambios_ubicaciones_temp':`);
      
      // Contar por tipo de cambio
      const conteoTiposNuevos = cambiosNuevos.reduce((acc, c) => {
        acc[c.tipo_cambio] = (acc[c.tipo_cambio] || 0) + 1;
        return acc;
      }, {});
      
      for (const [tipo, cantidad] of Object.entries(conteoTiposNuevos)) {
        const ubicaciones = cambiosNuevos.filter(c => c.tipo_cambio === tipo).map(c => c.ubicacion);
        writeToLog(`\t  ${tipo}: ${cantidad} [${ubicaciones.join(', ')}]`);
      }
    } else {
      writeToLog(`\tNo hay cambios nuevos que agregar`);
    }

    // ACTUALIZAR CAMBIOS REEMPLAZADOS
    const cambiosParaReemplazar = cambios.filter(cambio => {
      const cambioExistente = cambiosExistentes.find(c => c.ubicacion === cambio.ubicacion);
      return cambioExistente && 
             cambio.tipo_cambio === 'DATOS_NUEVOS' && 
             cambioExistente.tipo_cambio === 'INACTIVA';
    });

    if (cambiosParaReemplazar.length > 0) {
      for (const cambio of cambiosParaReemplazar) {
        await cambiosCollection.replaceOne(
          { ubicacion: cambio.ubicacion, procesado: false },
          cambio
        );
        writeToLog(`\t  REEMPLAZADO: ${cambio.ubicacion} (INACTIVA -> DATOS_NUEVOS)`);
      }
    }

// *** NUEVA FUNCIÓN: VERIFICAR DATOS NUEVOS EN UBICACIÓN ***
async function verificarDatosNuevosEnUbicacion(db, ubicacion, ubicacionGuardada) {
  try {
    const skuCollection = db.collection('sku');
    
    // CONTAR REGISTROS ACTUALES EN SKU PARA ESTA UBICACIÓN
    const registrosActuales = await skuCollection.countDocuments({ Ubicacion: ubicacion });
    const registrosAnteriores = ubicacionGuardada?.total_registros || 0;
    
    // OBTENER HASH DE DATOS ACTUALES (basado en los SKUs)
    const skusActuales = await skuCollection.find(
      { Ubicacion: ubicacion }, 
      { projection: { SKU: 1, Desc_SKU: 1 } }
    ).sort({ SKU: 1 }).toArray();
    
    const crypto = require('crypto');
    const datosParaHash = skusActuales.map(s => `${s.SKU}|${s.Desc_SKU}`).join('');
    const hashActual = crypto.createHash('md5').update(datosParaHash).digest('hex');
    const hashAnterior = ubicacionGuardada?.hash_datos || '';
    
    // DETERMINAR SI HAY DATOS NUEVOS
    const hayNuevosDatos = registrosActuales > registrosAnteriores || 
                          (hashAnterior && hashActual !== hashAnterior);
    
    let descripcion = '';
    if (registrosActuales > registrosAnteriores) {
      descripcion = `+${registrosActuales - registrosAnteriores} registros nuevos (${registrosAnteriores} → ${registrosActuales})`;
    } else if (hashAnterior && hashActual !== hashAnterior) {
      descripcion = `Datos modificados (hash cambió)`;
    }
    
    return {
      hayNuevosDatos,
      descripcion,
      totalRegistros: registrosActuales,
      registrosAnteriores,
      hashDatos: hashActual,
      fechaCarga: new Date()
    };
    
  } catch (err) {
    writeToLog(`\tError verificando datos nuevos para ubicación ${ubicacion}: ${err.message}`);
    return {
      hayNuevosDatos: false,
      descripcion: `Error en verificación: ${err.message}`,
      totalRegistros: 0,
      registrosAnteriores: 0,
      hashDatos: '',
      fechaCarga: new Date()
    };
  }
}

    // LIMPIAR TABLA DE CAMBIOS ANTERIOR Y CREAR NUEVA
    writeToLog(`\tGenerando tabla de cambios para modo incremental...`);
    await cambiosCollection.deleteMany({});

    if (cambios.length > 0) {
      await cambiosCollection.insertMany(cambios);
      writeToLog(`\tRegistrados ${cambios.length} cambios en 'cambios_ubicaciones_temp':`);
      
      // Contar por tipo de cambio
      const conteoTipos = cambios.reduce((acc, c) => {
        acc[c.tipo_cambio] = (acc[c.tipo_cambio] || 0) + 1;
        return acc;
      }, {});
      
      for (const [tipo, cantidad] of Object.entries(conteoTipos)) {
        writeToLog(`\t  ${tipo}: ${cantidad}`);
      }
    } else {
      writeToLog(`\tNo hay cambios de ubicaciones que registrar`);
      
      // Crear tabla vacía para indicar que no hay cambios
      await cambiosCollection.insertOne({
        ubicacion: null,
        tipo_cambio: 'SIN_CAMBIOS',
        fecha_cambio: new Date(),
        procesado: false,
        mensaje: 'No se detectaron cambios en ubicaciones'
      });
    }

    // RESUMEN FINAL
    writeToLog(`\n\tRESUMEN ACTUALIZACIÓN UBICACIONES:`);
    writeToLog(`\t  Ubicaciones insertadas en 'ubis_saved': ${insertadas}`);
    writeToLog(`\t  Ubicaciones actualizadas en 'ubis_saved': ${actualizadas}`);
    writeToLog(`\t  Ubicaciones marcadas como inactivas: ${marcadasInactivas}`);
    writeToLog(`\t  Total cambios registrados: ${cambios.length}`);
    writeToLog(`\t  Se mantuvieron todas las ubicaciones históricas`);

    // VERIFICAR ESTADO FINAL
    const totalUbisSaved = await ubisSavedCollection.countDocuments();
    const ubisSavedActivas = await ubisSavedCollection.countDocuments({ activa: true });
    const totalCambios = await cambiosCollection.countDocuments();
    
    writeToLog(`\n\tESTADO FINAL:`);
    writeToLog(`\t  Total ubicaciones en 'ubis_saved': ${totalUbisSaved}`);
    writeToLog(`\t  Ubicaciones activas: ${ubisSavedActivas}`);
    writeToLog(`\t  Ubicaciones inactivas: ${totalUbisSaved - ubisSavedActivas}`);
    writeToLog(`\t  Registros en 'cambios_ubicaciones_temp': ${totalCambios}`);

    // MOSTRAR UBICACIONES QUE ACTIVARÁN MODO INCREMENTAL
    const cambiosParaIncremental = await cambiosCollection.find({
      tipo_cambio: { $in: ['NUEVA', 'ACTUALIZADA'] }
    }).toArray();
    
    if (cambiosParaIncremental.length > 0) {
      const ubicacionesIncremental = cambiosParaIncremental.map(c => c.ubicacion);
      writeToLog(`\n\t  MODO INCREMENTAL ACTIVADO para ubicaciones: [${ubicacionesIncremental.join(', ')}]`);
    } else {
      writeToLog(`\n\t  MODO INCREMENTAL NO ACTIVADO - No hay ubicaciones nuevas o actualizadas`);
    }

    client.close();
    writeToLog(`\tPaso 08 completado exitosamente\n`);

  } catch (error) {
    writeToLog(`${now} - Error en 'ubis_saved': ${error}`);
    writeToLog(`Stack trace: ${error.stack}`);
    console.error(error);
    throw error;
  }
}

actualizarUbisSaved();