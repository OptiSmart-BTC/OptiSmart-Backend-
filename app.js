const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const multer = require('multer');
const fs = require('fs');
const { exec } = require('child_process');
const { execSync } = require('child_process');
const path = require('path');
const moment = require('moment-timezone');
const archiver = require('archiver'); 
const { Parser } = require('json2csv');
const logger = require('./logger'); // Importa la configuración de winston
<<<<<<< HEAD

const cors = require('cors');
=======
const axios = require('axios');
const cors = require('cors');
const { ObjectId } = require("mongodb"); 
require('dotenv').config();
>>>>>>> origin/test

const conex= require('./Configuraciones/ConStrDB');
const { decryptData } = require('./DeCriptaPassAppDb');
//const { host, puerto, useradmin, passadmin } = require('./Configuraciones/ConexionDB');
const app = express();
app.use(cors());
const port = 3000;

const directorioActual = __dirname;
const rutaDirConfiguraCliente = path.join(directorioActual, 'ConfiguraCliente');
const rutaDirCargaSKU = path.join(directorioActual, 'CargaSKU');
const rutaDirCargaHistorico = path.join(directorioActual, 'CargaHistorico');
const rutaDirClasifABCD = path.join(directorioActual, 'ClasifABCD_PoliticaInvent');
const rutaDirClasifABCDSem = path.join(directorioActual, 'ClasifABCD_PoliticaInvent_Sem');
const rutaDirCargaInvDisponible = path.join(directorioActual, 'CargaInvDisponible');
const rutaDirCargaInvTrans = path.join(directorioActual, 'CargaInvTrans');
const rutaDirCargaRequerimientosConfirmados = path.join(directorioActual, 'CargaRequerimientosConfirmados');
const rutaDirPlanReposicion = path.join(directorioActual, 'PlanReposicion');
const rutaDirPlanReposicion_Sem = path.join(directorioActual, 'PlanReposicion_Sem');

<<<<<<< HEAD
=======



const rutaDirOverridePlanReposicion = path.join(directorioActual, 'OverridePlanReposicion');
const rutaDirOverridePlanReposicion_Sem = path.join(directorioActual, 'OverridePlanReposicion_Sem');
const rutaDirPoliticaInventarios = path.join(directorioActual, 'OverridePoliticaInventarios');
const rutaDirPoliticaInventarios_Sem = path.join(directorioActual, 'OverridePoliticaInventarios_Sem');

const rutaDirPowerBi_PlanReposicion = path.join(directorioActual, 'PowerBi_PlanReposicion');
const rutaDirPowerBi_PlanReposicion_Sem = path.join(directorioActual, 'PowerBi_PlanReposicion_Sem');

const rutaDirMontecarlo = path.join(
  directorioActual,
  "montecarlo"
);

>>>>>>> origin/test
// Configuración de conexión a MongoDB
//const mongoURL = 'mongodb://127.0.0.1:27017';
//const userDbName = 'opti_users';
//const userCollectionName = 'usuarios';*/
//const dataDbName = 'btc_opti_jtx01';

//const mongoURL2 = 'mongodb://127.0.0.1:27017';
//const userDbName2 = 'btc_opti_jtx01';
//const userCollectionName2 = 'usuarios';

const adminDbName = 'OptiBTC';
const usersCollectionName = 'usuarios';

//let userDbName = ''; 
//let userLogged = ''; 
// Configurar EJS como motor de plantillas
//app.set('view engine', 'ejs');
app.use(express.static(__dirname));
// Middleware para procesar el cuerpo de las solicitudes
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json()); 

// Middleware para el manejo de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './uploads'); // Carpeta donde se guardarán los archivos cargados
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

