import pandas as pd
from scipy.stats import shapiro

def cargar_datos_sku(file_path, sku, fecha_inicio, fecha_fin):
    """
    Carga y filtra los datos por SKU y rango de fechas.
    """
    data = pd.DataFrame(list(file_path.find()))
    data['SKU'] = data['Producto'] + '@' + data['Ubicacion']
    data['Fecha'] = pd.to_datetime(data['Fecha'], format='%d/%m/%Y')
    mask = (data['Fecha'] >= fecha_inicio) & (data['Fecha'] <= fecha_fin) & (data['SKU'] == sku)
    return data.loc[mask]

def evaluar_normalidad(file_path, sku, fecha_inicio, fecha_fin):
    """
    Evalúa la normalidad de la distribución de la 'Cantidad' para un SKU específico en un rango de fechas dado.
    """
    data_sku = cargar_datos_sku(file_path, sku, fecha_inicio, fecha_fin)
    if not data_sku.empty:
        if(len(data_sku['Cantidad'].dropna()) < 3):
            return None, None
        p_value = shapiro(data_sku['Cantidad'].dropna()).pvalue
        es_normal = 'Normal' if p_value > 0.05 else 'No'
    else:
        p_value = None
        es_normal = None
    
    return p_value, es_normal
