import pandas as pd
import matplotlib.pyplot as plt
import pymongo
import sys
from scipy.stats import shapiro, skew, kurtosis


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

# Cargando los datos desde la colección de MongoDB
data = pd.DataFrame(list(coleccion.find()))

data['SKU'] = data['SKU'] + '@' + data['Ubicacion']

# Convertir la columna 'Fecha' a datetime y establecerla como índice
data['Fecha'] = pd.to_datetime(data['Fecha'], format='%d/%m/%Y')
data = data.set_index('Fecha')

# Variables globales para el análisis
count_total = 0
count_normal = 0
count_no_suficiente = 0

def generar_normalidad_semanal(df):
    global count_normal, count_no_suficiente, count_total
    count_show = 0

    # Obtener una lista de todos los SKUs únicos
    skus_unicos = df['SKU'].unique()

    for sku in skus_unicos:
        # Filtrar los datos para el SKU actual
        df_sku = df[df['SKU'] == sku]

        # Agrupar por semana y sumar los valores de 'Cantidad'
        df_sku_semanal = pd.DataFrame(df_sku['Cantidad'].resample('W').sum())
        df_sku_semanal['SKU'] = sku  # Agregar columna SKU

        count_total += 1

        # Si hay menos de 3 datos semanalmente, saltar al siguiente SKU
        if len(df_sku_semanal) < 3:
            count_no_suficiente += 1
            continue

        # Calcular la prueba de Shapiro-Wilk para la demanda semanal
        stat, p_valor = shapiro(df_sku_semanal['Cantidad'])

        # Calcular simetría y curtosis
        simetria = skew(df_sku_semanal['Cantidad'])
        curtosis = kurtosis(df_sku_semanal['Cantidad'])

        # Verificar normalidad
        if p_valor > 0.05:
            count_normal += 1
            es_normal = True
        else:
            es_normal = False

        # Mostrar el histograma
        if sku == '????':
            print(f"SKU: {sku}")
            # imprimir demandas
            print(df_sku_semanal['Cantidad'])
            
            plt.figure(figsize=(10, 6))
            plt.hist(df_sku_semanal['Cantidad'], bins=20, alpha=0.7, label=f'Demanda semanal de {sku}')
            plt.title(f'Distribución de la demanda semanal para el SKU {sku}\nNormalidad: {es_normal}, p-valor: {p_valor:.2f}, Simetría: {simetria:.2f}, Curtosis: {curtosis:.2f}')
            plt.xlabel('Cantidad')
            plt.ylabel('Frecuencia')
            plt.legend()
            plt.show()
            count_show += 1
            plt.close()

# Ejecutar la función con el DataFrame completo
generar_normalidad_semanal(data)
