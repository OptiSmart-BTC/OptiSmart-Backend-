import sys
import pymongo
import pandas as pd
from datetime import timedelta

def conexion_url(db_user, db_password, host, port, db_name):
    return f"mongodb://{db_user}:{db_password}@{host}:{port}/?authSource=admin"

# Parámetros de conexión a MongoDB
db_name = sys.argv[1]
db_user = sys.argv[2]
db_password = sys.argv[3]
host = sys.argv[4]
port = sys.argv[5]

# Construir la URL de conexión
mongo_url = conexion_url(db_user, db_password, host, port, db_name)
client = pymongo.MongoClient(mongo_url)

# Conectar a la base de datos y a la colección
db = client[db_name]

# Ruta al archivo Excel adjunto
opti_data_path = db["ui_sem_all_pol_inv"]
hist_demanda = db['historico_demanda']
sku_datos = db['sku']
coleccionFecha = db['parametros_usuario']

# Filtrar los documentos que tienen 'Tipo' = "Horizontes"
horizontes = list(coleccionFecha.find({"Tipo": "Horizontes"}))

# Convertir los resultados en un DataFrame de pandas
df = pd.DataFrame(horizontes)

# Extraer 'Horizonte_Historico_dias' y 'Fecha_Fin_Horizonte'
horizonte_historico = df.loc[df['Num_Param'] == 1, 'Horizonte_Historico_dias'].values[0]
fecha_fin_horizonte_np = df.loc[df['Num_Param'] == 2, 'Fecha_Fin_Horizonte'].values[0]

# Convertir numpy.datetime64 a pandas datetime
fecha_fin_horizonte = pd.to_datetime(fecha_fin_horizonte_np)

# Calcular la fecha de inicio del horizonte restando los días
fecha_inicio_horizonte = fecha_fin_horizonte - timedelta(days=int(horizonte_historico))

# Formatear las fechas
fecha_inicio_calc = fecha_inicio_horizonte.strftime('%d/%m/%Y')
fecha_fin_calc = fecha_fin_horizonte.strftime('%d/%m/%Y')

# Imprimir las fechas
print("Fecha de inicio del horizonte calculada:", fecha_inicio_calc)
print("Fecha de fin del horizonte calculada:", fecha_fin_calc)