// Ruta para mostrar la página de inicio de sesión
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
app.post('/login', async (req, res) => {
  const logUsername = req.body.username;
  const logPassword = req.body.password;

  console.log("usuario: " + logUsername + " pass: " + logPassword);

  try {
    const client = await conex.connectToDatabase();
    const dbUsuarios = client.db(adminDbName).collection(usersCollectionName);

    const user = await dbUsuarios.findOne({
      $or: [
        { AppUser: logUsername },
        { 'UserUI.AppUser': logUsername }
      ]
    });

    if (!user) {
      res.redirect('/?error=Usuario no encontrado');
      return;
    }

    let p_AppUser, p_AppPass, dbUser, dbPass, dbName, userType, userName, userActivo;

    if (user.AppUser === logUsername) {
      // Main user
      p_AppUser = user.AppUser;
      p_AppPass = user.AppPassword;
      dbUser = user.DBUser;
      dbPass = user.DBPassword;
      dbName = `btc_opti_${p_AppUser}`;
      userType = user.Type;
      userName = user.UserName;
      userActivo = user.Activo;
    } else {
      // Sub-user
      const subUser = user.UserUI.find(sub => sub.AppUser === logUsername);
      p_AppUser = subUser.AppUser;
      p_AppPass = subUser.AppPassword;
      userType = subUser.Type;
      userName = subUser.UserName;
      userActivo = subUser.Activo;
      const userDB = user.UserDB.find(db => db.DBName === logUsername) || user.UserDB[0];
      dbUser = userDB.DBUser;
      dbPass = userDB.DBPassword;
      dbName = userDB.DBName;
    }

    const passuserDeCripta = await getDecryptedPassUser(p_AppPass);

    if (logPassword !== passuserDeCripta) {
      res.redirect('/?error=Contraseña incorrecta');
      return;
    }

    client.close();

    conex.setUserData(p_AppUser, passuserDeCripta, dbName);

    rutaDirLogFile = `../${conex.getUser()}/log/LogdeCargaCSV.log`;
      
<<<<<<< HEAD
    const comando = `cd /d "${rutaDirConfiguraCliente}" && node exec_js_Main_ConfiguraCliente_process_v2.js ${p_AppUser}`;
=======
    const comando = `cd /d "${rutaDirConfiguraCliente}" && node exec_js_Main_ConfiguraCliente_process_v3.js ${p_AppUser}`;
>>>>>>> origin/test
    
    console.log('ruta:'+rutaDirConfiguraCliente);
    console.log('Comando:'+comando);

    exec(comando, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error al ejecutar el comando: ${error}`);
        return;
      }
    });


    res.status(200).json({
      AppUser: p_AppUser,
      password: p_AppPass,
      userType,
      userName,
      userActivo,
      dbName
    });
  } catch (err) {
    console.error('Error al conectar a la base de datos:', err);
    res.status(500).json({ error: 'Error al conectar a la base de datos' });
  }
});


//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
//
app.post('/CargaCSVsku', upload.fields([
  { name: 'doc', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log("cargar SKU");

    const { appUser, appPass, DBName } = req.body;
    const decryptedAppPass = await getDecryptedPassUser(appPass);

    console.log("user: "+appUser+"\npass: "+decryptedAppPass+"\nDBName: "+DBName);

    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_'+DBName);

    console.log("conex generado");

    const skuCsv = req.files['doc'][0];
    // Ruta donde se guardarán los archivos en Windows
    const windowsDir = `../${DBName}/csv/`;

    // Mover y renombrar los archivos CSV cargados a la ruta de Windows
    //fs.renameSync(skuCsv.path, windowsDir + skuCsv.originalname);
    fs.renameSync(skuCsv.path, windowsDir + 'in/sku.csv');

    const rutaDirLogFile = path.join(__dirname, `../${DBName}/log/LogdeCargaCSV.log`);
    
    //Comando que ejecuta la carga del SKU
    const comando = `cd /d "${rutaDirCargaSKU}" && node exec_js_SKUMain_LoadData.js ${appUser}`;
   
    try {
      console.log(comando);

      const resultado = execSync(comando);
      console.log(resultado);
      const filePath = path.resolve(__dirname, rutaDirLogFile);
      //console.log(filePath);

      // Verificar si el archivo existe
      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
          // El archivo no existe, crearlo vacío
          fs.writeFile(filePath, '', (err) => {
            if (err) {
              console.error('Error al crear el archivo LogdeCargaCSV.log:', err);
              res.status(500).send('Error al crear el archivo LogdeCargaCSV.log');
              return;
            }
            leerArchivoLog(filePath);
          });
        } else {
          // El archivo existe, leerlo
          leerArchivoLog(filePath);
        }
      });
      
      function leerArchivoLog(filePath) {
        const logContent = fs.readFile(filePath, 'utf-8', (err, logContent) => {
          if (err) {
            console.error('Error al leer el archivo LogdeCargaCSV.log:', err);
            res.status(500).send('Error al leer el archivo LogdeCargaCSV.log');
            return;
          }
          res.send(logContent);
        });
      }
      console.log('Comando ejecutado con éxito:', resultado.toString());
    } catch (error) {
      //console.error('Error al ejecutar el comando:', error.stderr.toString());
      console.error('Error al ejecutar el comando:', error);
      res.status(500).send('Error al ejecutar el comando');
      return;
    }
  } catch (err) {
    console.error('Error al procesar los archivos CSV:', err);
    res.status(500).send('Error al procesar los archivos CSV');
  }
});
//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
<<<<<<< HEAD
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
=======
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
>>>>>>> origin/test
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
app.post('/getActualCSVPol', async (req, res) => {
  try {
    const { appUser, appPass, DBName } = req.body;
    const decryptedAppPass = await getDecryptedPassUser(appPass);

    console.log("user: "+appUser+"\npass: "+decryptedAppPass+"\nDBName: "+DBName);

    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_'+DBName);

    console.log("conex generado");

    // Ruta donde se guardarán los archivos en Windows
    const processedDir = `../${DBName}/csv/in/procesados/`;

    const files = fs.readdirSync(processedDir);

    const skuFiles = files
      .filter(file => file.startsWith('sku'))
      .map(file => ({
        name: file,
        time: fs.statSync(path.join(processedDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    const historicoFiles = files
      .filter(file => file.startsWith('historico_demanda'))
      .map(file => ({
        name: file,
        time: fs.statSync(path.join(processedDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    if (skuFiles.length === 0 && historicoFiles.length === 0) {
      return res.status(404).send('No relevant CSV files found');
    }

    const filesToDownload = [];
    if (skuFiles.length > 0) {
      filesToDownload.push({ name: skuFiles[0].name, path: path.join(processedDir, skuFiles[0].name) });
    }
    if (historicoFiles.length > 0) {
      filesToDownload.push({ name: historicoFiles[0].name, path: path.join(processedDir, historicoFiles[0].name) });
    }

    if (filesToDownload.length === 1) {
      const file = filesToDownload[0];
      res.download(file.path, file.name, (err) => {
        if (err) {
          console.error('Error downloading the file:', err);
          res.status(500).send('Error downloading the file');
        }
      });
    } else {
      const zipPath = path.join(processedDir, 'latest_csvs.zip');
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      output.on('close', () => {
        res.download(zipPath, 'latest_csvs.zip', (err) => {
          if (err) {
            console.error('Error downloading the file:', err);
            res.status(500).send('Error downloading the file');
          }
          fs.unlinkSync(zipPath);
        });
      });

      archive.on('error', (err) => {
        console.error('Error creating zip archive:', err);
        res.status(500).send('Error creating zip archive');
      });

      archive.pipe(output);
      filesToDownload.forEach(file => {
        archive.file(file.path, { name: file.name });
      });
      archive.finalize();
    }
  } catch (error) {
    console.error('Error getting the latest CSV:', error);
    res.status(500).send('Error getting the latest CSV');
  }
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
// historico_demanda.csv
app.post('/CargaCSVhist', upload.fields([
  { name: 'doc', maxCount: 1 }
]), async (req, res) => {
  try {
    const { appUser, appPass, DBName } = req.body;
    const decryptedAppPass = await getDecryptedPassUser(appPass);

    console.log("user: "+appUser+"\npass: "+decryptedAppPass+"\nDBName: "+DBName);

    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_'+DBName);

    console.log("conex generado");

    const historicoDemandaCsv = req.files['doc'][0];
    // Ruta donde se guardarán los archivos en Windows
    const windowsDir = `../${DBName}/csv/`;

    // Mover y renombrar los archivos CSV cargados a la ruta de Windows
    //fs.renameSync(historicoDemandaCsv.path, windowsDir + historicoDemandaCsv.originalname);
    fs.renameSync(historicoDemandaCsv.path, windowsDir + 'in/historico_demanda.csv');

    const rutaDirLogFile = path.join(__dirname, `../${DBName}/log/LogdeCargaCSV.log`);

    const comando = `cd /d "${rutaDirCargaHistorico}" && node exec_js_HistoricoMain_LoadData.js ${appUser}`;

    try {
      const resultado = execSync(comando);
      const filePath = path.resolve(__dirname, rutaDirLogFile);
      // Verificar si el archivo existe
      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
          // El archivo no existe, crearlo vacío
          fs.writeFile(filePath, '', (err) => {
            if (err) {
              console.error('Error al crear el archivo LogdeCargaCSV.log:', err);
              res.status(500).send('Error al crear el archivo LogdeCargaCSV.log');
              return;
            }
            // El archivo se ha creado con éxito, ahora podemos leerlo
            leerArchivoLog(filePath);
          });
        } else {
          // El archivo existe, leerlo
          leerArchivoLog(filePath);
        }
      });
      
      function leerArchivoLog(filePath) {
        const logContent = fs.readFile(filePath, 'utf8', (err, logContent) => {
          if (err) {
            console.error('Error al leer el archivo LogdeCargaCSV.log:', err);
            res.status(500).send('Error al leer el archivo LogdeCargaCSV.log');
            return;
          }
          res.send(logContent);
        });
      }
      //console.log('Comando ejecutado con éxito:', resultado .toString());
    } catch (error) {
      // Ocurrió un error al ejecutar el comando
      console.error('Error al ejecutar el comando:', error);
      res.status(500).send('Error al ejecutar el comando');
      return;
    }
  } catch (err) {
    console.error('Error al procesar los archivos CSV:', err);
    res.status(500).send('Error al procesar los archivos CSV');
  }
});
//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
<<<<<<< HEAD
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
=======
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
>>>>>>> origin/test
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
const esValorValido = (valor) => {
  const valoresPermitidos = ['A', 'B', 'C', 'D'];
  return valoresPermitidos.includes(valor);
};


app.post('/showParams', async (req, res) => {
  try {
    const { appUser, appPass, DBName } = req.body;
    console.log("user: "+appUser+"\npass: "+appPass+"\nDBName: "+DBName);
    const decryptedAppPass = await getDecryptedPassUser(appPass);


    console.log("Pase");

    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_'+DBName);

    console.log("conex generado");

    const userdb = conex.getDB();
    const client = await conex.connectToDatabase();
    const db = client.db(userdb);

    //----------------------------Variabilidad-----------------------------------
    const parametrosVariabilidadAlta = await db.collection('parametros_usuario').findOne({
      "Tipo": "Criterios",
      "Criterio_Clasificacion": "Variabilidad",
      "SubClasificacion": "Alta",
      "Orden": 3
    });
    const parametrosVariabilidadMedia = await db.collection('parametros_usuario').findOne({
      "Tipo": "Criterios",
      "Criterio_Clasificacion": "Variabilidad",
      "SubClasificacion": "Media",
      "Orden": 2
    });
    const parametrosVariabilidadBaja = await db.collection('parametros_usuario').findOne({
      "Tipo": "Criterios",
      "Criterio_Clasificacion": "Variabilidad",
      "SubClasificacion": "Baja",
      "Orden": 1
    });
    const valorVarAlta = parametrosVariabilidadAlta?.Parametros ?? 'N/A';
    const valorVarMedia = parametrosVariabilidadMedia?.Parametros ?? 'N/A';
    const valorVarBaja = parametrosVariabilidadBaja?.Parametros ?? 'N/A';

  //-------------------------Clasificacion A, B, C, D---------------------------------------
  //AltaBajoMuy_Baja
const parametrosClasAltaBajoMuy_Baja = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"AltaBajoMuy Baja"
});
const valorClasAltaBajoMuy_Baja = parametrosClasAltaBajoMuy_Baja?.Clasificacion_ABCD ?? 'N/A';

//AltaAltoMuy_Baja
const parametrosClasAltaAltoMuy_Baja = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"AltaAltoMuy Baja"
});
const valorClasAltaAltoMuy_Baja = parametrosClasAltaAltoMuy_Baja?.Clasificacion_ABCD ?? 'N/A';

//AltaBajoBaja
const parametrosClasAltaBajoBaja = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"AltaBajoBaja"
});
const valorClasAltaBajoBaja = parametrosClasAltaBajoBaja?.Clasificacion_ABCD ?? 'N/A';

//AltaAltoBaja
const parametrosClasAltaAltoBaja = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"AltaAltoBaja"
});
const valorClasAltaAltoBaja = parametrosClasAltaAltoBaja?.Clasificacion_ABCD ?? 'N/A';

//AltaBajoMedia
const parametrosClasAltaBajoMedia = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"AltaBajoMedia"
});
const valorClasAltaBajoMedia = parametrosClasAltaBajoMedia?.Clasificacion_ABCD ?? 'N/A';

//AltaAltoMedia
const parametrosClasAltaAltoMedia = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"AltaAltoMedia"
});
const valorClasAltaAltoMedia = parametrosClasAltaAltoMedia?.Clasificacion_ABCD ?? 'N/A';

//AltaBajoAlta
const parametrosClasAltaBajoAlta = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"AltaBajoAlta"
});
const valorClasAltaBajoAlta = parametrosClasAltaBajoAlta?.Clasificacion_ABCD ?? 'N/A';

//AltaAltoAlta
const parametrosClasAltaAltoAlta = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"AltaAltoAlta"
});
const valorClasAltaAltoAlta = parametrosClasAltaAltoAlta?.Clasificacion_ABCD ?? 'N/A';

//MediaBajoMuy_Baja
const parametrosClasMediaBajoMuy_Baja = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"MediaBajoMuy Baja"
});
const valorClasMediaBajoMuy_Baja = parametrosClasMediaBajoMuy_Baja?.Clasificacion_ABCD ?? 'N/A';

//MediaAltoMuy_Baja
const parametrosClasMediaAltoMuy_Baja = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"MediaAltoMuy Baja"
});
const valorClasMediaAltoMuy_Baja = parametrosClasMediaAltoMuy_Baja?.Clasificacion_ABCD ?? 'N/A';

//MediaBajoBaja
const parametrosClasMediaBajoBaja = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"MediaBajoBaja"
});
const valorClasMediaBajoBaja = parametrosClasMediaBajoBaja?.Clasificacion_ABCD ?? 'N/A';

//MediaAltoBaja
const parametrosClasMediaAltoBaja = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"MediaAltoBaja"
});
const valorClasMediaAltoBaja = parametrosClasMediaAltoBaja?.Clasificacion_ABCD ?? 'N/A';

//MediaBajoMedia
const parametrosClasMediaBajoMedia = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"MediaBajoMedia"
});
const valorClasMediaBajoMedia = parametrosClasMediaBajoMedia?.Clasificacion_ABCD ?? 'N/A';

//MediaAltoMedia
const parametrosClasMediaAltoMedia = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"MediaAltoMedia"
});
const valorClasMediaAltoMedia = parametrosClasMediaAltoMedia?.Clasificacion_ABCD ?? 'N/A';

//MediaBajoAlta
const parametrosClasMediaBajoAlta = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"MediaBajoAlta"
});
const valorClasMediaBajoAlta = parametrosClasMediaBajoAlta?.Clasificacion_ABCD ?? 'N/A';

//MediaAltoAlta
const parametrosClasMediaAltoAlta = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"MediaAltoAlta"
});
const valorClasMediaAltoAlta = parametrosClasMediaAltoAlta?.Clasificacion_ABCD ?? 'N/A';

//BajaBajoMuy_Baja
const parametrosClasBajaBajoMuy_Baja = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"BajaBajoMuy Baja"
});
const valorClasBajaBajoMuy_Baja = parametrosClasBajaBajoMuy_Baja?.Clasificacion_ABCD ?? 'N/A';

//BajaAltoMuy_Baja
const parametrosClasBajaAltoMuy_Baja = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"BajaAltoMuy Baja"
});
const valorClasBajaAltoMuy_Baja = parametrosClasBajaAltoMuy_Baja?.Clasificacion_ABCD ?? 'N/A';

//BajaBajoBaja
const parametrosClasBajaBajoBaja = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"BajaBajoBaja"
});
const valorClasBajaBajoBaja = parametrosClasBajaBajoBaja?.Clasificacion_ABCD ?? 'N/A';

//BajaAltoBaja
const parametrosClasBajaAltoBaja = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"BajaAltoBaja"
});
const valorClasBajaAltoBaja = parametrosClasBajaAltoBaja?.Clasificacion_ABCD ?? 'N/A';


//BajaBajoMedia
const parametrosClasBajaBajoMedia = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"BajaBajoMedia"
});
const valorClasBajaBajoMedia = parametrosClasBajaBajoMedia?.Clasificacion_ABCD ?? 'N/A';


//BajaAltoMedia
const parametrosClasBajaAltoMedia = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"BajaAltoMedia"
});
const valorClasBajaAltoMedia = parametrosClasBajaAltoMedia?.Clasificacion_ABCD ?? 'N/A';

//BajaBajoAlta
const parametrosClasBajaBajoAlta = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"BajaBajoAlta"
});
const valorClasBajaBajoAlta = parametrosClasBajaBajoAlta?.Clasificacion_ABCD ?? 'N/A';

//BajaAltoAlta
const parametrosClasBajaAltoAlta = await db.collection('parametros_usuario').findOne({
  "Tipo": "Variabilidad",
  "ID":"BajaAltoAlta"
});
const valorClasBajaAltoAlta = parametrosClasBajaAltoAlta?.Clasificacion_ABCD ?? 'N/A';

//---------Margen--------------
//MargenBajo
const parametrosMargenBajo = await db.collection('parametros_usuario').findOne({
  "Tipo": "Criterios",
  "Criterio_Clasificacion":"Margen",
  "SubClasificacion": "Bajo",
  "Orden": 1

});
const valorMargenBajoPre = parametrosMargenBajo?.Parametros ?? 'N/A';
const valorMargenBajo = valorMargenBajoPre * 100;
//MargenAlto
const parametrosMargenAlto = await db.collection('parametros_usuario').findOne({
  "Tipo": "Criterios",
  "Criterio_Clasificacion":"Margen",
  "SubClasificacion": "Alto",
  "Orden": 2

});
const valorMargenAltoPre = parametrosMargenAlto?.Parametros ?? 'N/A';
const valorMargenAlto = valorMargenAltoPre * 100;

  //---------------------Demanda------------------------------------------------ 
//DemandaMuyBaja
const parametrosDemandaMuyBaja = await db.collection('parametros_usuario').findOne({
  "Tipo": "Criterios",
  "Criterio_Clasificacion":"Demanda",
  "SubClasificacion": "Muy Baja",
  "Orden": 4
});
const valorDemandaMuyBaja = parametrosDemandaMuyBaja?.Parametros ?? 'N/A';

//DemandaBaja
const parametrosDemandaBaja = await db.collection('parametros_usuario').findOne({
  "Tipo": "Criterios",
  "Criterio_Clasificacion":"Demanda",
  "SubClasificacion": "Baja",
  "Orden": 3
});
const valorDemandaBaja = parametrosDemandaBaja?.Parametros ?? 'N/A';

//DemandaMedia
const parametrosDemandaMedia = await db.collection('parametros_usuario').findOne({
  "Tipo": "Criterios",
  "Criterio_Clasificacion":"Demanda",
  "SubClasificacion": "Media",
  "Orden": 2
});
const valorDemandaMedia = parametrosDemandaMedia?.Parametros ?? 'N/A';

//DemandaAlta
const parametrosDemandaAlta = await db.collection('parametros_usuario').findOne({
  "Tipo": "Criterios",
  "Criterio_Clasificacion":"Demanda",
  "SubClasificacion": "Alta",
  "Orden": 1
});
const valorDemandaAlta = parametrosDemandaAlta?.Parametros ?? 'N/A';

  //--------------------------------------------------------------------- 

  //HorizonteHistorico
  const parametrosHorizonteHistorico = await db.collection('parametros_usuario').findOne({
    "Tipo": "Horizontes",
    "Num_Param":1
  });
  const valorHorizonteHistorico = parametrosHorizonteHistorico?.Horizonte_Historico_dias ?? 'N/A';

  //FinHorizonte
  const parametrosFinHorizonte = await db.collection('parametros_usuario').findOne({
    "Tipo": "Horizontes",
    "Num_Param":2
  });
  //const valorFinHorizonte = parametrosFinHorizonte?.Fecha_Fin_Horizonte ?? 'N/A';
  const fechaMongoDB = parametrosFinHorizonte?.Fecha_Fin_Horizonte ?? 'N/A';
  //const fechaLocal = moment.utc(fechaMongoDB).local().format('DD/MM/YYYY');
  const fechaFormateada = moment.utc(fechaMongoDB).format('DD/MM/YYYY');
  const valorFinHorizonte = fechaFormateada;

  //--------------------------------------------------------------------- 

  //NivelServ_A
  const parametrosNivelServ_A = await db.collection('parametros_usuario').findOne({
    "Tipo": "Nivel_Servicio",
    "Clasificacion": "A"
  });
  const valorNivelServ_A = parametrosNivelServ_A?.NivelServicio ?? 'N/A';

  //NivelServ_B
  const parametrosNivelServ_B = await db.collection('parametros_usuario').findOne({
    "Tipo": "Nivel_Servicio",
    "Clasificacion": "B"
  });
  const valorNivelServ_B = parametrosNivelServ_B?.NivelServicio ?? 'N/A';

  //NivelServ_C
  const parametrosNivelServ_C = await db.collection('parametros_usuario').findOne({
    "Tipo": "Nivel_Servicio",
    "Clasificacion": "C"
  });
  const valorNivelServ_C = parametrosNivelServ_C?.NivelServicio ?? 'N/A';

  //NivelServ_D
  const parametrosNivelServ_D = await db.collection('parametros_usuario').findOne({
    "Tipo": "Nivel_Servicio",
    "Clasificacion": "D"
  });
  const valorNivelServ_D = parametrosNivelServ_D?.NivelServicio ?? 'N/A';
  //--------------------------------------------------------------------- 
   // res.render('index', {
  const allParams = [ 
    valorVarAlta, 
    valorVarMedia, 
    valorVarBaja, 
    valorClasAltaBajoMuy_Baja,
    valorClasAltaAltoMuy_Baja,
    valorClasAltaBajoBaja,
    valorClasAltaAltoBaja,
    valorClasAltaBajoMedia,
    valorClasAltaAltoMedia,
    valorClasAltaBajoAlta,
    valorClasAltaAltoAlta,
    valorClasMediaBajoMuy_Baja,
    valorClasMediaAltoMuy_Baja,
    valorClasMediaBajoBaja,
    valorClasMediaAltoBaja,
    valorClasMediaBajoMedia,
    valorClasMediaAltoMedia,
    valorClasMediaBajoAlta,
    valorClasMediaAltoAlta,
    valorClasBajaBajoMuy_Baja,
    valorClasBajaAltoMuy_Baja,
    valorClasBajaBajoBaja,
    valorClasBajaAltoBaja,
    valorClasBajaBajoMedia,
    valorClasBajaAltoMedia,
    valorClasBajaBajoAlta,
    valorClasBajaAltoAlta,
    valorMargenBajo,
    valorMargenAlto,
    valorDemandaMuyBaja,
    valorDemandaBaja,
    valorDemandaMedia,
    valorDemandaAlta,
    valorHorizonteHistorico,
    valorFinHorizonte,
    valorNivelServ_A,
    valorNivelServ_B,
    valorNivelServ_C,
    valorNivelServ_D
  ];

  res.json(allParams);
    
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener el valor desde la base de datos.');
  }
});
//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
// Guardar parametros
app.post('/saveParams', async (req, res) => {
  try {
    const { appUser, appPass, DBName } = req.body;
    console.log("user: "+appUser+"\npass: "+appPass+"\nDBName: "+DBName);
    const decryptedAppPass = await getDecryptedPassUser(appPass);

    console.log("Pase");

    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_'+DBName);

    console.log("conex generado");

    const userdb = conex.getDB();
    const client = await conex.connectToDatabase();
    const db = client.db(userdb);
   
    const NvarAlta = req.body.NvarAlta;
    const NvarMedia = req.body.NvarMedia;
    //const NvarBaja = req.body.NvarBaja;

    const NVaMbDmb = req.body.NVaMbDmb;
    const NVaMaDmb = req.body.NVaMaDmb;
    const NVaMbDb = req.body.NVaMbDb;
    const NVaMaDb = req.body.NVaMaDb;
    const NVaMbDm = req.body.NVaMbDm;
    const NVaMaDm = req.body.NVaMaDm;
    const NVaMbDa = req.body.NVaMbDa;
    const NVaMaDa = req.body.NVaMaDa;

    const NVmMbDmb = req.body.NVmMbDmb;
    const NVmMaDmb = req.body.NVmMaDmb;
    const NVmMbDb = req.body.NVmMbDb;
    const NVmMaDb = req.body.NVmMaDb;
    const NVmMbDm = req.body.NVmMbDm;
    const NVmMaDm = req.body.NVmMaDm;
    const NVmMbDa = req.body.NVmMbDa;
    const NVmMaDa = req.body.NVmMaDa;


    const NVbMbDmb = req.body.NVbMbDmb;
    const NVbMaDmb = req.body.NVbMaDmb;
    const NVbMbDb = req.body.NVbMbDb;
    const NVbMaDb = req.body.NVbMaDb;
    const NVbMbDm = req.body.NVbMbDm;
    const NVbMaDm = req.body.NVbMaDm;
    const NVbMbDa = req.body.NVbMbDa;
    const NVbMaDa = req.body.NVbMaDa;

    const NMbDmb = req.body.NMbDmb;
    const NMaDmb = req.body.NMaDmb;

    console.log("Margen Alto:"+NMaDmb);

    const NDmb = req.body.NDmb;
    const NDb = req.body.NDb;
    const NDm = req.body.NDm;
    const NDa = req.body.NDa;

    const NhorHist = req.body.NhorHist;
    const NfinHist = req.body.NfinHist;
    console.log("FechaFin:"+NfinHist);

    const NNSA = req.body.NNSA;
    const NNSB = req.body.NNSB;
    const NNSC = req.body.NNSC;
    const NNSD = req.body.NNSD;
   
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Criterios",
        "Criterio_Clasificacion": "Variabilidad",
        "SubClasificacion": "Alta",
        "Orden": 3
      },
      { $set: { "Parametros": NvarAlta } }
    );
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Criterios",
        "Criterio_Clasificacion": "Variabilidad",
        "SubClasificacion": "Media",
        "Orden": 2
      },
      { $set: { "Parametros": NvarMedia } }
    );
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Criterios",
        "Criterio_Clasificacion": "Variabilidad",
        "SubClasificacion": "Baja",
        "Orden": 1
      },
      { $set: { "Parametros": '0.5' } }
    );
    //------------------------
    //AltaBajoMuy_Baja
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"AltaBajoMuy Baja"
      },
      { $set: { "Clasificacion_ABCD": NVaMbDmb } }
    );
    //AltaAltoMuy_Baja
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"AltaAltoMuy Baja"
      },
      { $set: { "Clasificacion_ABCD": NVaMaDmb } }
    );
    //AltaBajoBaja
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"AltaBajoBaja"
      },
      { $set: { "Clasificacion_ABCD": NVaMbDb } }
    );
    //AltaAltoBaja
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"AltaAltoBaja"
      },
      { $set: { "Clasificacion_ABCD": NVaMaDb } }
    );
    //AltaBajoMedia
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"AltaBajoMedia"
      },
      { $set: { "Clasificacion_ABCD": NVaMbDm } }
    );
    //AltaAltoMedia
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"AltaAltoMedia"
      },
      { $set: { "Clasificacion_ABCD": NVaMaDm } }
    );
    //AltaBajoAlta
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"AltaBajoAlta"
      },
      { $set: { "Clasificacion_ABCD": NVaMbDa } }
    );
    //AltaAltoAlta
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"AltaAltoAlta"
      },
      { $set: { "Clasificacion_ABCD": NVaMaDa } }
    );
    //--------------------------------------------
    //MediaBajoMuy_Baja
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"MediaBajoMuy Baja"
      },
      { $set: { "Clasificacion_ABCD": NVmMbDmb } }
    );
    //MediaAltoMuy_Baja
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"MediaAltoMuy Baja"
      },
      { $set: { "Clasificacion_ABCD": NVmMaDmb } }
    );
    //MediaBajoBaja
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"MediaBajoBaja"
      },
      { $set: { "Clasificacion_ABCD": NVmMbDb } }
    );
    //MediaAltoBaja
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"MediaAltoBaja"
      },
      { $set: { "Clasificacion_ABCD": NVmMaDb } }
    );


    //MediaBajoMedia
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"MediaBajoMedia"
      },
      { $set: { "Clasificacion_ABCD": NVmMbDm } }
    );
    //MediaAltoMedia
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"MediaAltoMedia"
      },
      { $set: { "Clasificacion_ABCD": NVmMaDm } }
    );
    //MediaBajoAlta
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"MediaBajoAlta"
      },
      { $set: { "Clasificacion_ABCD": NVmMbDa } }
    );
    //MediaAltoAlta
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"MediaAltoAlta"
      },
      { $set: { "Clasificacion_ABCD": NVmMaDa } }
    );
    //BajaBajoMuy_Baja
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"BajaBajoMuy Baja"
      },
      { $set: { "Clasificacion_ABCD": NVbMbDmb } }
    );
    //BajaAltoMuy_Baja
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"BajaAltoMuy Baja"
      },
      { $set: { "Clasificacion_ABCD": NVbMaDmb } }
    );
    //BajaBajoBaja
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"BajaBajoBaja"
      },
      { $set: { "Clasificacion_ABCD": NVbMbDb } }
    );
    //BajaAltoBaja
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"BajaAltoBaja"
      },
      { $set: { "Clasificacion_ABCD": NVbMaDb } }
    );
    //BajaBajoMedia
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"BajaBajoMedia"
      },
      { $set: { "Clasificacion_ABCD": NVbMbDm } }
    );
    //BajaAltoMedia
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"BajaAltoMedia"
      },
      { $set: { "Clasificacion_ABCD": NVbMaDm } }
    );
    //BajaBajoAlta
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"BajaBajoAlta"
      },
      { $set: { "Clasificacion_ABCD": NVbMbDa } }
    );
    //BajaAltoAlta
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Variabilidad",
        "ID":"BajaAltoAlta"
      },
      { $set: { "Clasificacion_ABCD": NVbMaDa } }
    );

    //-----------------------------------------------------------------
    //MargenBajoAlto

    const adNMbDmb = NMbDmb / 100;
    //console.log(nuevovalorMargenBajoAlto_2);
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Criterios",
        "Criterio_Clasificacion":"Margen",
        "SubClasificacion": "Bajo",
        "Orden": 1
      },
      { $set: { "Parametros": adNMbDmb } }
    );
    const adNMaDmb = NMaDmb / 100;
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Criterios",
        "Criterio_Clasificacion":"Margen",
        "SubClasificacion": "Alto",
        "Orden": 2
      },
      { $set: { "Parametros": adNMaDmb } }
    );
    //--------------Demanda-----------

    //DemandaMuyBaja
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Criterios",
        "Criterio_Clasificacion":"Demanda",
        "SubClasificacion": "Muy Baja",
        "Orden": 4
      },
      { $set: { "Parametros": NDmb } }
    );
    //DemandaBaja
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Criterios",
        "Criterio_Clasificacion":"Demanda",
        "SubClasificacion": "Baja",
        "Orden": 3
      },
      { $set: { "Parametros": NDb } }
    );
    //DemandaMedia
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Criterios",
        "Criterio_Clasificacion":"Demanda",
        "SubClasificacion": "Media",
        "Orden": 2
      },
      { $set: { "Parametros": NDm } }
    );
    //DemandaAlta
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Criterios",
        "Criterio_Clasificacion":"Demanda",
        "SubClasificacion": "Alta",
        "Orden": 1
      },
      { $set: { "Parametros": NDa } }
    );

    //-------------------------

    //HorizonteHistorico
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Horizontes",
        "Num_Param": 1
      },
      { $set: { "Horizonte_Historico_dias": NhorHist } }
    );
    //FinHorizonte
    //const fechaFinHorizonte = moment(nuevovalorFinHorizonte, 'DD/MM/YYYY').toDate();
    //const fechaFinHorizonte = moment(nuevovalorFinHorizonte, 'DD/MM/YYYY').startOf('day').toDate();
    
    var tye = NfinHist.slice(0, 4);
    var tmo = NfinHist.slice(5, 7);
    var tda = NfinHist.slice(8, 10);
    adNfinHist= tda+'/'+tmo+'/'+tye;
    
    console.log("FechaFin reor:"+adNfinHist);
    const adadNfinHist = moment.tz(adNfinHist, 'DD/MM/YYYY', 'UTC').toDate();
    console.log("FechaFin adjusted:"+adadNfinHist);
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Horizontes",
        "Num_Param": 2
      },
      { $set: { "Fecha_Fin_Horizonte": adadNfinHist } }
    );
    //-------------------------
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Nivel_Servicio",
        "Clasificacion": "A"
      },
      { $set: { "NivelServicio": NNSA } }
    );
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Nivel_Servicio",
        "Clasificacion": "B"
      },
      { $set: { "NivelServicio": NNSB } }
    );
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Nivel_Servicio",
        "Clasificacion": "C"
      },
      { $set: { "NivelServicio": NNSC } }
    );
    await db.collection('parametros_usuario').updateOne(
      {
        "Tipo": "Nivel_Servicio",
        "Clasificacion": "D"
      },
      { $set: { "NivelServicio": NNSD } }
    );

//-------------------------

    client.close();

    console.log("Fin save params");

    // Enviar una respuesta de éxito al cliente
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al guardar los nuevos valores en la base de datos.');
  }
});
//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
app.post('/runProcess', async (req, res) => {
  try {
    const { appUser, appPass, DBName } = req.body;
    //console.log("user: "+appUser+"\npass: "+appPass+"\nDBName: "+DBName);
    const decryptedAppPass = await getDecryptedPassUser(appPass);

    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_'+DBName);

    console.log("running x dia");
    const usuarioLog = conex.getUser();
    const comando = `cd /d "${rutaDirClasifABCD}" && node exec_js_Main_ClasABCD_PolInvent_process_v2.js ${usuarioLog}`;
    //const comando = `cd /d "${rutaDirClasifABCD}" && node exec_js_Main_ClasABCD_PolInvent_process_v2.js TEST01`;
    
    try {
      const resultado = execSync(comando);
      //const filePath = path.resolve(__dirname, rutaDirLogFile);

      console.log('Comando ejecutado con éxito:', resultado.toString());
      res.sendStatus(200);
    } catch (error) {
      console.error('Error al ejecutar el comando:', error.stderr.toString());
      return;
    }
  } catch (err) {
    console.error('Error al procesar:', err);
    res.status(500).send('Error al procesar');
  }
});
//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
app.post('/runProcessSem', async (req, res) => {
  try {
    const { appUser, appPass, DBName } = req.body;
    //console.log("user: "+appUser+"\npass: "+appPass+"\nDBName: "+DBName);
    const decryptedAppPass = await getDecryptedPassUser(appPass);

    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_'+DBName);

    console.log("running x sem");
    const usuarioLog = conex.getUser();
    const comando = `cd /d "${rutaDirClasifABCDSem}" && node exec_js_Main_Sem_ClasABCD_PolInvent_process.js ${usuarioLog}`;
    `cd /d " && node exec_js_Main_Sem_ClasABCD_PolInvent_process.js DemoUser01`;
    try {
      const resultado = execSync(comando);
      //const filePath = path.resolve(__dirname, rutaDirLogFile);

      console.log('Comando ejecutado con éxito:', resultado.toString());
      res.sendStatus(200);
    } catch (error) {
      console.error('Error al ejecutar el comando:', error.stderr.toString());
      return;
    }
  } catch (err) {
    console.error('Error al procesar:', err);
    res.status(500).send('Error al procesar');
  }
});





//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
app.post('/getCSVPol', async (req, res) => {
  let client;

  try {
    const { appUser, appPass, DBName, type, cal } = req.body;
    console.log(`user: ${appUser}\npass: ${appPass}\nDBName: ${DBName}\ntype: ${type}\ncal: ${cal}`);
    const decryptedAppPass = await decryptData(appPass);

    console.log("Pase");

    client = await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);

    console.log("conex generado");

    const userdb = conex.getDB();
    const db = client.db(userdb);

    let collectionName = '';

    if (type === 'clasifABCD') {
      collectionName = cal === 'Diario' ? 'ui_demanda_abcd' : 'ui_sem_demanda_abcd';
  } else if (type === 'polInv') {
      collectionName = cal === 'Diario' ? 'ui_all_pol_inv' : 'ui_sem_all_pol_inv';
  }

  console.log(collectionName);

    const collection = db.collection(collectionName);

    const data = await collection.find({}).toArray();

    if (!data.length) {
      res.status(404).json({ error: 'No data found' });
      return;
    }

    const fields = Object.keys(data[0]);
    const opts = { fields };
    const parser = new Parser(opts);
    const csv = parser.parse(data);

    const filePath = path.join(__dirname, 'exported_data.csv');
    fs.writeFileSync(filePath, csv);

    res.download(filePath, 'exported_data.csv', (err) => {
      if (err) {
        console.error('Error downloading the file:', err);
        res.status(500).json({ error: 'Error downloading the file' });
      }

      fs.unlinkSync(filePath);
    });
  } catch (err) {
    console.error('Error connecting to the database or exporting data:', err);
    res.status(500).json({ error: 'Error exporting data' });
  } finally {
    if (client) {
      client.close();
    }
  }
});
//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

