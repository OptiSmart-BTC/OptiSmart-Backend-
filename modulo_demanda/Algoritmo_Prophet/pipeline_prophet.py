from data_cleaning import load_and_clean_data, completar_fechas
from generador_combinaciones import generate_combinations
from valid_combinations import obtener_combinaciones_validas
from forecast_model import prophet_configuration, data_preparation_prophet, realizar_validacion_cruzada, make_forecast,join_predictions, calculate_metrics
import sys
import pandas as pd
import os
import datetime
import logging


def ejecutar_pipeline(df_historico, min_registros, max_porcentaje_ceros, periodo_a_predecir):

    """Esta función ejecutar pipeline es la linea de procesos para realizar las predicciones de 
    todas las combinaciones y tener los resultados en el formato esperado
    
    Parametros:
    - Lectura del archivo de datos y su limpieza
    - Minimo de registros necesarios
    - Máximo porcentaje de ceros
    - Horizonte definido por el usuario
    
    Salida:
    - Dataframe de todos los forecast ordenados por combinación
    - Dataframe de métricas para ver rapidamente las combinaciones con mejores resultados"""

    # Configurar el logger para cmdstanpy
    logger = logging.getLogger('cmdstanpy')
    logger.addHandler(logging.NullHandler())
    logger.propagate = False
    logger.setLevel(logging.CRITICAL)

    
    resultados_forecast = []
    metricas_combinaciones = []
    datos_futuros_mongo = []  # Almacén específico para datos futuros

    forecast_date = datetime.datetime.now().replace(microsecond=0).isoformat()

    # 1. Cargamos y limpiamos el formato de los datos
    df, rango_fechas = load_and_clean_data(df_historico)

    # 2. Generamos las combinaciones de las jerarquías
    df_combinaciones = generate_combinations(df)

    # 3. Obtener las combinaciones validas con nuestro filtro
    combinaciones_validas = obtener_combinaciones_validas(df_combinaciones, df, min_registros, max_porcentaje_ceros)

    # 4. Entrenar y predecir por cada combinacion valida
    for Producto, Canal, Ubicacion in combinaciones_validas:
        filtered_df = df[(df['Producto'] == Producto) &
                         (df['Canal'] == Canal) &
                         (df['Ubicacion'] == Ubicacion)]
        
        # Completar las fechas faltantes
        filtered_df = completar_fechas(filtered_df, rango_fechas)
        
        # Preparamos los datos para Prophet
        df_prophet = data_preparation_prophet(filtered_df)

        print(f"Contenido de df_prophet antes de model.fit:\n{df_prophet}")

        # Configurar y entrenar el modelo
        model = prophet_configuration()
        model.fit(df_prophet)

        # Realizar validación cruzada y mostrar rendimiento
        df_cv, df_p = realizar_validacion_cruzada(model, initial, period, horizon)
        print(f"Rendimiento para la combinación {Producto}-{Canal}-{Ubicacion}:", flush=True)
        print(df_p.head())

        # Se realiza el forecast a futuro dictado por el usuario
        forecast = make_forecast(model, df_prophet, periodo_a_predecir)

        # Añadir columna forecast_date que es la fecha actual en la que se corrío el proceso.
        forecast['forecast_date'] = forecast_date

        # Filtrar las predicciones a futuro
        forecast_futuro = forecast[forecast['ds'] > filtered_df['Fecha'].max()]

        # Formatear columnas para MongoDB
        forecast_futuro = forecast_futuro.rename(columns={'ds': 'Fecha', 'yhat': 'Demanda Predicha'})
        forecast_futuro['Producto'] = Producto
        forecast_futuro['Canal'] = Canal
        forecast_futuro['Ubicacion'] = Ubicacion

        # Seleccionar solo las columnas relevantes
        forecast_futuro = forecast_futuro[['Producto', 'Canal', 'Ubicacion', 'Fecha', 'Demanda Predicha', 'forecast_date']]

        # Agregar los datos futuros al almacén para MongoDB
        datos_futuros_mongo.append(forecast_futuro)

        # Unimos las predicciones con la demanda real
        df_merged = join_predictions(df_prophet, forecast)

        # 5. Calculo de las métricas y guardado de resultados
        wmape_percentage, smape_percentage, df_merged_con_mape = calculate_metrics(df_merged)

        # Guardar métricas de la combinación actual
        metricas_combinaciones.append({
            'Producto': Producto,
            'Canal': Canal,
            'Ubicacion': Ubicacion,
            'WMAPE': wmape_percentage,
            'SMAPE': smape_percentage
        })

        # Agregar las columnas de identificación al forecast y seleccionar solo las columnas deseadas
        forecast['Producto'] = Producto
        forecast['Canal'] = Canal
        forecast['Ubicacion'] = Ubicacion
        
        # Seleccionar y renombrar las columnas necesarias
        df_forecast_reducido = df_merged_con_mape.reset_index()[['ds', 'y', 'yhat', 'MAPE']]
        df_forecast_reducido.rename(columns={'ds': 'Fecha', 'y': 'Demanda Real', 'yhat': 'Demanda Predicha'}, inplace=True)
        df_forecast_reducido['Producto'] = Producto
        df_forecast_reducido['Canal'] = Canal
        df_forecast_reducido['Ubicacion'] = Ubicacion

        resultados_forecast.append(df_forecast_reducido)

    # Concatenar todos los resultados de forecast en un solo DataFrame
    df_todos_forecast = pd.concat(resultados_forecast, ignore_index=True)

    # Consolidar datos futuros para MongoDB
    datos_futuros_mongo_df = pd.concat(datos_futuros_mongo, ignore_index=True)

    # Convertir las métricas en un DataFrame
    df_metricas = pd.DataFrame(metricas_combinaciones)

    print(df_todos_forecast.head())
    print(df_metricas.head())

    
    
    return datos_futuros_mongo_df, df_metricas

initial = '366 days'
period = '183 days'
horizon = '91 days'


