from datetime import timedelta
import pandas as pd
import numpy as np
import pymongo
import sys

def cargar_datos(coleccion, sku, fecha_inicio, fecha_fin):
    """
    Carga los datos desde un archivo CSV y prepara el DataFrame.
    """
    data = pd.DataFrame(list(coleccion.find()))
    data['SKU'] = data['Producto'] + '@' + data['Ubicacion']
    data['Fecha'] = pd.to_datetime(data['Fecha'], format='%d/%m/%Y')
    data_sku = data[(data['SKU'] == sku) & (data['Fecha'] >= fecha_inicio) & (data['Fecha'] <= fecha_fin)]
    return data_sku



def generar_demanda_diaria(data_sku, fecha_inicio, fecha_fin):
    """
    Genera demandas semanales para un SKU específico.
    """
    data_sku['Fecha'] = pd.to_datetime(data_sku['Fecha'], format='%d/%m/%Y')
    # Agrupa por fecha y suma las cantidades para cada fecha
    data_agrupada = data_sku.groupby('Fecha').agg({'Cantidad': 'sum'}).reset_index()
    data_agrupada = data_agrupada.set_index('Fecha')
    
    # Crea un rango de fechas diario completo desde la fecha de inicio hasta la fecha de fin
    rango_diario = pd.date_range(start=fecha_inicio, end=fecha_fin, freq='D')
    
    # Reindexa el DataFrame con el rango diario completo, llenando los días sin datos con ceros
    resampled = data_agrupada.reindex(rango_diario, fill_value=0)
    
    #print(resampled)
    
    return resampled
 
    
def simulacion_monte_carlo(demandas, nivel_servicio, lead_time, num_sim):
    """
    Realiza la simulación de Monte Carlo para calcular el stock de seguridad.
    """
    demandas_y_lt_simuladas = []
    for _ in range(num_sim):
        demandas_rand = np.random.choice(demandas, lead_time, replace=True)
        total_demandas_en_lt = np.sum(demandas_rand)
        demandas_y_lt_simuladas.append(total_demandas_en_lt)
    
    nivel_servicio_stock = np.percentile(demandas_y_lt_simuladas, nivel_servicio * 100)
    demnda_lead_time_avg = np.mean(demandas) * lead_time
    safety_stock = nivel_servicio_stock - demnda_lead_time_avg
    
    return demnda_lead_time_avg, nivel_servicio_stock, safety_stock


# Función principal que combina todas las anteriores
def calcular_demanda_y_simulacion_diaria(coleccion, sku, nivel_servicio, lead_time, num_sim, fecha_inicio, fecha_fin):
    data_sku = cargar_datos(coleccion, sku, fecha_inicio, fecha_fin)
    demanda_semanal = generar_demanda_diaria(data_sku, fecha_inicio, fecha_fin)
    demandas = demanda_semanal['Cantidad'].tolist()
    
    promedio_demanda, nivel_servicio_stock, safety_stock = simulacion_monte_carlo(demandas, nivel_servicio, lead_time, num_sim)
    
    #print(f"Average Lead Time Demand: {promedio_demanda}")
    #print(f"Service Level Stock: {nivel_servicio_stock}")
    #print(f"Safety Stock: {safety_stock}")
    
    return safety_stock


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

sku = 'A00332@FARMACIA'
nivel_servicio = 0.99
num_sim = 10000
lead_time = 5
fecha_inicio = fecha_inicio_horizonte.strftime('%d/%m/%Y')
fecha_fin = fecha_fin_horizonte.strftime('%d/%m/%Y')