<<<<<<< HEAD
=======
app.post('/getCSVPol1', async (req, res) => {
  let client;

  try {
    const { appUser, appPass, DBName, type, cal, subtype } = req.body;

    if (!appUser || !appPass || !DBName || !type || !cal || !subtype) {
      return res.status(400).json({ error: 'Faltan parámetros en la solicitud.' });
    }

    console.log(`user: ${appUser}\nDB: ${DBName}\ntype: ${type}\ncal: ${cal}\nsubtype: ${subtype}`);
    
    const decryptedAppPass = await decryptData(appPass);
    
    client = await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);
    
    const userdb = conex.getDB();
    const db = client.db(userdb);

    // Mapeo de colecciones
    const collections = {
      polInv: {
        Diario: {
          costo: 'ui_pol_inv_costo',
          dias_cobertura: 'ui_pol_inv_dias_cobertura',
          pallets: 'ui_pol_inv_pallets',
          uom: 'ui_pol_inv_uom'
        },
        Semanal: {
          costo: 'ui_sem_pol_inv_costo',
          dias_cobertura: 'ui_sem_pol_inv_dias_cobertura',
          pallets: 'ui_sem_pol_inv_pallets',
          uom: 'ui_sem_pol_inv_uom'
        }
      }
    };

    const collectionName = collections[type]?.[cal]?.[subtype];

    if (!collectionName) {
      return res.status(400).json({ error: 'Parámetros inválidos.' });
    }

    console.log(`Consultando colección: ${collectionName}`);

    const collection = db.collection(collectionName);
    const data = await collection.find({}).toArray();

    if (!data.length) {
      return res.status(404).json({ error: 'No se encontraron datos en la colección.' });
    }

    const csv = parse(data);

    const filePath = path.join(__dirname, 'output.csv');
    fs.writeFileSync(filePath, csv);

    res.download(filePath, 'datos.csv', (err) => {
      if (err) {
        console.error('Error al enviar el archivo:', err);
        res.status(500).json({ error: 'Error al generar el CSV' });
      }
      fs.unlinkSync(filePath);
    });

  } catch (error) {
    console.error('Error en /getCSVPol1:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

module.exports = app;


>>>>>>> origin/test
// Plan de Reposicion
app.post('/CargaInvDisponible', upload.fields([{ name: 'doc', maxCount: 1 }]), async (req, res) => {
  try {
    console.log("Cargar Inventario Disponible");

    const { appUser, appPass, DBName } = req.body;
    const decryptedAppPass = await getDecryptedPassUser(appPass);

    console.log("user: " + appUser + "\npass: " + decryptedAppPass + "\nDBName: " + DBName);

    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);

    console.log("Conexión generada");

    const invDispCsv = req.files['doc'][0];
    const windowsDir = `../${DBName}/csv/`;

    fs.renameSync(invDispCsv.path, windowsDir + 'in/inventario_disponible.csv');

    const rutaDirLogFile = path.join(__dirname, `../${DBName}/log/LogdeCargaInvDispoCSV.log`);

    const comando = `cd /d "${rutaDirCargaInvDisponible}" && node exec_js_InvDispoMain_LoadData.js ${appUser}`;

    try {
      console.log(comando);

      const resultado = execSync(comando);
      console.log(resultado);
      const filePath = path.resolve(__dirname, rutaDirLogFile);

      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
          fs.writeFile(filePath, '', (err) => {
            if (err) {
              console.error('Error al crear el archivo de log:', err);
              res.status(500).send('Error al crear el archivo de log');
              return;
            }
            leerArchivoLog(filePath);
          });
        } else {
          leerArchivoLog(filePath);
        }
      });

      function leerArchivoLog(filePath) {
        fs.readFile(filePath, 'utf-8', (err, logContent) => {
          if (err) {
            console.error('Error al leer el archivo LogdeCargaInvDisp.log:', err);
            res.status(500).send('Error al leer el archivo LogdeCargaInvDisp.log');
            return;
          }
          res.send(logContent);
        });
      }

      console.log('Comando ejecutado con éxito:', resultado.toString());
    } catch (error) {
      console.error('Error al ejecutar el comando:', error);
      res.status(500).send('Error al ejecutar el comando');
      return;
    }
  } catch (err) {
    console.error('Error al procesar los archivos CSV:', err);
    res.status(500).send('Error al procesar los archivos CSV');
  }
});

