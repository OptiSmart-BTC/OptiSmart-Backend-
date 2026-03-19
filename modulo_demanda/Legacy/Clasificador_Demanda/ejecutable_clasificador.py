import sys
import pandas as pd
import numpy as np
import json
from pymongo import MongoClient
from datetime import datetime

def calculate_sbc_metrics(series):
    """
    Calcula ADI y CV² para una serie temporal

    Args:
        series: Serie temporal de valores de demanda

    Returns:
        dict: Diccionario con ADI y CV²
    """
    # Filtrar solo los periodos con demanda positiva
    positive_demand = series[series > 0]

    if len(positive_demand) <= 1:
        return {'ADI': np.nan, 'CV2': np.nan}

    # Calcular ADI (Average Demand Interval)
    # ADI = Número total de periodos / Número de periodos con demanda positiva
    adi = len(series) / len(positive_demand)

    # Calcular CV² (Coeficiente de Variación al Cuadrado)
    # CV² = (Desviación estándar de demanda / Media de demanda)²
    cv2 = (np.std(positive_demand) / np.mean(positive_demand)) ** 2

    return {'ADI': adi, 'CV2': cv2}

def classify_sbc(adi, cv2):
    """
    Clasifica la serie temporal según los criterios de SBC

    Args:
        adi: Average Demand Interval
        cv2: Coeficiente de Variación al Cuadrado

    Returns:
        str: Categoría de la serie temporal
    """
    # Umbrales estándar (pueden ajustarse según la industria)
    adi_threshold = 1.32  # Umbral para ADI
    cv2_threshold = 0.49  # Umbral para CV²

    if adi < adi_threshold:
        if cv2 < cv2_threshold:
            return 'Suave'
        else:
            return 'Errática'
    else:
        if cv2 < cv2_threshold:
            return 'Intermitente'
        else:
            return 'Lumpy/Irregular'

def analyze_demand_patterns(df):
    """
    Analiza patrones de demanda para cada combinación única de producto-canal-ubicación

    Args:
        df: DataFrame con columnas 'Producto', 'Canal', 'Ubicacion', 'Fecha', 'Cantidad'

    Returns:
        DataFrame: DataFrame con los resultados de la clasificación
    """
    # Asegurar que 'Fecha' sea de tipo datetime
    df['Fecha'] = pd.to_datetime(df['Fecha'])

    # Crear una columna de clave única para identificar cada serie temporal
    df['series_key'] = df['Producto'] + '_' + df['Canal'] + '_' + df['Ubicacion']

    # Crear un DataFrame vacío para almacenar los resultados
    results = []

    # Obtener todas las series temporales únicas
    unique_series = df['series_key'].unique()
    
    print(f"Analizando {len(unique_series)} series temporales únicas...")

    # Analizar cada serie temporal
    for series_key in unique_series:
        # Filtrar datos para esta serie temporal
        series_data = df[df['series_key'] == series_key].sort_values('Fecha')

        # Verificar si hay suficientes datos
        if len(series_data) < 4:  # Necesitamos al menos 4 puntos para un análisis significativo
            continue

        # Calcular el intervalo promedio de fechas
        date_diffs = series_data['Fecha'].diff().dropna()
        avg_interval = date_diffs.mean().days

        # Reindexar la serie para tener todas las fechas en el rango (rellenar con ceros)
        min_date = series_data['Fecha'].min()
        max_date = series_data['Fecha'].max()

        # Crear un índice de fecha completo
        if avg_interval < 1:
            avg_interval = 7  # Usar semanal como predeterminado si no está claro

        full_date_range = pd.date_range(start=min_date, end=max_date, freq=f'{avg_interval}D')

        # Crear una serie temporal completa con ceros para fechas faltantes
        complete_series = series_data.set_index('Fecha').reindex(full_date_range, fill_value=0)['Cantidad']

        # Calcular métricas SBC
        metrics = calculate_sbc_metrics(complete_series)

        # Clasificar según SBC
        category = classify_sbc(metrics['ADI'], metrics['CV2'])

        # Obtener el primer registro para esta serie para extraer información
        first_record = series_data.iloc[0]

        # Añadir a los resultados
        results.append({
            'Producto': first_record['Producto'],
            'Canal': first_record['Canal'],
            'Ubicacion': first_record['Ubicacion'],
            'ADI': metrics['ADI'],
            'CV2': metrics['CV2'],
            'Category': category,
            'Data_Points': len(series_data),
            'fecha_clasificacion': datetime.now()
        })

    # Convertir resultados a DataFrame
    results_df = pd.DataFrame(results)

    return results_df

