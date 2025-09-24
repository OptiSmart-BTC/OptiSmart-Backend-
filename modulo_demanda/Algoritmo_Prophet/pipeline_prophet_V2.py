from data_cleaning_V2 import load_and_clean_data, completar_fechas, resample_if_not_weekly
from generador_combinaciones import generate_combinations
from valid_combinations import obtener_combinaciones_validas
from forecast_model_V2 import (
    prophet_configuration,
    data_preparation_prophet,
    realizar_validacion_cruzada_segura,
    make_forecast,
    join_predictions,
    calculate_metrics,
    tune_hyperparams,
)
import sys
import pandas as pd
import os
import datetime
import logging

# ---------------------------------------------------------------------
# Utilidad de diagnóstico (opcional): ver frecuencia y % de ceros
# después del resampleo efectivo (MS o W-MON), por combinación
# ---------------------------------------------------------------------
def _debug_zeros_por_combinacion(df_resampleado, min_registros, max_porcentaje_ceros):
    """
    df_resampleado: DataFrame ya resampleado a la frecuencia efectiva (MS o W-MON).
    Imprime, por combinación (Producto, Canal, Ubicacion):
      - n_registros
      - % ceros
      - pasa_filtro (sí/no) según tus umbrales
    """
    try:
        # Asegúrate de que existan columnas esperadas
        req_cols = {'Producto', 'Canal', 'Ubicacion', 'Cantidad', 'Fecha'}
        if not req_cols.issubset(set(df_resampleado.columns)):
            print("[DEBUG-ZEROS] Columns missing in df_resampleado. Found:", df_resampleado.columns.tolist())
            return

        # Agrupación por combinación
        combos = df_resampleado.groupby(['Producto', 'Canal', 'Ubicacion'], dropna=False)

        print("\n[DEBUG-ZEROS] ---- Diagnóstico por combinación (post-resample) ----")
        for (prod, canal, ubic), g in combos:
            n = len(g)
            if n == 0:
                continue
            pct_zeros = (g['Cantidad'] == 0).mean()
            pasa = (n >= min_registros) and (pct_zeros <= max_porcentaje_ceros) and (g.isnull().sum().sum() == 0)
            print(f"  • {prod} | {canal} | {ubic} -> n={n}, %ceros={pct_zeros:.2%}, pasa_filtro={pasa}")
        print("[DEBUG-ZEROS] ------------------------------------------------------\n")
    except Exception as e:
        print("[DEBUG-ZEROS] Error:", e)