// Otras configuraciones y middlewares de Express

//const PORT = process.env.PORT || 3000;
//app.listen(PORT, () => {
//  console.log(`Servidor corriendo en el puerto ${PORT}`);
//});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

app.post('/getActualCSVInvDisp', async (req, res) => {
  try {
    const { appUser, appPass, DBName } = req.body;
    const decryptedAppPass = await getDecryptedPassUser(appPass);

    console.log("user: " + appUser + "\npass: " + decryptedAppPass + "\nDBName: " + DBName);

    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);

    console.log("conex generado");

<<<<<<< HEAD
    // Ruta donde se guardarán los archivos procesados
    const processedDir = `../${DBName}/csv/in/procesados/`;

    const files = fs.readdirSync(processedDir);

    // Ordenar los archivos por fecha de modificación para obtener el más reciente
    const sortedFiles = files
      .map(file => ({
        name: file,
        time: fs.statSync(path.join(processedDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    if (sortedFiles.length === 0) {
      return res.status(404).send('No relevant CSV files found');
    }

    // Descargar el archivo CSV más reciente del directorio procesado
    const file = sortedFiles[0];
    res.download(file.path, file.name, (err) => {
      if (err) {
        console.error('Error downloading the file:', err);
        res.status(500).send('Error downloading the file');
      }
    });
  } catch (error) {
    console.error('Error getting the latest CSV:', error);
    res.status(500).send('Error getting the latest CSV');
=======
    // Ruta del directorio donde están los archivos procesados
    const processedDir = path.resolve(__dirname, `../${DBName}/csv/in/procesados/`);

    // Verificar si el directorio existe
    if (!fs.existsSync(processedDir)) {
      return res.status(404).send('El directorio de archivos procesados no existe.');
    }

    // Obtener los archivos del directorio
    const files = fs.readdirSync(processedDir);

    if (files.length === 0) {
      return res.status(404).send('No se encontraron archivos CSV relevantes.');
    }

    // Crear un archivo ZIP en memoria
    const zipFileName = 'archivos_procesados.zip';
    res.attachment(zipFileName);

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      console.error('Error al generar el ZIP:', err);
      res.status(500).send('Error al generar el archivo ZIP');
    });

    archive.pipe(res);

    // Agregar archivos al ZIP
    files.forEach(file => {
      const filePath = path.join(processedDir, file);
      archive.file(filePath, { name: file }); // Agregar con el nombre base
    });

    await archive.finalize(); // Finalizar la compresión
  } catch (error) {
    console.error('Error al procesar los archivos CSV:', error);
    res.status(500).send('Error al procesar los archivos CSV');
>>>>>>> origin/test
  }
});
//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

app.post('/CargaInvTrans', upload.fields([
  { name: 'doc', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log("Cargar Inventario en Tránsito");

    const { appUser, appPass, DBName } = req.body;
    const decryptedAppPass = await getDecryptedPassUser(appPass);

    console.log(`user: ${appUser}\npass: ${decryptedAppPass}\nDBName: ${DBName}`);

    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);

    console.log("Conexión generada");

    const invTransCsv = req.files['doc'][0];
    const windowsDir = `../${DBName}/csv/`;

    // Mover y renombrar los archivos CSV cargados a la ruta de Windows
    fs.renameSync(invTransCsv.path, windowsDir + 'in/inventario_transito.csv');

    const rutaDirLogFile = path.join(__dirname, `../${DBName}/log/LogdeCargaInvTransCSV.log`);

    const comando = `cd /d "${rutaDirCargaInvTrans}" && node exec_js_InvTransMain_LoadData.js ${appUser}`;

    try {
      console.log(comando);

      const resultado = execSync(comando);
      console.log(resultado);
      const filePath = path.resolve(__dirname, rutaDirLogFile);

      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
          fs.writeFile(filePath, '', (err) => {
            if (err) {
              console.error('Error al crear el archivo LogdeCargaInvTransCSV.log:', err);
              res.status(500).send('Error al crear el archivo LogdeCargaInvTransCSV.log');
              return;
            }
            leerArchivoLog(filePath);
          });
        } else {
          leerArchivoLog(filePath);
        }
      });

      function leerArchivoLog(filePath) {
        const logContent = fs.readFile(filePath, 'utf8', (err, logContent) => {
          if (err) {
            console.error('Error al leer el archivo LogdeCargaInvTransCSV.log:', err);
            res.status(500).send('Error al leer el archivo LogdeCargaInvTransCSV.log');
            return;
          }
          res.send(logContent);
        });
      }
      console.log('Comando ejecutado con éxito:', resultado.toString());
    } catch (error) {
      console.error('Error al ejecutar el comando:', error);
      res.status(500).send('Error al ejecutar el comando');
      return;
    }
  } catch (err) {
    console.error('Error al procesar los archivos CSV:', err);
    res.status(500).send('Error al procesar los archivos CSV');
  }
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

app.post('/CargaRequerimientosConfirmados', upload.fields([
  { name: 'doc', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log("Cargar Requerimientos Confirmados");

    const { appUser, appPass, DBName } = req.body;
    const decryptedAppPass = await getDecryptedPassUser(appPass);

    console.log(`user: ${appUser}\npass: ${decryptedAppPass}\nDBName: ${DBName}`);

    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);

    console.log("Conexión generada");

    const reqConfCsv = req.files['doc'][0];
    const windowsDir = `../${DBName}/csv/`;

    // Mover y renombrar los archivos CSV cargados a la ruta de Windows
    fs.renameSync(reqConfCsv.path, windowsDir + 'in/requerimientos_confirmados.csv');

    const rutaDirLogFile = path.join(__dirname, `../${DBName}/log/LogdeCargaRequConfCSV.log`);

    const comando = `cd /d "${rutaDirCargaRequerimientosConfirmados }" && node exec_js_RequConfir_Main_LoadData.js ${appUser}`;

    try {
      console.log(comando);

      const resultado = execSync(comando);
      console.log(resultado);
      const filePath = path.resolve(__dirname, rutaDirLogFile);

      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
          fs.writeFile(filePath, '', (err) => {
            if (err) {
              console.error('Error al crear el archivo LogdeCargaReqConf.log:', err);
              res.status(500).send('Error al crear el archivo LogdeCargaReqConf.log');
              return;
            }
            leerArchivoLog(filePath);
          });
        } else {
          leerArchivoLog(filePath);
        }
      });

      function leerArchivoLog(filePath) {
        const logContent = fs.readFile(filePath, 'utf8', (err, logContent) => {
          if (err) {
            console.error('Error al leer el archivo LogdeCargaReqConf.log:', err);
            res.status(500).send('Error al leer el archivo LogdeCargaReqConf.log');
            return;
          }
          res.send(logContent);
        });
      }
      console.log('Comando ejecutado con éxito:', resultado.toString());
    } catch (error) {
      console.error('Error al ejecutar el comando:', error);
      res.status(500).send('Error al ejecutar el comando');
      return;
    }
  } catch (err) {
    console.error('Error al procesar los archivos CSV:', err);
    res.status(500).send('Error al procesar los archivos CSV');
  }
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

