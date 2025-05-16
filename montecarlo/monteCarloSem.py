from datetime import timedelta
import pandas as pd
import numpy as np
import pymongo
import sys

def cargar_datos(coleccion, fecha_inicio, fecha_fin):
    """
    Carga los datos desde un archivo CSV.
    """
    data = pd.DataFrame(list(coleccion.find()))
    data['SKU'] = data['Producto'] + '@' + data['Ubicacion']
    data['Fecha'] = pd.to_datetime(data['Fecha'], format='%d/%m/%Y')
    # Filtra los datos por el rango de fechas
    mask = (data['Fecha'] >= fecha_inicio) & (data['Fecha'] <= fecha_fin)
    
    return data.loc[mask]

def generar_demanda_semanal(data, sku, fecha_inicio, fecha_fin):
    """
    Genera demandas semanales para un SKU específico.
    """
    data_sku = data[data['SKU'] == sku].copy()
    data_sku = data_sku.set_index('Fecha')
    
    # Genera un rango de fechas semanal completo desde la fecha de inicio hasta la fecha de fin
    rango_semanal = pd.date_range(start=fecha_inicio, end=fecha_fin, freq='W')
    
    # Resample y suma los datos semanales, luego reindexa con el rango semanal completo
    resampled = pd.DataFrame(data_sku['Cantidad'].resample('W').sum())
    resampled_reindexed = resampled.reindex(rango_semanal, fill_value=0)
    resampled_reindexed['SKU'] = sku
    
    #print(resampled_reindexed)
    
    return resampled_reindexed

def simulacion_monte_carlo(demandas, nivel_servicio, lead_time, num_sim):
    """
    Realiza la simulación de Monte Carlo para calcular el stock de seguridad.
    """
    demandas_y_lt_simuladas = [np.sum(np.random.choice(demandas, lead_time, replace=True)) for _ in range(num_sim)]
    nivel_servicio_stock = np.percentile(demandas_y_lt_simuladas, nivel_servicio * 100)
    demnda_lead_time_avg = np.mean(demandas) * lead_time
    safety_stock = nivel_servicio_stock - demnda_lead_time_avg
    return demnda_lead_time_avg, nivel_servicio_stock, safety_stock

def calcular_demanda_y_simulacion_semanal(coleccion, sku, nivel_servicio, lead_time, num_sim, fecha_inicio, fecha_fin):
    """
    Función principal que carga los datos, genera la demanda semanal,
    y realiza la simulación de Monte Carlo.
    """
    data = cargar_datos(coleccion, fecha_inicio, fecha_fin)
    data_semanal = generar_demanda_semanal(data, sku, fecha_inicio, fecha_fin)
    demandas = data_semanal['Cantidad'].tolist()
    promedio_demanda, nivel_servicio_stock, safety_stock = simulacion_monte_carlo(demandas, nivel_servicio, lead_time, num_sim)
    
    promedio_semanal = np.mean(demandas)
    maximo_semanal = np.max(demandas)
    cantidad_ceros_en_demanda = demandas.count(0)
    
    #print(f"SKU: {sku}")
    #print(f"Average Lead Time Demand: {promedio_demanda}")
    #print(f"Service Level Stock: {nivel_servicio_stock}")
    #print(f"Safety Stock: {safety_stock}")
    
    return safety_stock, promedio_semanal, maximo_semanal, cantidad_ceros_en_demanda



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
coleccion = db['historico_demanda']
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

sku = 'A00180@FARMACIA'
nivel_servicio = 0.99
num_sim = 10000
fecha_inicio = fecha_inicio_horizonte.strftime('%d/%m/%Y')
fecha_fin = fecha_fin_horizonte.strftime('%d/%m/%Y')
lead_time = 1