def get_model_recommendations(category):
    """
    Devuelve las recomendaciones de modelos según la categoría de demanda
    
    Args:
        category: Categoría de la demanda
        
    Returns:
        list: Lista de modelos recomendados
    """
    recommendations = {
        'Suave': ['Promedio Móvil', 'Suavizado Exponencial', 'ARIMA'],
        'Errática': ['Croston', 'SBA (Syntetos-Boylan Approximation)'],
        'Intermitente': ['Croston', 'TSB (Teunter-Syntetos-Babai)'],
        'Lumpy/Irregular': ['Croston modificado', 'Bootstrap']
    }
    
    return recommendations.get(category, [])

def main():
    """
    Función principal que ejecuta el proceso de clasificación
    """
    if len(sys.argv) < 5:
        print("Error: Faltan argumentos.")
        print("Uso: python clasificacion_demanda.py <dbName> <userCollection> <resultCollection> <mongoUrl>")
        sys.exit(1)

    # Obtener argumentos
    db_name = sys.argv[1]
    user_collection = sys.argv[2]
    result_collection = sys.argv[3]
    mongo_url = sys.argv[4]

    try:
        # Conectar a MongoDB
        print(f"Conectando a MongoDB en {db_name}...")
        client = MongoClient(mongo_url)
        db = client[db_name]
        
        # Obtener los datos de demanda
        print(f"Cargando datos desde la colección {user_collection}...")
        data = list(db[user_collection].find({}))
        
        if not data:
            print("No se encontraron datos en la colección.")
            sys.exit(1)
            
        # Convertir a DataFrame
        df = pd.DataFrame(data)
        
        # Mostrar información del dataset
        print("\nInformación del dataset:")
        print(f"Número de registros: {len(df)}")
        print(f"Columnas: {', '.join(df.columns)}")
        
        # Asegurarse de que las columnas necesarias existen
        required_columns = ['Producto', 'Canal', 'Ubicacion', 'Fecha', 'Cantidad']
        for col in required_columns:
            if col not in df.columns:
                print(f"Error: Columna '{col}' no encontrada en los datos.")
                sys.exit(1)
        
        # Analizar patrones de demanda
        print("\nAnalizando patrones de demanda...")
        categorized_df = analyze_demand_patterns(df)
        
        # Añadir recomendaciones de modelos a los resultados
        categorized_df['recommended_models'] = categorized_df['Category'].apply(get_model_recommendations)
        
        # Mostrar resumen de resultados
        print("\nResumen de clasificación:")
        category_summary = categorized_df['Category'].value_counts().to_dict()
        for category, count in category_summary.items():
            print(f"{category}: {count}")
            
        # Añadir metadatos del proceso
        metadata = {
            'processed_records': len(df),
            'classified_series': len(categorized_df),
            'summary': category_summary,
            'process_date': datetime.now()
        }

        # Eliminar los metadatos de corridas anteriores
        db["clasificacion_demanda_metadata"].delete_many({})
        
        # Guardar metadatos del proceso
        db["clasificacion_demanda_metadata"].insert_one(metadata)
        print("Metadatos del proceso guardados en 'clasificacion_demanda_metadata")
        
        # Convertir DataFrame a lista de diccionarios para MongoDB
        # Convertir NaN a None para que MongoDB los maneje correctamente
        results_to_insert = json.loads(categorized_df.to_json(orient='records', date_format='iso'))

        # Guardar resultados en MongoDB
        print(f"\nGuardando {len(results_to_insert)} resultados en la colección {result_collection}...")
        
        #Elimina los registros o resultados de la corrida anterior
        db[result_collection].delete_many({})
        
        db[result_collection].insert_many(results_to_insert)
        
        print("Proceso de clasificación completado exitosamente.")
        
    except Exception as e:
        print(f"Error en el proceso: {str(e)}")
        sys.exit(1)
    finally:
        if 'client' in locals():
            client.close()

if __name__ == "__main__":
    main()