// Endpoint para ejecutar el plan de reposición diario
app.post('/runPlanReposicionDiario', async (req, res) => {
  try {
    const { appUser, appPass, DBName } = req.body;
    const decryptedAppPass = await getDecryptedPassUser(appPass);
    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);
    console.log("Running plan de reposición - Diario");
    const usuarioLog = conex.getUser();
<<<<<<< HEAD
    const comando = `cd /d "${rutaDirPlanReposicion}" && node exec_js_Main_PlanReposicion_process.js ${usuarioLog}`;

    exec(comando, (error, stdout, stderr) => {
=======
    
    // Comando para ejecutar el Plan de Reposición Diario
    const comandoPlanReposicion = `cd /d "${rutaDirPlanReposicion}" && node exec_js_Main_PlanReposicion_process.js ${usuarioLog}`;

    exec(comandoPlanReposicion, (error, stdout, stderr) => {
>>>>>>> origin/test
      if (error) {
        console.error('Diario - Error al ejecutar el comando:', error);
        res.status(500).send('Error al ejecutar el comando diario');
        return;
      }
      console.log('Diario - Comando ejecutado con éxito:', stdout);
<<<<<<< HEAD
      res.sendStatus(200);
=======
      
      // Si el Plan de Reposición se ejecuta con éxito, ejecutar el proceso PowerBI Plan de Reposición
      console.log("Ejecutando proceso de PowerBI Plan de Reposición...");
      const comandoPowerBI = `cd /d "${rutaDirPowerBi_PlanReposicion}" && node exec_js_Main_PowerBI_PR_process.js ${usuarioLog}`;
      
      exec(comandoPowerBI, (error, stdout, stderr) => {
        if (error) {
          console.error('PowerBI - Error al ejecutar el comando:', error);
          res.status(500).send('Error al ejecutar el proceso de PowerBI Plan de Reposición');
          return;
        }
        console.log('PowerBI - Proceso ejecutado con éxito:', stdout);
        res.sendStatus(200);
      });
>>>>>>> origin/test
    });
  } catch (err) {
    console.error('Diario - Error al procesar:', err);
    res.status(500).send('Error al procesar el plan de reposición diario');
  }
});

<<<<<<< HEAD
=======

>>>>>>> origin/test
// Endpoint para ejecutar el plan de reposición semanal
app.post('/runPlanReposicionSemanal', async (req, res) => {
  try {
    const { appUser, appPass, DBName } = req.body;
    const decryptedAppPass = await getDecryptedPassUser(appPass);
    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);
    console.log("Running plan de reposición - Semanal");
    const usuarioLog = conex.getUser();
<<<<<<< HEAD
    const comando = `cd /d "${rutaDirPlanReposicion_Sem}" && node exec_js_Main_Sem_PlanReposicion_process.js ${usuarioLog}`;

    exec(comando, (error, stdout, stderr) => {
=======

    // Comando para ejecutar el Plan de Reposición Semanal
    const comandoPlanReposicionSemanal = `cd /d "${rutaDirPlanReposicion_Sem}" && node exec_js_Main_Sem_PlanReposicion_process.js ${usuarioLog}`;

    exec(comandoPlanReposicionSemanal, (error, stdout, stderr) => {
>>>>>>> origin/test
      if (error) {
        console.error('Semanal - Error al ejecutar el comando:', error);
        res.status(500).send('Error al ejecutar el comando semanal');
        return;
      }
      console.log('Semanal - Comando ejecutado con éxito:', stdout);
<<<<<<< HEAD
      res.sendStatus(200);
=======
      
      // Si el Plan de Reposición Semanal se ejecuta con éxito, ejecutar el proceso PowerBI Plan de Reposición
      console.log("Ejecutando proceso de PowerBI Plan de Reposición...");
      const comandoPowerBI = `cd /d "${rutaDirPowerBi_PlanReposicion_Sem}" && node exec_js_Main_Sem_PowerBI_PR_process.js ${usuarioLog}`;
      
      exec(comandoPowerBI, (error, stdout, stderr) => {
        if (error) {
          console.error('PowerBI - Error al ejecutar el comando:', error);
          res.status(500).send('Error al ejecutar el proceso de PowerBI Plan de Reposición');
          return;
        }
        console.log('PowerBI - Proceso ejecutado con éxito:', stdout);
        res.sendStatus(200);
      });
>>>>>>> origin/test
    });
  } catch (err) {
    console.error('Semanal - Error al procesar:', err);
    res.status(500).send('Error al procesar el plan de reposición semanal');
  }
});

<<<<<<< HEAD
=======

>>>>>>> origin/test
//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
app.post('/getCSVPlanReposicion', async (req, res) => {
  let client;

  try {
    const { appUser, appPass, DBName, type, cal } = req.body;
    if (!appUser || !appPass || !DBName || !type || !cal) {
      console.error('Faltan parámetros necesarios');
      return res.status(400).send('Faltan parámetros necesarios');
    }

<<<<<<< HEAD
=======
    // Corregido: uso de backticks para interpolación de variables
>>>>>>> origin/test
    console.log(`user: ${appUser}\npass: ${appPass}\nDBName: ${DBName}\ntype: ${type}\ncal: ${cal}`);
    const decryptedAppPass = await decryptData(appPass);

    client = await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);

    console.log("conex generado");

    const userdb = conex.getDB();
    const db = client.db(userdb);
    
    let collectionName = '';

    if (type === 'PlanReposicion') {
      if (cal === 'Diario') {
        collectionName = 'ui_plan_reposicion';
      } else if (cal === 'Semanal') {
        collectionName = 'ui_sem_plan_reposicion';
      } else {
        console.error('Calendario no soportado');
        return res.status(400).send('Calendario no soportado');
      }
    } else {
      console.error('Tipo de plan no soportado');
      return res.status(400).send('Tipo de plan no soportado');
    }

<<<<<<< HEAD
=======
    // Corregido: uso de backticks para interpolación de variables
>>>>>>> origin/test
    console.log(`Fetching data from collection: ${collectionName}`);
    const collection = db.collection(collectionName);

    const data = await collection.find({}).toArray();

    if (!data.length) {
      console.error('No data found in the collection');
      res.status(404).send('No data found');
      return;
    }

    const fields = Object.keys(data[0]);
    const opts = { fields };
    const parser = new Parser(opts);
    const csv = parser.parse(data);

    const filePath = path.join(__dirname, 'exported_data.csv');
    fs.writeFileSync(filePath, csv);

<<<<<<< HEAD
=======
    // Corregido: uso de backticks para interpolación de variables
>>>>>>> origin/test
    res.download(filePath, `${type}_data.csv`, (err) => {
      if (err) {
        console.error('Error downloading the file:', err);
        res.status(500).send('Error downloading the file');
      }

      fs.unlinkSync(filePath);
    });
  } catch (err) {
    console.error('Error connecting to the database or exporting data:', err);
    res.status(500).send('Error exporting data');
  } finally {
    if (client) {
      client.close();
    }
  }
});

<<<<<<< HEAD
=======

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

// Endpoint para ejecutar el override del plan de reposición
app.post('/runOverridePlanReposicion', async (req, res) => {
  try {
    const { appUser, appPass, DBName, overrideValues } = req.body;
    
    // Verificar si overrideValues es válido
    if (!overrideValues || typeof overrideValues !== 'object' || Object.keys(overrideValues).length === 0) {
      return res.status(400).send('Valores de override inválidos o vacíos');
    }

    // Desencriptar la contraseña
    const decryptedAppPass = await getDecryptedPassUser(appPass);

    // Conectar a la base de datos y establecer los datos del usuario
    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);
    console.log("Running Override plan de reposición - Diario");
    const usuarioLog = conex.getUser();

    // Obtener la conexión a la base de datos una sola vez
    const client = await conex.connectToDatabase();
    const db = client.db('btc_opti_' + DBName);
    const collection = db.collection('plan_reposicion_01'); // Colección de plan de reposición

    // Iterar sobre los valores de override para actualizar por SKU
    for (const [sku, pallets] of Object.entries(overrideValues)) {
      console.log(`Actualizando el documento con SKU: ${sku}, con Plan_Firme_Pallets:`, pallets);

      // Actualizar el valor específico dentro de Plan_Firme_Pallets usando el SKU como filtro
      const result = await collection.updateOne(
        { SKU: sku }, // Filtro por el SKU
        { $set: { 'Plan_Firme_Pallets': pallets } } // Actualización del valor dentro del documento
      );

      // Verificar si la actualización fue exitosa
      console.log(`Documentos coincidentes para el SKU: ${sku}`, result.matchedCount);
      console.log(`Documentos modificados para el SKU: ${sku}`, result.modifiedCount);

      if (result.matchedCount === 0) {
        console.warn(`Advertencia: No se encontró ningún documento para el SKU: ${sku}`);
      }

      if (result.modifiedCount === 0) {
        console.warn(`Advertencia: No se modificó ningún documento para el SKU: ${sku}`);
      }
    }

    console.log(`Actualización completada en plan_reposicion_01`);

    // Preparar el comando para ejecutar el proceso de override
    const overrideValuesString = JSON.stringify(overrideValues).replace(/"/g, '\\"');
    const comando = `cd /d "${rutaDirOverridePlanReposicion}" && node exec_js_Main_OverridePlanReposicion_process.js ${usuarioLog} "${overrideValuesString}"`;

    // Ejecutar el comando
    exec(comando, (error, stdout, stderr) => {
      if (error) {
        console.error('Diario - Error al ejecutar el comando:', error);
        res.status(500).send('Error al ejecutar el override diario');
        return;
      }
      console.log('Diario - Comando ejecutado con éxito:', stdout);
      res.status(200).json({ message: 'Override diario ejecutado con éxito', stdout, stderr });
    });
  } catch (err) {
    console.error('Diario - Error al procesar:', err);
    res.status(500).json({ message: 'Error al procesar el override plan de reposición diario', error: err });
  }
});






//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

// Endpoint para ejecutar el override del plan de reposición
app.post('/runOverridePlanReposicion_Sem', async (req, res) => {
  try {
    const { appUser, appPass, DBName, overrideValues } = req.body;
    
    // Verificar si overrideValues es válido
    if (!overrideValues || typeof overrideValues !== 'object' || Object.keys(overrideValues).length === 0) {
      return res.status(400).send('Valores de override inválidos o vacíos');
    }

    // Desencriptar la contraseña
    const decryptedAppPass = await getDecryptedPassUser(appPass);

    // Conectar a la base de datos y establecer los datos del usuario
    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);
    console.log("Running Override plan de reposición - Diario");
    const usuarioLog = conex.getUser();

    // Obtener la conexión a la base de datos
    const client = await conex.connectToDatabase();
    const db = client.db('btc_opti_' + DBName);
    const collection = db.collection('plan_reposicion_01_sem'); // Colección de plan de reposición
    
    // Iterar sobre los valores de override y actualizar la colección
    for (const [sku, overrideValue] of Object.entries(overrideValues)) {
      if (isNaN(overrideValue)) {
        console.warn(`Valor no numérico para SKU: ${sku}, valor: ${overrideValue}`);
        continue;  // Saltar a la siguiente iteración si el valor no es un número
      }

      console.log(`Actualizando SKU: ${sku}, con Plan_Firme_Pallets: ${overrideValue}`);

      // Actualizar el campo Plan_Firme_Pallets
      const result = await collection.updateOne(
        { SKU: sku }, // Filtro para encontrar el SKU correcto
        { $set: { 'Plan_Firme_Pallets': Number(overrideValue) } } // Actualización
      );

      // Verificar si la actualización fue exitosa
      if (result.matchedCount === 0) {
        console.warn(`Advertencia: No se encontró ningún documento para SKU: ${sku}`);
      }

      if (result.modifiedCount === 0) {
        console.warn(`Advertencia: No se modificó ningún documento para SKU: ${sku}`);
      }

      console.log(`Actualización completada en plan_reposicion_01_sem para SKU: ${sku}`);
    }

    // Preparar el comando para ejecutar el proceso de override
    const overrideValuesString = JSON.stringify(overrideValues).replace(/"/g, '\\"');
    const comando = `cd /d "${rutaDirOverridePlanReposicion_Sem}" && node exec_js_Main_OverridePlanReposicion_process.js ${usuarioLog} "${overrideValuesString}"`;

    // Ejecutar el comando
    exec(comando, (error, stdout, stderr) => {
      if (error) {
        console.error('Diario - Error al ejecutar el comando:', error);
        res.status(500).send('Error al ejecutar el override diario');
        return;
      }
      console.log('Diario - Comando ejecutado con éxito:', stdout);
      res.sendStatus(200);
    });
  } catch (err) {
    console.error('Diario - Error al procesar:', err);
    res.status(500).send('Error al procesar el override plan de reposición diario');
  }
});

>>>>>>> origin/test
//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%


<<<<<<< HEAD
// Iniciar el servidor
const http = require('http');
const { combinations } = require('mathjs');
=======
// Endpoint para ejecutar el override de la política de inventarios
app.post('/runOverridePoliticaInventarios', async (req, res) => {
  try {
    const { appUser, appPass, DBName, overrideValues } = req.body;
    
    // Desencriptar la contraseña
    const decryptedAppPass = await getDecryptedPassUser(appPass);
    
    // Conectar a la base de datos y establecer los datos del usuario
    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);
    console.log("Running Override politica de Inventarios - Diario");
    const usuarioLog = conex.getUser();

    // Verificar el contenido de overrideValues para asegurarnos de que esté correcto
    console.log("overrideValues recibidos:", overrideValues);

    // Obtener la conexión a la base de datos
    const client = await conex.connectToDatabase(); 
    const db = client.db('btc_opti_' + DBName); 
    const collection = db.collection('politica_inventarios_01'); // Colección de políticas de inventario
    
    // Iterar sobre los valores de override y actualizar la colección
    for (const [sku, overrideValue] of Object.entries(overrideValues)) {
      console.log(`Actualizando SKU: ${sku}, con Override_SS_Cantidad: ${overrideValue}`);
      
      // Actualizar el campo Override_SS_Cantidad en la colección y obtener el resultado
      const result = await collection.updateOne(
        { SKU: sku }, // Filtro para encontrar el SKU correcto
        //{ $set: { 'SS_Cantidad': Number(overrideValue) } }
        { $set: { 'Override_SS_Cantidad': Number(overrideValue) } } 
      );

      // Verificar si la actualización fue exitosa
      console.log(`Documentos coincidentes para SKU: ${sku}:`, result.matchedCount);
      console.log(`Documentos modificados para SKU: ${sku}:`, result.modifiedCount);
      
      if (result.matchedCount === 0) {
        console.warn(`Advertencia: No se encontró ningún documento para SKU: ${sku}`);
      }

      if (result.modifiedCount === 0) {
        console.warn(`Advertencia: No se modificó ningún documento para SKU: ${sku}`);
      }

      console.log(`Actualización completada en politica_inventarios_01 para SKU: ${sku}`);
    }

    // Preparar el comando para ejecutar el proceso de override
    const overrideValuesString = JSON.stringify(overrideValues).replace(/"/g, '\\"');
    const comando = `cd /d "${rutaDirPoliticaInventarios}" && node exec_js_Main_OverridePoliticaInventario_process.js ${usuarioLog} "${overrideValuesString}"`;

    // Ejecutar el comando
    exec(comando, (error, stdout, stderr) => {
      if (error) {
        console.error('Error al ejecutar el comando:', error);
        res.status(500).send('Error al ejecutar el override diario');
        return;
      }
      console.log('Salida estándar (stdout):', stdout);
      console.log('Errores estándar (stderr):', stderr);
      res.sendStatus(200);
    });
  } catch (err) {
    console.error('Diario - Error al procesar:', err);
    res.status(500).send('Error al procesar el override politica de inventario diario');
  }
});




//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

// Endpoint para ejecutar el override de la política de inventarios semanal
app.post('/runOverridePoliticaInventarios_Sem', async (req, res) => {
  try {
    const { appUser, appPass, DBName, overrideValues } = req.body;
    
    // Desencriptar la contraseña
    const decryptedAppPass = await getDecryptedPassUser(appPass);
    
    // Conectar a la base de datos y establecer los datos del usuario
    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);
    console.log("Running Override politica de Inventarios - Semanal");
    const usuarioLog = conex.getUser();

    // Verificar el contenido de overrideValues para asegurarnos de que esté correcto
    console.log("overrideValues recibidos:", overrideValues);

    // Obtener la conexión a la base de datos
    const client = await conex.connectToDatabase(); 
    const db = client.db('btc_opti_' + DBName); 

    const collection = db.collection('politica_inventarios_01_sem'); // Colección de políticas de inventario
    
    // Iterar sobre los valores de override y actualizar la colección
    for (const [sku, overrideValue] of Object.entries(overrideValues)) {
      console.log(`Actualizando SKU: ${sku}, con Override_SS_Cantidad: ${overrideValue}`);
      
      // Actualizar el campo Override_SS_Cantidad en la colección y obtener el resultado
      const result = await collection.updateOne(
        { SKU: sku }, // Filtro para encontrar el SKU correcto
        //{ $set: { 'SS_Cantidad': Number(overrideValue) } },
        { $set: { 'Override_SS_Cantidad': Number(overrideValue) } } 
      );

      // Verificar si la actualización fue exitosa
      console.log(`Documentos coincidentes para SKU: ${sku}:`, result.matchedCount);
      console.log(`Documentos modificados para SKU: ${sku}:`, result.modifiedCount);
      
      if (result.matchedCount === 0) {
        console.warn(`Advertencia: No se encontró ningún documento para SKU: ${sku}`);
      }

      if (result.modifiedCount === 0) {
        console.warn(`Advertencia: No se modificó ningún documento para SKU: ${sku}`);
      }

      console.log(`Actualización completada en politica_inventarios_01_sem para SKU: ${sku}`);
    }

    // Preparar el comando para ejecutar el proceso de override
    const overrideValuesString = JSON.stringify(overrideValues).replace(/"/g, '\\"');
    const comando = `cd /d "${rutaDirPoliticaInventarios_Sem}" && node exec_js_Main_Sem_OverridePoliticaInventario_process.js ${usuarioLog} "${overrideValuesString}"`;

    // Ejecutar el comando
    exec(comando, (error, stdout, stderr) => {
      if (error) {
        console.error('Error al ejecutar el comando:', error);
        res.status(500).send('Error al ejecutar el override semanal');
        return;
      }
      console.log('Salida estándar (stdout):', stdout);
      console.log('Errores estándar (stderr):', stderr);
      res.sendStatus(200);
    });
  } catch (err) {
    console.error('Semanal - Error al procesar:', err);
    res.status(500).send('Error al procesar el override politica de inventario semanal');
  }
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%


const { spawn } = require('child_process');



app.post('/applyGeneralOverride', async (req, res) => {
  try {
    const { appUser, appPass, DBName, overrideValues, tipoProceso } = req.body;

    // Validar que tipoProceso sea válido
    if (!['Diario', 'Semanal'].includes(tipoProceso)) {
      return res.status(400).send('Tipo de proceso no soportado. Use "Diario" o "Semanal".');
    }

    // Validar overrideValues
    if (!overrideValues || typeof overrideValues !== 'object' || Object.keys(overrideValues).length === 0) {
      return res.status(400).send('Datos de override inválidos o vacíos.');
    }

    for (const [sku, value] of Object.entries(overrideValues)) {
      if (!sku) {
        return res.status(400).send(`SKU inválido: "${sku}"`);
      }
      if (isNaN(value)) {
        return res.status(400).send(`El valor para el SKU ${sku} no es un número válido.`);
      }
    }

    // Desencriptar la contraseña
    const decryptedAppPass = await getDecryptedPassUser(appPass);

    // Conectar a la base de datos y establecer los datos del usuario
    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);
    const usuarioLog = conex.getUser();

    // Obtener la conexión a la base de datos
    const client = await conex.connectToDatabase();
    const db = client.db('btc_opti_' + DBName);

    // Seleccionar la colección según tipoProceso
    let collection;
    if (tipoProceso === 'Diario') {
      collection = db.collection('politica_inventarios_01');
    } else if (tipoProceso === 'Semanal') {
      collection = db.collection('politica_inventarios_01_sem');
    }

    const resultados = [];
    for (const [sku, overrideValue] of Object.entries(overrideValues)) {
      try {
        console.log(`Procesando SKU: ${sku}, valor de ajuste: ${overrideValue}`);
    
        const currentDoc = await collection.findOne({ SKU: sku });
        if (!currentDoc) {
          console.warn(`Advertencia: No se encontró ningún documento para SKU: ${sku}`);
          continue;
        }
    
        const baseValue = currentDoc.SS_Cantidad ?? 0; // Valor base del sistema
        const currentOverride = currentDoc.Override_SS_Cantidad ?? baseValue; // Usa baseValue si no hay override
        const newOverride = currentOverride + Number(overrideValue); // Aplica suma o resta según el valor
    
        // Actualizar el valor acumulado
        await collection.updateOne(
          { SKU: sku },
          { $set: { Override_SS_Cantidad: newOverride } }
        );
    
        resultados.push({
          sku,
          valorBase: baseValue,
          ajuste: overrideValue,
          valorFinal: newOverride,
        });
    
        console.log(`Nuevo valor para SKU ${sku}: ${newOverride}`);
      } catch (dbError) {
        console.error(`Error procesando SKU ${sku}:`, dbError);
      }
    }
    
    // Crear un archivo temporal para los datos de override
    const tempFilePath = path.join(__dirname, 'override_values_temp.json');
    fs.writeFileSync(tempFilePath, JSON.stringify(overrideValues));

    // Preparar el comando según tipoProceso
    let comando;
    if (tipoProceso === 'Diario') {
      comando = `cd /d "${rutaDirPoliticaInventarios}" && node exec_js_Main_OverridePoliticaInventario_process.js ${usuarioLog} "${tempFilePath}"`;
    } else if (tipoProceso === 'Semanal') {
      comando = `cd /d "${rutaDirPoliticaInventarios_Sem}" && node exec_js_Main_Sem_OverridePoliticaInventario_process.js ${usuarioLog} "${tempFilePath}"`;
    }

    exec(comando, (error, stdout, stderr) => {
      try {
        fs.unlinkSync(tempFilePath); // Limpieza del archivo temporal
      } catch (unlinkError) {
        console.error('Error al eliminar el archivo temporal:', unlinkError);
      }

      if (error) {
        console.error('Error al ejecutar el comando:', stderr);
        return res.status(500).send(`Error al ejecutar el general override: ${stderr}`);
      }

      console.log('Salida estándar (stdout):', stdout);
      res.status(200).json({ mensaje: 'General override aplicado correctamente', resultados });
    });
  } catch (err) {
    console.error('General Override - Error al procesar:', err);
    res.status(500).send('Error al procesar el general override');
  }
});


//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

app.post('/runOverridePoliticaInventarios_ROP', async (req, res) => {
  try {
    const { appUser, appPass, DBName, overrideValues } = req.body;
    
    // Desencriptar la contraseña
    const decryptedAppPass = await getDecryptedPassUser(appPass);
    
    // Conectar a la base de datos y establecer los datos del usuario
    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);
    console.log("Running Override politica de Inventarios - Diario");
    const usuarioLog = conex.getUser();

    // Verificar el contenido de overrideValues para asegurarnos de que esté correcto
    console.log("overrideValues recibidos:", overrideValues);

    // Obtener la conexión a la base de datos
    const client = await conex.connectToDatabase(); 
    const db = client.db('btc_opti_' + DBName); 
    const collection = db.collection('politica_inventarios_01'); // Colección de políticas de inventario
    
    // Iterar sobre los valores de override y actualizar la colección
    for (const [sku, overrideValue] of Object.entries(overrideValues)) {
      console.log(`Actualizando SKU: ${sku}, con Override_ROP: ${overrideValue}`);
      
      // Actualizar el campo Override_SS_Cantidad en la colección y obtener el resultado
      const result = await collection.updateOne(
        { SKU: sku }, // Filtro para encontrar el SKU correcto
        //{ $set: { 'SS_Cantidad': Number(overrideValue) } }
        { $set: { 'Override_ROP': Number(overrideValue) } } 
      );

      // Verificar si la actualización fue exitosa
      console.log(`Documentos coincidentes para SKU: ${sku}:`, result.matchedCount);
      console.log(`Documentos modificados para SKU: ${sku}:`, result.modifiedCount);
      
      if (result.matchedCount === 0) {
        console.warn(`Advertencia: No se encontró ningún documento para SKU: ${sku}`);
      }

      if (result.modifiedCount === 0) {
        console.warn(`Advertencia: No se modificó ningún documento para SKU: ${sku}`);
      }

      console.log(`Actualización completada en politica_inventarios_01 para SKU: ${sku}`);
    }

    // Preparar el comando para ejecutar el proceso de override
    const overrideValuesString = JSON.stringify(overrideValues).replace(/"/g, '\\"');
    const comando = `cd /d "${rutaDirPoliticaInventarios}" && node exec_js_Main_OverridePoliticaInventario_process.js ${usuarioLog} "${overrideValuesString}"`;

    // Ejecutar el comando
    exec(comando, (error, stdout, stderr) => {
      if (error) {
        console.error('Error al ejecutar el comando:', error);
        res.status(500).send('Error al ejecutar el override diario');
        return;
      }
      console.log('Salida estándar (stdout):', stdout);
      console.log('Errores estándar (stderr):', stderr);
      res.sendStatus(200);
    });
  } catch (err) {
    console.error('Diario - Error al procesar:', err);
    res.status(500).send('Error al procesar el override ROP diario');
  }
});
//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
app.post('/runOverridePoliticaInventarios_ROP_Sem', async (req, res) => {
  try {
    const { appUser, appPass, DBName, overrideValues } = req.body;
    
    // Desencriptar la contraseña
    const decryptedAppPass = await getDecryptedPassUser(appPass);
    
    // Conectar a la base de datos y establecer los datos del usuario
    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);
    console.log("Running Override politica de Inventarios - Semanal");
    const usuarioLog = conex.getUser();

    // Verificar el contenido de overrideValues para asegurarnos de que esté correcto
    console.log("overrideValues recibidos:", overrideValues);

    // Obtener la conexión a la base de datos
    const client = await conex.connectToDatabase(); 
    const db = client.db('btc_opti_' + DBName); 

    const collection = db.collection('politica_inventarios_01_sem'); // Colección de políticas de inventario
    
    // Iterar sobre los valores de override y actualizar la colección
    for (const [sku, overrideValue] of Object.entries(overrideValues)) {
      console.log(`Actualizando SKU: ${sku}, con Override_ROP: ${overrideValue}`);
      
      // Actualizar el campo Override_ROP en la colección y obtener el resultado
      const result = await collection.updateOne(
        { SKU: sku }, // Filtro para encontrar el SKU correcto
        //{ $set: { 'SS_Cantidad': Number(overrideValue) } },
        { $set: { 'Override_ROP': Number(overrideValue) } } 
      );

      // Verificar si la actualización fue exitosa
      console.log(`Documentos coincidentes para SKU: ${sku}:`, result.matchedCount);
      console.log(`Documentos modificados para SKU: ${sku}:`, result.modifiedCount);
      
      if (result.matchedCount === 0) {
        console.warn(`Advertencia: No se encontró ningún documento para SKU: ${sku}`);
      }

      if (result.modifiedCount === 0) {
        console.warn(`Advertencia: No se modificó ningún documento para SKU: ${sku}`);
      }

      console.log(`Actualización completada en politica_inventarios_01_sem para SKU: ${sku}`);
    }

    // Preparar el comando para ejecutar el proceso de override
    const overrideValuesString = JSON.stringify(overrideValues).replace(/"/g, '\\"');
    const comando = `cd /d "${rutaDirPoliticaInventarios_Sem}" && node exec_js_Main_Sem_OverridePoliticaInventario_process.js ${usuarioLog} "${overrideValuesString}"`;

    // Ejecutar el comando
    exec(comando, (error, stdout, stderr) => {
      if (error) {
        console.error('Error al ejecutar el comando:', error);
        res.status(500).send('Error al ejecutar el override semanal');
        return;
      }
      console.log('Salida estándar (stdout):', stdout);
      console.log('Errores estándar (stderr):', stderr);
      res.sendStatus(200);
    });
  } catch (err) {
    console.error('Semanal - Error al procesar:', err);
    res.status(500).send('Error al procesar el override rROP semanal');
  }
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%


app.post('/applyGeneralOverride_ROP', async (req, res) => {
  try {
    const { appUser, appPass, DBName, overrideValues, tipoProceso } = req.body;

    // Validación inicial de datos
    if (!appUser || !appPass || !DBName || !tipoProceso || !overrideValues) {
      return res.status(400).send('Faltan parámetros obligatorios');
    }

    if (!['Diario', 'Semanal'].includes(tipoProceso)) {
      return res.status(400).send('Tipo de proceso no soportado. Use "Diario" o "Semanal".');
    }

    if (!overrideValues || typeof overrideValues !== 'object' || Object.keys(overrideValues).length === 0) {
      return res.status(400).send('Datos de override inválidos o vacíos.');
    }

    for (const [sku, value] of Object.entries(overrideValues)) {
      if (!sku) {
        return res.status(400).send(`SKU inválido: "${sku}"`);
      }
      if (isNaN(value)) {
        return res.status(400).send(`El valor para el SKU ${sku} no es un número válido.`);
      }
    }

    // Desencriptar la contraseña
    const decryptedAppPass = await getDecryptedPassUser(appPass);

    // Conectar a la base de datos y establecer los datos del usuario
    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);
    const usuarioLog = conex.getUser();

    // Obtener la conexión a la base de datos
    const client = await conex.connectToDatabase();
    const db = client.db('btc_opti_' + DBName);

    // Seleccionar la colección según tipoProceso
    let collection;
    if (tipoProceso === 'Diario') {
      collection = db.collection('politica_inventarios_01');
    } else if (tipoProceso === 'Semanal') {
      collection = db.collection('politica_inventarios_01_sem');
    }

    const resultados = [];
    for (const [sku, overrideValue] of Object.entries(overrideValues)) {
      try {
        console.log(`Procesando SKU: ${sku}, valor de ajuste ROP: ${overrideValue}`);

        const currentDoc = await collection.findOne({ SKU: sku });
        if (!currentDoc) {
          console.warn(`Advertencia: No se encontró ningún documento para SKU: ${sku}`);
          continue;
        }

        // Inicialización correcta y acumulación del Override
        const baseValue = currentDoc.ROP ?? 0; // Valor base del sistema
        const currentOverride = currentDoc.Override_ROP ?? baseValue; // Usa baseValue si no hay override previo
        const newOverride = currentOverride + Number(overrideValue); // Aplica suma o resta según el valor

        // Actualizar el valor acumulado
        await collection.updateOne(
          { SKU: sku },
          { $set: { Override_ROP: newOverride } }
        );

        resultados.push({
          sku,
          valorBase: baseValue,
          ajuste: overrideValue,
          valorFinal: newOverride,
        });

        console.log(`Nuevo valor ROP para SKU ${sku}: ${newOverride}`);
      } catch (dbError) {
        console.error(`Error procesando SKU ${sku}:`, dbError);
      }
    }

    // Crear un archivo temporal para los datos de override
    const tempFilePath = path.join(__dirname, 'override_rop_temp.json');
    fs.writeFileSync(tempFilePath, JSON.stringify(overrideValues));

    // Preparar el comando según tipoProceso
    let comando;
    if (tipoProceso === 'Diario') {
      comando = `cd /d "${rutaDirPoliticaInventarios}" && node exec_js_Main_OverridePoliticaInventario_process.js ${usuarioLog} "${tempFilePath}"`;
    } else if (tipoProceso === 'Semanal') {
      comando = `cd /d "${rutaDirPoliticaInventarios_Sem}" && node exec_js_Main_Sem_OverridePoliticaInventario_process.js ${usuarioLog} "${tempFilePath}"`;
    }

    exec(comando, (error, stdout, stderr) => {
      try {
        fs.unlinkSync(tempFilePath); // Limpieza del archivo temporal
      } catch (unlinkError) {
        console.error('Error al eliminar el archivo temporal:', unlinkError);
      }

      if (error) {
        console.error('Error al ejecutar el comando:', error.message);
        return res.status(500).send('Error al ejecutar el comando.');
      }

      console.log('Comando ejecutado exitosamente:', stdout);
      res.status(200).send({ resultados, mensaje: 'Override ROP aplicado con éxito' });
    });
  } catch (err) {
    console.error('Error al aplicar override ROP:', err);
    res.status(500).send('Error al aplicar override ROP.');
  }
});





//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%



// Endpoint para crear el backup inicial de los datos




//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%





// Endpoint para restaurar los valores originales desde el backup
app.post('/revertGeneralOverride', async (req, res) => {
  let client;
  try {
    const { appUser, appPass, DBName, tipoProceso } = req.body;

    // Validar el tipo de proceso
    if (!['Diario', 'Semanal'].includes(tipoProceso)) {
      return res.status(400).send('Tipo de proceso no soportado. Use "Diario" o "Semanal".');
    }

    // Desencriptar la contraseña y conectar a la base de datos
    const decryptedAppPass = await getDecryptedPassUser(appPass);
    client = await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, 'btc_opti_' + DBName);
    const db = client.db('btc_opti_' + DBName);

    // Definir nombres de las colecciones según el tipo de proceso
    const collections = [
      {
        source: tipoProceso === 'Diario' ? 'ui_all_pol_inv_backup' : 'ui_sem_all_pol_inv_backup',
        target: tipoProceso === 'Diario' ? 'ui_all_pol_inv' : 'ui_sem_all_pol_inv',
      },
      {
        target: tipoProceso === 'Diario' ? 'politica_inventarios_01' : 'politica_inventarios_01_sem',
        source: tipoProceso === 'Diario' ? 'politica_inventarios_01_backup' : 'politica_inventarios_01_sem_backup',
      },
    ];

    for (const { source, target } of collections) {
      const sourceCollection = db.collection(source);
      const targetCollection = db.collection(target);

      // Recuperar documentos del backup o de la fuente original
      const documents = await sourceCollection.find().toArray();

      if (documents.length === 0) {
        console.log(`No se encontraron documentos en la colección ${source}.`);
        continue; // Saltar a la siguiente colección
      }

      console.log(`Procesando ${documents.length} documentos desde ${source} hacia ${target}.`);

      // Limpiar la colección destino y restaurar documentos
      await targetCollection.deleteMany({});
      const result = await targetCollection.insertMany(documents.map(({ _id, ...doc }) => doc));

      console.log(`Se copiaron ${result.insertedCount} documentos a la colección destino (${target}).`);
    }

    res.status(200).send('Las colecciones han sido procesadas correctamente.');
  } catch (err) {
    console.error('Error al procesar las colecciones:', err);
    res.status(500).send('Error al procesar las colecciones.');
  } finally {
    if (client) await client.close(); // Cerrar la conexión a la base de datos
  }
});







//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%



const { URLSearchParams } = require('url');

app.post('/getPowerBIEmbedToken', async (req, res) => {
  
    try {
        // Verifica si las variables de entorno necesarias están configuradas
        if (!process.env.TENANT_ID || !process.env.CLIENT_ID || !process.env.CLIENT_SECRET || !process.env.GROUP_ID || !process.env.REPORT_ID) {
            console.error('Error: Faltan una o más variables de entorno necesarias.');
            return res.status(500).json({ message: 'Configuración del servidor incompleta. Por favor, verifica las variables de entorno.' });
        }

        // Paso 1: Obtener el token de acceso desde Azure
        const authResponse = await axios.post(
            `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`,
            new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                scope: 'https://analysis.windows.net/powerbi/api/.default',
                grant_type: 'client_credentials'
            }),
            { timeout: 10000 } // 10 segundos de tiempo de espera
        );

        const accessToken = authResponse.data.access_token;
        console.log("Access Token:", accessToken);

        // Prueba de acceso a las áreas de trabajo con el Access Token
        const workspaceResponse = await axios.get(
            'https://api.powerbi.com/v1.0/myorg/groups',
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                },
                timeout: 10000
            }
        );
        console.log("Workspaces:", workspaceResponse.data);

        // Paso 2: Obtener el token de incrustación para el reporte de Power BI
        const embedResponse = await axios.post(
            `https://api.powerbi.com/v1.0/myorg/groups/${process.env.GROUP_ID}/reports/${process.env.REPORT_ID}/GenerateToken`,
            { accessLevel: 'View' },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10 segundos de tiempo de espera
            }
        );

        // Enviar el token de incrustación al cliente
        res.status(200).json({
            embedToken: embedResponse.data.token,
            embedUrl: embedResponse.data.embedUrl,
            reportId: process.env.REPORT_ID
        });
    } catch (error) {
        if (error.response) {
            console.error('Embed Token Error Response:', JSON.stringify(error.response.data, null, 2));
            res.status(500).json({
                message: 'Error en la solicitud a Power BI',
                status: error.response.status,
                headers: error.response.headers,
                data: error.response.data,
                config: error.config // Muestra la configuración de la solicitud
            });
        } else if (error.request) {
            console.error('No hubo respuesta de la API:', error.message);
            res.status(500).json({ message: 'No hubo respuesta de la API de Power BI. Verifica la conexión de red.' });
        } else {
            console.error('Error al configurar la solicitud:', error.message);
            res.status(500).json({ message: 'Error al configurar la solicitud a la API de Power BI' });
        }
    }
});







