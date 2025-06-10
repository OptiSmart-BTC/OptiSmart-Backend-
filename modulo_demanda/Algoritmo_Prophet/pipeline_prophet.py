from data_cleaning import load_and_clean_data, completar_fechas, resample_if_not_weekly
from generador_combinaciones import generate_combinations
from valid_combinations import obtener_combinaciones_validas
from forecast_model import prophet_configuration, data_preparation_prophet, realizar_validacion_cruzada_segura, make_forecast,join_predictions, calculate_metrics, tune_hyperparams
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
    df, freq = load_and_clean_data(df_historico)

    # 2. Si el df no es semanal, lo convertimos a frecuencia W-MON
    df, freq = resample_if_not_weekly(df, target_freq='W-MON')

    # 3. Generamos el rango de fechas dinamico
    rango_fechas = pd.date_range(df['Fecha'].min(),
                                 df['Fecha'].max(),
                                 freq=freq)

    # 4. Generamos las combinaciones de las jerarquías
    df_combinaciones = generate_combinations(df)

    # 5. Obtener las combinaciones validas con nuestro filtro
    combinaciones_validas = obtener_combinaciones_validas(df_combinaciones, df, min_registros, max_porcentaje_ceros)

    # 6. Entrenar y predecir por cada combinacion valida
    for Producto, Canal, Ubicacion in combinaciones_validas:
        # 6.1 Filtramos
        filtered_df = df[(df['Producto'] == Producto) &
                         (df['Canal'] == Canal) &
                         (df['Ubicacion'] == Ubicacion)]
        
        # 6.2 Completar las fechas faltantes
        filtered_df = completar_fechas(filtered_df, rango_fechas)
        
        # 6.3 Preparamos los datos para Prophet
        df_prophet = data_preparation_prophet(filtered_df)
        print(f"Contenido de df_prophet antes de model.fit:\n{df_prophet}")

        # 6.4 Calcular changepoints antes
        best = tune_hyperparams(df_prophet, freq, periodo_a_predecir, n_trials=10)

        # 6.5 Configurar y entrenar el modelo
        model = prophet_configuration(
            n_changepoints=best['n_changepoints'],
            changepoint_prior_scale=best['changepoint_prior_scale'],
            seasonality_prior_scale=best['seasonality_prior_scale']
        )
        model.fit(df_prophet)

        # Realizar validación cruzada y mostrar rendimiento
        df_cv, df_p = realizar_validacion_cruzada_segura(model, df_prophet)
        print(f"Rendimiento para la combinación {Producto}-{Canal}-{Ubicacion}:", flush=True)
        print(df_p.head())
        print(df_cv.head())

        # 6.6 Se realiza el forecast a futuro dictado por el usuario
        forecast = make_forecast(model, periodo_a_predecir, freq)
        forecast['forecast_date'] = forecast_date

        # 6.7 Extraer solo el horizonte futuro
        futuro = forecast[forecast['ds'] > filtered_df['Fecha'].max()]

        # Formatear columnas para MongoDB
        futuro = futuro.rename(columns={'ds': 'Fecha', 'yhat': 'Demanda Predicha'})
        futuro['Producto'] = Producto
        futuro['Canal'] = Canal
        futuro['Ubicacion'] = Ubicacion

        # Seleccionar solo las columnas relevantes
        futuro = futuro[['Producto', 'Canal', 'Ubicacion', 'Fecha', 'Demanda Predicha', 'forecast_date']]

        # Agregar los datos futuros al almacén para MongoDB
        datos_futuros_mongo.append(futuro)

        # 6.8 Unimos las predicciones con la demanda real
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

        # 6.9) Guardar resultados completos
        df_red = (
            df_merged
            .reset_index()[['ds','y','yhat','MAPE']]
            .rename(columns={'ds':'Fecha','y':'Demanda Real','yhat':'Demanda Predicha'})
        )
        df_red['Producto']=Producto; df_red['Canal']=Canal; df_red['Ubicacion']=Ubicacion
        resultados_forecast.append(df_red)

    # 7) Concatenar todo
    df_todos = pd.concat(resultados_forecast, ignore_index=True)
    df_futuros = pd.concat(datos_futuros_mongo, ignore_index=True)
    df_metric = pd.DataFrame(metricas_combinaciones)

    print(df_todos.head())
    print(df_futuros)
    print(df_metric.head())

    
    
    return df_futuros, df_metric



