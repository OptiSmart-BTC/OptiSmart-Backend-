from datetime import timedelta
import pandas as pd
import numpy as np
import scipy.stats
from fitter import Fitter, get_common_distributions
import logging
import pymongo
import sys

def cargar_datos(coleccion, sku, fecha_inicio, fecha_fin):
    """
    Carga los datos desde un archivo CSV y prepara el DataFrame para un SKU específico.
    """
    data = pd.DataFrame(list(coleccion.find()))
    data['SKU'] = data['Producto'] + '@' + data['Ubicacion']
    data['Fecha'] = pd.to_datetime(data['Fecha'], format='%d/%m/%Y')
    mask = (data['SKU'] == sku) & (data['Fecha'] >= fecha_inicio) & (data['Fecha'] <= fecha_fin)
    data_sku = data.loc[mask]
    data_sku = data_sku.set_index('Fecha')
    data_semanal = pd.DataFrame(data_sku['Cantidad'].resample('W').sum())

    # Crea un rango de fechas semanal desde la fecha de inicio hasta la fecha de fin
    rango_semanal = pd.date_range(start=fecha_inicio, end=fecha_fin, freq='W')

    # Reindexa para incluir todas las semanas en el rango, incluso aquellas con 0 demanda
    data_semanal = data_semanal.reindex(rango_semanal, fill_value=0)
    
    return data_semanal

def ajustar_distribucion(data):
    """
    Ajusta múltiples distribuciones a los datos y encuentra la mejor según el error cuadrático.
    """
    logging.getLogger('fitter').setLevel(logging.WARNING)
    
    distribuciones = [
        'norm', 'expon', 'lognorm', 'gamma', 'beta', 
        'weibull_max', 'cauchy', 'chi2', 
        'exponpow', 'poisson', 'rayleigh', 'binom', 'nbinom'
    ]

    # Usar show_warnings=False para suprimir advertencias
    f = Fitter(data, distributions=distribuciones, timeout=120)
    f.fit()
    best_fit_name = list(f.get_best(method='sumsquare_error').keys())[0]
    best_dist = getattr(scipy.stats, best_fit_name)
    params = f.fitted_param[best_fit_name]
    return best_fit_name, best_dist, params

def simulacion_monte_carlo(best_dist, params, num_sim, lead_time, nivel_servicio):
    """
    Realiza la simulación de Monte Carlo utilizando la distribución ajustada.
    """
    demandas_y_lt_simuladas = []
    for _ in range(num_sim):
        if hasattr(best_dist, "rvs"):  # Verifica si best_dist tiene el método rvs
            demandas_rand = best_dist.rvs(*params, size=lead_time)
        else:  # Caso alternativo, si se requiere
            demandas_rand = np.random.normal(loc=params[-2], scale=params[-1], size=lead_time)
        total_demandas_en_lt = np.sum(demandas_rand)
        demandas_y_lt_simuladas.append(total_demandas_en_lt)
        
    nivel_servicio_stock = np.percentile(demandas_y_lt_simuladas, 100 * nivel_servicio)
    demnda_lead_time_avg = np.mean(demandas_y_lt_simuladas)
    safety_stock = nivel_servicio_stock - demnda_lead_time_avg
    return demnda_lead_time_avg, nivel_servicio_stock, safety_stock

def calcular_demanda_y_simulacion_modelo(coleccion, sku, nivel_servicio, lead_time, num_sim, fecha_inicio, fecha_fin):
    """
    Función principal que orquesta la carga de datos, el ajuste de distribuciones y la simulación de Monte Carlo.
    """
    data_semanal = cargar_datos(coleccion, sku, fecha_inicio, fecha_fin)
    best_fit_name, best_dist, params = ajustar_distribucion(data_semanal["Cantidad"])
    
    demnda_lead_time_avg, nivel_servicio_stock, safety_stock = simulacion_monte_carlo(best_dist, params, num_sim, lead_time, nivel_servicio)
    
    return safety_stock, best_fit_name

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

sku = 'A00264@FARMACIA'
nivel_servicio = 0.99
num_sim = 10000
fecha_inicio = fecha_inicio_horizonte.strftime('%d/%m/%Y')
fecha_fin = fecha_fin_horizonte.strftime('%d/%m/%Y')
lead_time = 1