//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%



app.post('/getPwBiUrl', async (req, res) => {
  try {
    // Obtenemos las credenciales desde el cuerpo de la solicitud
    const { appUser, appPass, DBName } = req.body;
    console.log('Datos recibidos:', { appUser, DBName });

    // Definimos la ruta al archivo `pwbiuservars.js` en `C:\\users\`
    const pwbiFilePath = path.join('C:\\', appUser, 'users', appUser, 'cfg', 'pwbiuservars.js');


    // Verificamos si el archivo existe
    if (!fs.existsSync(pwbiFilePath)) {
      console.log(`El archivo ${pwbiFilePath} no existe.`);
      return res.status(404).json({ error: 'Archivo de configuración de Power BI no encontrado para el usuario.' });
    }

    // Importamos el archivo y obtenemos los datos de Power BI
    const { PwBiUser, PwBiPassword, PwBiURL } = require(pwbiFilePath);
    console.log('Datos de Power BI leídos desde el archivo:', { PwBiUser, PwBiPassword, PwBiURL });

    // Enviamos la URL de Power BI en la respuesta
    res.json({ url: PwBiURL });
  } catch (error) {
    console.error('Error al obtener URL de Power BI:', error);
    res.status(500).json({ error: 'Error interno al obtener URL de Power BI' });
  }
});




