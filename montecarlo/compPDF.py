from datetime import timedelta
import pandas as pd
import matplotlib.pyplot as plt
from scipy.stats import shapiro, skew, kurtosis
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
import tempfile
import os
import pymongo
import sys

# Define la ruta al archivo PDF de salida
output_file_path = "c:/Users/ADMIN/Downloads/comportamientos.pdf"

# Crea un objeto canvas para dibujar en el PDF
c = canvas.Canvas(output_file_path, pagesize=letter)
width, height = letter  # Guarda el ancho y la altura de la página para referencia

# Variables de hoja
margin = inch * 0.5
image_width = inch * 7
image_height = inch * 4.5
space_between_images = inch * 0.2

y_position = height - margin  # Inicia desde la parte superior de la página menos el margen



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



# Cargar datos
data = pd.DataFrame(list(coleccion.find()))
data['SKU'] =  data['Producto'] + '@' + data['Ubicacion']
data['Fecha'] = pd.to_datetime(data['Fecha'], format='%d/%m/%Y', dayfirst=True)
data = data.set_index('Fecha')

# Establecer fechas de inicio y fin para filtrar datos
fecha_inicio = fecha_inicio_horizonte.strftime('%d/%m/%Y')
fecha_fin = fecha_fin_horizonte.strftime('%d/%m/%Y')
rango_fechas = pd.date_range(start=fecha_inicio, end=fecha_fin, freq='D')

# Usar 'intersection' para encontrar fechas comunes entre el rango de fechas y el índice del DataFrame
fechas_comunes = data.index.intersection(rango_fechas)
data_filtrada = data.loc[fechas_comunes]

print(data_filtrada.index)

# Seleccionar 100 SKUs aleatorios (o menos si hay menos de 100)
skus_unicos = data_filtrada['SKU'].unique()
num_skus = min(len(skus_unicos), 700)
skus_aleatorios = pd.Series(skus_unicos).sample(n=num_skus, random_state=1).tolist()

def generar_plots_y_guardar_imagenes(df, skus):
    image_files = {}
    
    rango_semanal = pd.date_range(start=fecha_inicio, end=fecha_fin, freq='W')

    for sku in skus:
        df_sku = df[df['SKU'] == sku]
        df_sku_semanal = pd.DataFrame(df_sku['Cantidad'].resample('W').sum())
        
        # Reindexa el DataFrame resumido para incluir todas las semanas, llenando con ceros las semanas sin datos
        df_sku_semanal = df_sku_semanal.reindex(rango_semanal, fill_value=0)
        df_sku_semanal['SKU'] = sku


        #if len(df_sku_semanal) < 1:
        #    continue
        if df_sku_semanal.empty:
            continue

        plt.figure(figsize=(10, 6))
        plt.hist(df_sku_semanal['Cantidad'], bins=20, alpha=0.7, label=f'Demanda semanal de {sku}')
        plt.title(f'Demanda semanal para el SKU {sku}')
        plt.xlabel('Cantidad')
        plt.ylabel('Frecuencia')
        plt.legend()

        # Guardar la figura como un archivo temporal
        safe_sku = sku.replace("@", "_").replace("/", "_")
        temp_file_name = f"{safe_sku}.png"
        plt.savefig(temp_file_name)
        image_files[sku] = temp_file_name  # Almacenar la ruta de la imagen con el SKU como clave

        plt.close()

    return image_files

image_files = generar_plots_y_guardar_imagenes(data_filtrada, skus_aleatorios)

# Establece el margen superior e inicializa la posición y
top_margin = 750
y_position = top_margin

# Itera sobre el diccionario de archivos de imagen
for sku, image_path in image_files.items():
    # Si no hay suficiente espacio para la próxima imagen, crea una nueva página
    if y_position < (image_height + margin):
        c.showPage()
        y_position = height - margin

    # Dibuja el SKU
    c.drawString(margin, y_position - 12, f"SKU: {sku}")  # Ajusta según la altura de la fuente
    
    # Dibuja la imagen
    c.drawImage(image_path, margin, y_position - image_height - 12, width=image_width, height=image_height)
    
    # Actualiza y_position para la siguiente imagen
    y_position -= (image_height + space_between_images + 12)


# Guarda el PDF
c.save()

# Limpia los archivos temporales
for image_path in image_files.values():
    os.remove(image_path)