def ejecutar_pipeline(df_historico, min_registros, max_porcentaje_ceros, periodo_a_predecir, imprimir_debug_zeros=True):
    """
    Pipeline maestro para entrenar/validar/predicir por combinación.
    - Respeta frecuencia mensual si la serie original es mensual (MS),
      preservada por data_cleaning_V2.resample_if_not_weekly.
    - Para otras series, trabaja en semanal (W-MON).
    - Aplica filtros de combinaciones válidas (min_registros, %ceros, nulos).
    - Ajusta hiperparámetros con Optuna, entrena Prophet y produce métricas.
    
    Params:
      df_historico: DataFrame crudo desde Mongo (con columnas: Producto, Canal, Ubicacion, Fecha, Cantidad)
      min_registros: umbral de observaciones mínimas
      max_porcentaje_ceros: umbral máximo de ceros (ej. 0.1 para 10%)
      periodo_a_predecir: horizonte futuro en pasos de la frecuencia efectiva
      imprimir_debug_zeros: si True, imprime diagnóstico de %ceros por combinación

    Returns:
      df_futuros: futuro listo para Mongo (Producto,Canal,Ubicacion,Fecha,Demanda Predicha,forecast_date)
      df_metric: métricas por combinación (WMAPE, SMAPE)
    """

    # Silenciar cmdstanpy
    logger = logging.getLogger('cmdstanpy')
    logger.addHandler(logging.NullHandler())
    logger.propagate = False
    logger.setLevel(logging.CRITICAL)

    resultados_forecast = []
    metricas_combinaciones = []
    datos_futuros_mongo = []  # Almacén específico para datos futuros

    forecast_date = datetime.datetime.now().replace(microsecond=0).isoformat()

    # 1) Carga + limpieza + inferencia de freq global
    df, _freq_inicial = load_and_clean_data(df_historico)
    # print(f"[PIPE] Frecuencia inferida inicial (global): {_freq_inicial}")

    # 2) Resampleo condicional:
    #    - Mantiene MS si la serie es mensual,
    #    - Devuelve W-MON si la serie es semanal,
    #    - Caso contrario fuerza a W-MON por default.
    df, freq = resample_if_not_weekly(df, target_freq='W-MON')
    print(f"[PIPE] Frecuencia efectiva para el modelado: {freq}")

    # 3) Rango de fechas con la freq efectiva
    rango_fechas = pd.date_range(df['Fecha'].min(), df['Fecha'].max(), freq=freq)

    # 4) Combinaciones de jerarquías
    df_combinaciones = generate_combinations(df)

    # (Opcional) Diagnóstico de ceros antes del filtro final
    if imprimir_debug_zeros:
        _debug_zeros_por_combinacion(df, min_registros, max_porcentaje_ceros)

    # 5) Filtrado de combinaciones válidas (usa df con frecuencia ya resampleada)
    combinaciones_validas = obtener_combinaciones_validas(df_combinaciones, df, min_registros, max_porcentaje_ceros)

    # 6) Entrenar + predecir por cada combinación válida
    for Producto, Canal, Ubicacion in combinaciones_validas:
        # 6.1 Filtrar la combinación
        filtered_df = df[
            (df['Producto'] == Producto) &
            (df['Canal'] == Canal) &
            (df['Ubicacion'] == Ubicacion)
        ][['Fecha', 'Cantidad']].sort_values('Fecha')

        # 6.2 Completar fechas faltantes al rango con freq efectiva
        filtered_df = completar_fechas(filtered_df, rango_fechas)

        # 6.3 Preparación para Prophet
        df_prophet = data_preparation_prophet(filtered_df)
        # print(f"[PIPE] df_prophet head para {Producto}-{Canal}-{Ubicacion}:\n{df_prophet.head()}")

        # 6.4 Tuning hiperparámetros
        best = tune_hyperparams(df_prophet, freq, periodo_a_predecir, n_trials=3)

        # 6.5 Configurar + entrenar
        model = prophet_configuration(
            freq=freq,
            n_changepoints=best['n_changepoints'],
            changepoint_prior_scale=best['changepoint_prior_scale'],
            seasonality_prior_scale=best['seasonality_prior_scale']
            )
        model.fit(df_prophet)

        # 6.6 Validación cruzada segura
        df_cv, df_p = realizar_validacion_cruzada_segura(model, df_prophet, freq)
        print(f"[PIPE] Rendimiento {Producto}-{Canal}-{Ubicacion}:")
        if not df_p.empty:
            print(df_p.head())
        if not df_cv.empty:
            print(df_cv.head())

        # 6.7 Forecast futuro con freq efectiva (MS o W-MON)
        forecast = make_forecast(model, periodo_a_predecir, freq)
        forecast['forecast_date'] = forecast_date

        # 6.8 Extraer solo horizonte futuro
        #     Nota: df_prophet['ds'] llega hasta max de rango_fechas
        #           filtered_df['Fecha'].max() es consistente con esa frontera
        futuro = forecast[forecast['ds'] > filtered_df['Fecha'].max()].copy()

        # Formatear columnas para Mongo
        futuro = futuro.rename(columns={'ds': 'Fecha', 'yhat': 'Demanda Predicha'})
        futuro['Producto'] = Producto
        futuro['Canal'] = Canal
        futuro['Ubicacion'] = Ubicacion
        futuro = futuro[['Producto', 'Canal', 'Ubicacion', 'Fecha', 'Demanda Predicha', 'forecast_date']]
        datos_futuros_mongo.append(futuro)

        # 6.9 Unir predicciones con reales (para métricas)
        df_merged = join_predictions(df_prophet, forecast)

        # 6.10 Métricas por combinación
        wmape_percentage, smape_percentage, df_merged_con_mape = calculate_metrics(df_merged)
        metricas_combinaciones.append({
            'Producto': Producto,
            'Canal': Canal,
            'Ubicacion': Ubicacion,
            'WMAPE': wmape_percentage,
            'SMAPE': smape_percentage
        })

        # 6.11 Guardar resultados completos (opcional, útil para gráficas)
        df_red = (
            df_merged
            .reset_index()[['ds', 'y', 'yhat', 'MAPE']]
            .rename(columns={'ds': 'Fecha', 'y': 'Demanda Real', 'yhat': 'Demanda Predicha'})
        )
        df_red['Producto'] = Producto
        df_red['Canal'] = Canal
        df_red['Ubicacion'] = Ubicacion
        resultados_forecast.append(df_red)

    # 7) Concatenar outputs
    df_todos = pd.concat(resultados_forecast, ignore_index=True) if resultados_forecast else pd.DataFrame()
    df_futuros = pd.concat(datos_futuros_mongo, ignore_index=True) if datos_futuros_mongo else pd.DataFrame()
    df_metric = pd.DataFrame(metricas_combinaciones)

    # Prints cortos de control
    if not df_todos.empty:
        print(df_todos.head())
    if not df_futuros.empty:
        print(df_futuros.head())
    if not df_metric.empty:
        print(df_metric.head())

    return df_futuros, df_metric