//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%


app.post("/runMontecarloAndOverride", async (req, res) => {
  try {
    const { appUser, appPass, DBName, tipoProceso } = req.body;

    if (!tipoProceso) {
      return res
        .status(400)
        .send('Debe especificar el tipo de proceso: "Diario" o "Semanal".');
    }

    console.log("Inicio del proceso con:", { appUser, DBName, tipoProceso });

    // 1. Desencriptar la contraseña
    const decryptedAppPass = await getDecryptedPassUser(appPass);

    // 2. Conectar a la base de datos y establecer los datos del usuario
    await conex.connectToDatabase();
    conex.setUserData(appUser, decryptedAppPass, "btc_opti_" + DBName);

    const client = await conex.connectToDatabase();
    const db = client.db("btc_opti_" + DBName);

    // 3. Determinar la colección según el tipo de proceso
    const collectionName =
      tipoProceso === "Diario"
        ? "politica_inventarios_montecarlo"
        : "politica_inventarios_montecarlo_sem";

    const collection = db.collection(collectionName);

    const usuarioLog = conex.getUser();

    // Función para ejecutar un proceso externo
    const ejecutarProceso = (comando) =>
      new Promise((resolve, reject) => {
        const proceso = spawn(comando, {
          shell: true,
        });

        proceso.stdout.on("data", (data) => console.log(`stdout: ${data}`));
        proceso.stderr.on("data", (data) => console.error(`stderr: ${data}`));
        proceso.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Proceso terminó con código de error: ${code}`));
          }
        });
      });

    // 4. Ejecutar Monte Carlo
    console.log("Ejecutando Monte Carlo...");
    const comandoMontecarlo = `cd /d "${rutaDirMontecarlo}" && node exec_js_montecarlo.js ${appUser} ${tipoProceso}`;
    await ejecutarProceso(comandoMontecarlo);
    console.log("Monte Carlo ejecutado con éxito.");

    // 5. Leer los SKUs y valores de override desde la colección
    console.log("Extrayendo datos de la colección para el override...");
    const skuData = await collection.find({}).toArray();

    if (!skuData.length) {
      return res
        .status(404)
        .send("No se encontraron datos en la colección seleccionada.");
    }

    const overrideValues = {};
    skuData.forEach((doc) => {
      if (doc.SKU && doc.SS_cantidad != null) {
        overrideValues[doc.SKU] = doc.SS_cantidad;
      }
    });

    console.log("Datos de override obtenidos de la colección:", overrideValues);

    // 6. Actualizar la misma colección con los valores extraídos
    for (const [sku, overrideValue] of Object.entries(overrideValues)) {
      console.log(`Procesando SKU: ${sku}, OverrideValue: ${overrideValue}`);
      const result = await collection.updateOne(
        { SKU: sku },
        { $set: { Override_SS_Cantidad: Number(overrideValue) } }
      );

      console.log(
        `Documentos actualizados para SKU ${sku}:`,
        result.modifiedCount
      );

      if (result.matchedCount === 0) {
        console.warn(
          `Advertencia: No se encontró ningún documento para SKU: ${sku}`
        );
      }
    }

    // 7. Ejecutar el script externo del Override
    console.log("Ejecutando Override...");
    const comandoOverride =
      tipoProceso === "Diario"
        ? `cd /d "${rutaDirPoliticaInventarios}" && node exec_js_Main_OverridePoliticaInventario_process.js ${usuarioLog}`
        : `cd /d "${rutaDirPoliticaInventarios_Sem}" && node exec_js_Main_Sem_OverridePoliticaInventario_process.js ${usuarioLog}`;
    await ejecutarProceso(comandoOverride);
    console.log("Override ejecutado con éxito.");

    res.send({
      message: "Procesos de Monte Carlo y Override completados con éxito.",
    });
  } catch (error) {
    console.error("Error en el endpoint:", error);
    res.status(500).send({ error: "Error ejecutando los procesos." });
  }
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

// Get all roles
app.get("/api/roles", async (req, res) => {
  try {
    const client = await conex.connectToDatabase(); // Use your existing database connection logic
    const db = client.db(adminDbName); // Use the `adminDbName` variable defined in your code
    const roles = await db.collection("roles").find().toArray();
    res.status(200).json(roles);
  } catch (err) {
    console.error("Error fetching roles:", err);
    res.status(500).json({ error: "Error fetching roles." });
  }
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

// Add a new role
app.post("/api/roles", async (req, res) => {
  const { name, description, permissions } = req.body;

  if (!name || !description || !Array.isArray(permissions)) {
    return res
      .status(400)
      .json({ error: "Invalid request. Check your inputs." });
  }

  try {
    const client = await conex.connectToDatabase();
    const db = client.db(adminDbName);
    const newRole = { name, description, permissions };

    const result = await db.collection("roles").insertOne(newRole);

    if (!result.insertedId) {
      return res.status(500).json({ error: "Failed to insert the role." });
    }

    res.status(201).json({ _id: result.insertedId, ...newRole }); // Return the created role with its ID
  } catch (err) {
    console.error("Error adding new role:", err);
    res.status(500).json({ error: "Error adding new role." });
  }
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

// Update an existing role
app.put("/api/roles/:id", async (req, res) => {
  const roleId = req.params.id;
  const { permissions } = req.body;

  try {
    const client = await conex.connectToDatabase();
    const db = client.db(adminDbName);
    const result = await db
      .collection("roles")
      .updateOne({ _id: new ObjectId(roleId) }, { $set: { permissions } });

    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ error: "Role not found or no changes made." });
    }

    res.status(200).json({ message: "Permissions updated successfully." });
  } catch (err) {
    console.error("Error updating permissions:", err);
    res.status(500).json({ error: "Error updating permissions." });
  }
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

// Delete a role
app.delete("/api/roles/:id", async (req, res) => {
  const roleId = req.params.id;

  try {
    const client = await conex.connectToDatabase();
    const db = client.db(adminDbName);
    const result = await db
      .collection("roles")
      .deleteOne({ _id: new MongoClient.ObjectID(roleId) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Role not found." });
    }

    res.status(200).json({ message: "Role deleted successfully." });
  } catch (err) {
    console.error("Error deleting role:", err);
    res.status(500).json({ error: "Error deleting role." });
  }
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

app.get("/api/permissions", (req, res) => {
  try {
    // Resolve the path to the JSON file
    const filePath = "C:/OptiBack/multiusuario/permissions.json";

    // Read the JSON file synchronously (or use async if needed)
    const data = fs.readFileSync(filePath, "utf8");

    // Parse the JSON content
    const permissions = JSON.parse(data);

    // Send the parsed permissions
    res.status(200).json(permissions);
  } catch (err) {
    console.error("Error fetching permissions:", err);
    res.status(500).json({ error: "Error fetching permissions." });
  }
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

// Fetch all roles
app.get("/api/roles", async (req, res) => {
  try {
    const client = await conex.connectToDatabase();
    const db = client.db(adminDbName);

    const roles = await db.collection("roles").find({}).toArray();

    res.status(200).json(roles); // Send the list of roles
  } catch (err) {
    console.error("Error fetching roles:", err);
    res.status(500).json({ error: "Error fetching roles." });
  }
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

app.get("/api/users", async (req, res) => {
  try {
    const client = await conex.connectToDatabase();
    const db = client.db(adminDbName);
    const users = await db.collection("usuarios").find().toArray();
    res.status(200).json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Error fetching users." });
  }
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

// Update a user's role
app.put("/api/users/:appUser", async (req, res) => {
  const appUser = req.params.appUser; // The AppUser (e.g., 'multi', 'Miguel')
  const { rol } = req.body; // The new role

  if (!rol) {
    return res.status(400).json({ error: "Role is required." });
  }

  try {
    const client = await conex.connectToDatabase();
    const db = client.db(adminDbName);

    // Update the correct UserUI object in the users collection
    const result = await db.collection("usuarios").updateOne(
      { "UserUI.AppUser": appUser }, // Find the document with the matching AppUser
      { $set: { "UserUI.$.rol": rol } } // Update the 'rol' field of the matched UserUI array element
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json({ message: "Role updated successfully." });
  } catch (err) {
    console.error("Error updating user role:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});


//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

app.post("/api/create-user", (req, res) => {
  console.log("Received API request:", req.body);

  const {
    AppUser,
    AppPassword,
    UserName,
    UserTitle,
    CompanyName,
    DBName,
    DBUser,
    DBPassword,
  } = req.body;

  const scriptDir = "C:/1.-AdminTool/1.-AdminTool"; // Directory containing the script
  const scriptFile = "UsuarioPri_Nuevo_v3.js"; // Script name

  // Construct command
  const command = `node ${scriptFile} "${AppUser}" "${AppPassword}" "${UserName}" "${UserTitle}" "${CompanyName}" "${DBName}" "${DBUser}" "${DBPassword}"`;

  console.log(`Executing command in ${scriptDir}: ${command}`);

  // Run the script with the correct working directory
  const child = exec(command, { cwd: scriptDir, timeout: 60000 }, (error, stdout, stderr) => {
    if (error) {
      console.error("Error executing script:", error);
      return res
        .status(500)
        .json({ message: "Error running script", error: error.message });
    }

    if (stderr) {
      console.error("Script stderr:", stderr);
      return res.status(500).json({ message: "Script error", error: stderr });
    }

    console.log("Script executed successfully:", stdout);
    res
      .status(200)
      .json({ message: "User created successfully", output: stdout });
  });

  child.on("exit", (code) => {
    console.log(`Child process exited with code ${code}`);
  });
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%



// Iniciar el servidor
const http = require('http');
>>>>>>> origin/test

// Elimina todas las referencias a SSL y HTTPS
// const https = require('https');
// const fs = require('fs');

// Elimina también las opciones de SSL
// var options = {
//  key: fs.readFileSync('C:\\SSLcert\\optiscportal.com_key.txt'),
//  cert: fs.readFileSync('C:\\SSLcert\\optiscportal.com.crt'),
//  ca: fs.readFileSync ('C:\\SSLcert\\optiscportal.com.ca-bundle')
// };

// Si tienes el app.js importado o declarado en otro lugar, simplemente usa `app` aquí
// Si no, asegúrate de tener la instancia de Express disponible.
// Suponiendo que `app` ya está definido en otro archivo:
http.createServer(app).listen(3000, () => {
  console.log('Servidor HTTP iniciado en http://localhost:3000');
});



//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%


// Obtener el valor desencriptado del User
async function getDecryptedPassUser(p_AppPass) {
  try {
    return await decryptData(p_AppPass);
  } catch (error) {
    console.error('Error al desencriptar el User:', error);
    throw error;
  }
}
<<<<<<< HEAD

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

// Función para vaciar la carpeta uploads después del procesamiento
function limpiarCarpetaUploads() {
  const uploadsDir = path.join(__dirname, 'uploads');
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      console.error('Error al leer la carpeta uploads:', err);
      return;
    }

    // Borrar todos los archivos en la carpeta uploads
    for (const file of files) {
      fs.unlink(path.join(uploadsDir, file), (err) => {
        if (err) {
          console.error(`Error al borrar el archivo ${file}:`, err);
        }
      });
    }
  });
}

// Ruta para manejar la carga de archivos CSV y ejecutar el script de carga dinámico según la tabla seleccionada
app.post('/upload', upload.single('file'), (req, res) => {
  const { DBName, appUser, table } = req.body;

  // Verificar si DBName, appUser, y table se enviaron
  console.log('DBName:', DBName);
  console.log('appUser:', appUser);
  console.log('Table:', table);

  if (!req.file) {
    return res.status(400).send('No se ha subido ningún archivo.');
  }

  if (!DBName || !appUser || !table) {
    return res.status(400).send('Faltan parámetros DBName, appUser o table.');
  }

  // Ruta del archivo subido en la carpeta 'uploads'
  const filePath = path.join(__dirname, 'uploads', req.file.filename);
  console.log(`Archivo recibido: ${filePath}`);

  // Verificar si el archivo existe antes de continuar
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error(`Archivo no encontrado: ${filePath}`);
      return res.status(500).send('Error: Archivo no encontrado.');
    }

    // Selección del script de carga según la tabla seleccionada
    const loadCsvScriptPath = path.join(__dirname, 'modulo_demanda','Gestion_informacion','load_data_demand.js');

    // Comando para ejecutar el script de carga con parámetros adicionales
    const command = `node ${loadCsvScriptPath} "${filePath}" "${DBName}" "${appUser}" "${table}"`;

    // Ejecutar el comando para procesar el archivo CSV en la base de datos
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error al ejecutar el script de carga: ${error.message}`);
        return res.status(500).send('Error al procesar el archivo CSV.');
      }
      if (stderr) {
        console.error(`Error en la ejecución del script: ${stderr}`);
        return res.status(500).send('Error durante la ejecución del script.');
      }

      console.log(`Resultado del script: ${stdout}`);

      // Limpiar la carpeta 'uploads' después de procesar el archivo
      limpiarCarpetaUploads();

      res.status(200).send(`Archivo CSV para la tabla "${table}" procesado y subido correctamente a MongoDB.`);
    });
  });
});


