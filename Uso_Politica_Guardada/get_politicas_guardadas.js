app.post('/getPoliticasGuardadas', async (req, res) => {
    try {
      const { appUser, appPass, DBName } = req.body;
      const decryptedAppPass = await getDecryptedPassUser(appPass);
      await conex.connectToDatabase();
      conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);
      
      console.log(`[getPoliticasGuardadas] Procesando solicitud para usuario: ${appUser}, DB: ${DBName}`);
      const usuarioLog = conex.getUser();
      
      // Definir la ruta del directorio donde está el script de políticas guardadas
      const directorioActual = __dirname;
      const rutaDirPoliticasGuardadas = path.join(directorioActual, 'Uso_Politica_Guardada');
      
      // Comando para ejecutar el script que obtiene las políticas guardadas
      const comandoGetPoliticas = `cd /d "${rutaDirPoliticasGuardadas}" && node get_politicas_guardadas.js ${usuarioLog}`;
      
      console.log(`[getPoliticasGuardadas] Ejecutando comando: ${comandoGetPoliticas}`);
      
      exec(comandoGetPoliticas, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          console.error('[getPoliticasGuardadas] Error al ejecutar el comando:', error);
          return res.status(500).json({ 
            error: 'Error al obtener políticas guardadas',
            details: error.message 
          });
        }
        
        // Verificar que hay salida
        if (!stdout || stdout.trim() === '') {
          console.error('[getPoliticasGuardadas] STDOUT vacío');
          console.log('[getPoliticasGuardadas] STDERR:', stderr);
          return res.status(500).json({ 
            error: 'El script no produjo salida',
            details: 'No se recibió respuesta del proceso'
          });
        }
        
        try {
          // Parsear la salida JSON del script
          const respuesta = JSON.parse(stdout);
          
          if (respuesta.success) {
            console.log(`[getPoliticasGuardadas] Total encontradas: ${respuesta.data ? respuesta.data.length : 0}`);
            res.status(200).json(respuesta.data || []);
          } else {
            console.error('[getPoliticasGuardadas] Error en el script:', respuesta.error);
            res.status(500).json({ 
              error: 'Error al procesar políticas guardadas',
              details: respuesta.error || respuesta.message
            });
          }
        } catch (parseError) {
          console.error('[getPoliticasGuardadas] Error al parsear respuesta:', parseError);
          console.log('[getPoliticasGuardadas] STDOUT:', stdout);
          console.log('[getPoliticasGuardadas] STDERR:', stderr);
          res.status(500).json({ 
            error: 'Error al procesar políticas guardadas',
            details: 'Respuesta inválida del proceso'
          });
        }
      });
      
    } catch (err) {
      console.error('[getPoliticasGuardadas] Error general:', err);
      res.status(500).json({ 
        error: 'Error interno al procesar solicitud',
        details: err.message 
      });
    }
  });