//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

// Ruta para descargar el CSV de la colección seleccionada
app.post('/download-collection', (req, res) => {
  console.log('Solicitud de descarga recibida');
  const { appUser, DBName, selectedCollection } = req.body; // Asegúrate de que selectedCollection se envía desde el frontend
  console.log('appUser:', appUser, 'DBName:', DBName, 'selectedCollection:', selectedCollection);  // Verifica si los parámetros se están recibiendo correctamente

  const exportScriptPath = path.join(__dirname, 'modulo_demanda', 'Gestion_informacion', 'export_data_demand.js');
  const command = `node ${exportScriptPath} "${DBName}" "${appUser}" "${selectedCollection}"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error al ejecutar el script: ${error.message}`);
      return res.status(500).send('Error en la exportación');
    }
    console.log('Script ejecutado exitosamente');
    
    const csvFilePath = path.join(__dirname, `modulo_demanda/exports/${selectedCollection}_${appUser}.csv`);
    if (!fs.existsSync(csvFilePath)) {
      console.error('Archivo CSV no encontrado:', csvFilePath);
      return res.status(500).send('Archivo no encontrado');
    }

    res.download(csvFilePath, `${selectedCollection}.csv`, (err) => {
      if (err) {
        console.error('Error al descargar el archivo:', err);
        res.status(500).send('Error en la descarga');
      } else {
        console.log('Archivo enviado correctamente');
      }
    });
  });
});


//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

// Función para vaciar la carpeta uploads después del procesamiento
function limpiarCarpetaUploads() {
  const uploadsDir = path.join(__dirname, 'uploads');
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      console.error('Error al leer la carpeta uploads:', err);
      return;
    }

    // Borrar todos los archivos en la carpeta uploads
    for (const file of files) {
      fs.unlink(path.join(uploadsDir, file), (err) => {
        if (err) {
          console.error(`Error al borrar el archivo ${file}:`, err);
        }
      });
    }
  });
}

// Ruta para manejar la actualización de archivos CSV y ejecutar el script update_historic_demand.js
app.post('/update-collection', upload.single('file'), (req, res) => {
  const { appUser, DBName, selectedCollection } = req.body;

  // Verificar que todos los parámetros y el archivo estén presentes
  if (!req.file || !appUser || !DBName || !selectedCollection) {
    return res.status(400).send('Faltan parámetros o archivo.');
  }

  // Ruta del archivo que se acaba de subir
  const filePath = path.join(__dirname, 'uploads', req.file.filename);
  console.log(`Archivo recibido para actualización: ${filePath}`);
  console.log(`Colección seleccionada para actualización: ${selectedCollection}`);

  // Verificar si el archivo existe antes de ejecutar el script
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error(`Archivo no encontrado: ${filePath}`);
      return res.status(500).send('Error: Archivo no encontrado.');
    }

    // Ruta del script para actualizar la colección seleccionada
    const UpdatescriptPath = path.join(__dirname, 'modulo_demanda', 'update_data_demand.js');
    const command = `node ${UpdatescriptPath} "${filePath}" "${appUser}" "${DBName}" "${selectedCollection}"`;

    // Ejecutar el comando para actualizar la colección en MongoDB
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error al ejecutar el script: ${error.message}`);
        return res.status(500).send('Error al actualizar la colección seleccionada.');
      }
      if (stderr) {
        console.error(`Error en la ejecución del script: ${stderr}`);
        return res.status(500).send('Error durante la ejecución del script.');
      }

      console.log(`Resultado del script: ${stdout}`);

      // Limpiar la carpeta 'uploads' solo después de procesar el archivo
      limpiarCarpetaUploads();

      res.status(200).send('Actualización completada.');
    });
  });
});


//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

app.get('/api/:selectedTable', (req, res) => {
  const { selectedTable } = req.params;
  const { appUser, DBName } = req.query;

  if (!appUser || !DBName || !selectedTable) {
    return res.status(400).send('Faltan parámetros appUser, DBName o selectedTable.');
  }

  const outputFile = path.join(__dirname, 'modulo_demanda', 'temp', `${selectedTable}_${appUser}_${Date.now()}.json`);
  const scriptPath = path.join(__dirname, 'modulo_demanda', 'get_data_table.js');
  const command = `node ${scriptPath} "${selectedTable}" "${appUser}" "${DBName}" "${outputFile}"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('Error al ejecutar el script:', error);
      return res.status(500).send('Error al recuperar los datos de la tabla.');
    }
    
    if (stderr) {
      console.error('Error en el script:', stderr);
      return res.status(500).send('Error al recuperar los datos de la tabla.');
    }

    try {
      // Leer el archivo generado
      const tableData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      
      // Eliminar el archivo temporal
      fs.unlinkSync(outputFile);
      
      res.json(tableData);
    } catch (parseError) {
      console.error('Error al parsear el JSON:', parseError);
      res.status(500).send('Error al recuperar los datos de la tabla.');
    }
  });
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

// Endpoint para ejecutar Prophet
app.post('/api/forecast/run', (req, res) => {
  const { appUser, dbName, parameters } = req.body;

  // Validar parámetros
  if (!appUser || !dbName || !parameters) {
    return res.status(400).send('Faltan parámetros appUser, dbName o parameters.');
  }

  const { minRegistros, maxPorcentajeCeros, periodoAPredecir } = parameters;

  // Validar valores de parámetros
  if (minRegistros <= 0 || maxPorcentajeCeros < 0 || maxPorcentajeCeros > 1 || periodoAPredecir <= 0) {
    return res.status(400).send('Parámetros inválidos. Verifica minRegistros, maxPorcentajeCeros y periodoAPredecir.');
  }

  // Definir la ruta al script de ejecución
  const scriptPath = path.join(__dirname, 'modulo_demanda', 'Algoritmo_Prophet', 'exec_algoritmo_prophet.js');

  // Construir el comando para ejecutar el script
  const command = `node ${scriptPath} "${appUser}" "${dbName}" ${minRegistros} ${maxPorcentajeCeros} ${periodoAPredecir}`;

  console.log(`Ejecutando forecast con el comando: ${command}`);

  // Ejecutar el script
  exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error al ejecutar el script: ${error.message}`);
      return res.status(500).send('Error al ejecutar el forecast.');
    }
    if (stderr) {
      console.error(`Error en el script de ejecución: ${stderr}`);
      return res.status(500).send(`Error durante la ejecución: ${stderr}`);
    }

    // Enviar la salida del script al cliente
    try {
      const result = stdout.trim();
      console.log('Forecast ejecutado exitosamente:', result);
      res.json({ message: 'Forecast ejecutado exitosamente.', result });
    } catch (parseError) {
      console.error('Error al procesar el resultado del script:', parseError.message);
      res.status(500).send('Error al procesar los resultados del forecast.');
    }
  });
});

module.exports = app;

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

app.get('/api/forecast/combinations', (req, res) => {
  const { appUser, dbName } = req.query;
  console.log('Parámetros recibidos:', req.query);

  if (!appUser || !dbName) {
    return res.status(400).send('Faltan parámetros appUser o DBName.');
  }

  const scriptPath = path.join(__dirname, 'modulo_demanda', 'get_forecast_combinations.js');
  const command = `node ${scriptPath} "${appUser}" "${dbName}"`;

  exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    if (error) {
      console.error('Error al ejecutar el script:', error);
      return res.status(500).send('Error al obtener combinaciones.');
    }
    if (stderr) {
      console.error('Error en el script:', stderr);
      return res.status(500).send('Error al obtener combinaciones.');
    }

    try {
      const combinations = JSON.parse(stdout);
      res.json({ combinations });
    } catch (parseError) {
      console.error('Error al parsear el JSON:', parseError);
      res.status(500).send('Error al obtener combinaciones.');
    }
  });
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

app.get('/api/forecast/data', (req, res) => {
  const { appUser, dbName } = req.query;

  console.log('Request parameters:', { appUser, dbName });

  if (!appUser || !dbName ) {
    return res.status(400).send('Faltan parámetros appUser o dbName.');
  }

  const scriptPath = path.join(__dirname, 'modulo_demanda', 'get_forecast_data.js');
  const command = `node ${scriptPath} "${appUser}" "${dbName}"`;

  exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    if (error) {
      console.error('Error al ejecutar el script:', error);
      return res.status(500).send('Error al obtener los datos del forecast.');
    }
    if (stderr) {
      console.error('Error en el script:', stderr);
      return res.status(500).send('Error al obtener los datos del forecast.');
    }

    try {
      const forecastData = JSON.parse(stdout); // Parsear el JSON de salida
      res.json({ forecastData });
    } catch (parseError) {
      console.error('Error al parsear el JSON:', parseError);
      res.status(500).send('Error al procesar los datos del forecast.');
    }
  });
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

app.get('/api/forecast/metrics', (req, res) => {
  const { appUser, dbName } = req.query;

  if (!appUser || !dbName ) {
    return res.status(400).send('Faltan parámetros appUser o dbName.');
  }

  const scriptPath = path.join(__dirname, 'modulo_demanda', 'mape_dynamic_calculation.js'); // Reemplaza con tu script real
  const command = `node ${scriptPath} ${appUser} ${dbName}`;

  exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    if (error) {
      console.error('Error al ejecutar el script:', error);
      return res.status(500).send('Error al obtener las métricas del forecast.');
    }
    if (stderr) {
      console.error('Error en el script:', stderr);
      return res.status(500).send('Error al obtener las métricas del forecast.');
    }

    try {
      const metrics = JSON.parse(stdout);
      res.json({ metrics });
    } catch (parseError) {
      console.error('Error al parsear el JSON:', parseError);
      res.status(500).send('Error al procesar las métricas del forecast.');
    }
  });
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

app.get('/api/forecast/graphs', (req, res) => {
  const { appUser, dbName, combination } = req.query;

  console.log('Request parameters:', { appUser, dbName, combination });

  if (!appUser || !dbName || !combination) {
    return res.status(400).send('Faltan parámetros appUser o dbName.');
  }

  const scriptPath = path.join(__dirname, 'modulo_demanda', 'get_forecast_graphs.js');
  const command = `node ${scriptPath} "${appUser}" "${dbName}" "${combination}"`;

  exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    if (error) {
      console.error('Error al ejecutar el script:', error);
      return res.status(500).send('Error al obtener los datos del forecast.');
    }
    if (stderr) {
      console.error('Error en el script:', stderr);
      return res.status(500).send('Error al obtener los datos del forecast.');
    }

    try {
      const forecastData = JSON.parse(stdout); // Parsear el JSON de salida
      res.json({ forecastData });
    } catch (parseError) {
      console.error('Error al parsear el JSON:', parseError);
      res.status(500).send('Error al procesar los datos del forecast.');
    }
  });
});

//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
app.post('/runClassification', (req, res) => {
  const { dbName, appUser } = req.body;

  console.log('DBName:', dbName);
  console.log('appUser:', appUser);

  // Validar parámetros
  if (!dbName || !appUser) {
    return res.status(400).send('Faltan parámetros DBName o appUser.');
  }

  // Construir el comando para invocar el ejecutable de Node con los argumentos
  //   node exec_clasificador_demanda.js <appUser> <DBName>
  const execPath = path.join(__dirname, 'modulo_demanda','Clasificador_Demanda','exec_clasificador_demanda.js');
  const command = `node "${execPath}" "${appUser}" "${dbName}"`;

  console.log(`Ejecutando: ${command}`);

  // Invocar el proceso
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('Error al ejecutar el proceso:', error);
      return res.status(500).send(`Error al ejecutar la clasificación: ${error.message}`);
    }

    console.log('Salida del proceso (stdout):', stdout);
    if (stderr) {
      console.warn('Advertencias/errores (stderr):', stderr);
    }

    // Respuesta de éxito al cliente
    return res.status(200).send('Proceso de clasificación ejecutado correctamente.');
  });
});
//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
// Endpoint para obtener los resultados de la clasificación de demanda
app.get('/obtenerClasificacion', (req, res) => {
  const { dbName, appUser } = req.query;

  console.log('DBName:', dbName);
  console.log('appUser:', appUser);

  // Validar parámetros
  if (!dbName || !appUser) {
    return res.status(400).send('Faltan parámetros DBName o appUser.');
  }

  // Construir la ruta del script get_classification_data.js
  // Ajusta la ruta según tu estructura de carpetas
  const execPath = path.join(__dirname, 'modulo_demanda' , 'get_classification_data.js');
  const command = `node "${execPath}" "${appUser}" "${dbName}"`;

  console.log(`Ejecutando: ${command}`);

  // Ejecutar el script
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('Error al ejecutar el script:', error);
      return res.status(500).send(`Error al obtener datos de clasificación: ${error.message}`);
    }

    console.log('Salida del script (stdout):', stdout);
    if (stderr && stderr.trim()) {
      console.warn('Advertencias/errores (stderr):', stderr);
    }

    try {
      // Parsear la salida JSON del script
      const data = JSON.parse(stdout);
      return res.status(200).json(data);
    } catch (parseError) {
      console.error('Error al parsear JSON:', parseError);
      return res.status(500).send(`Error al parsear datos: ${parseError.message}`);
    }
  });
});
//&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
//%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
// Endpoint para obtener los logs de la página gestión de información
app.get('/logs', async (req, res) => {
  try {
    const { appUser, DBName, fileName } = req.query;
    
    // Validar parámetros requeridos
    if (!appUser || !DBName || !fileName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Se requieren los parámetros appUser, DBName y fileName' 
      });
    }
    
    // Validación de seguridad para evitar path traversal
    if (fileName.includes('..') || !fileName.endsWith('.log')) {
      return res.status(403).json({ 
        success: false, 
        message: 'Nombre de archivo no válido' 
      });
    }
    
    // Configurar la ruta al archivo de logs según tu estructura de directorios
    // Puedes ajustar esta ruta según tu estructura de almacenamiento de logs
    const logFilePath = path.join(__dirname, '..', appUser, 'log', fileName);



    
    // Verificar si el archivo existe
    if (!fs.existsSync(logFilePath)) {
      return res.status(404).json({ 
        success: false,
        message: 'Archivo de logs no encontrado' 
      });
    }
    
    // Leer el contenido del archivo
    const logContent = fs.readFileSync(logFilePath, 'utf8');
    
    // Opcionalmente, puedes querer limitar la cantidad de contenido devuelto
    // por ejemplo, solo las últimas N líneas
    const lines = logContent.split('\n');
    const lastLines = lines.slice(Math.max(lines.length - 500, 0)); // Últimas 500 líneas
    const trimmedContent = lastLines.join('\n');
    
    // Registrar el acceso a los logs
    console.log(`[${new Date().toISOString()}] Usuario ${appUser} accedió a los logs: ${fileName}`);
    
    // Devolver el contenido
    res.send(trimmedContent);
    
  } catch (error) {
    console.error('Error al obtener archivo de logs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener el archivo de logs',
      error: error.message 
    });
  }
});
=======
>>>>>>> origin/test
