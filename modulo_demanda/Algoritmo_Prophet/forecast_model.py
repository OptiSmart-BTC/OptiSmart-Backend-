from prophet import Prophet
from prophet.diagnostics import cross_validation, performance_metrics
import pandas as pd
import numpy as np

# Configura la estacionalidad del modelo Prophet
def prophet_configuration():
    model = Prophet(weekly_seasonality=True, yearly_seasonality=True, daily_seasonality=False)
    model.add_seasonality(name='monthly', period=30.5, fourier_order=5)
    return model

# Función para preparar los datos de Prophet
def data_preparation_prophet(filtered_df):
    df_prophet = filtered_df[['Fecha', 'Cantidad']].rename(columns={'Fecha': 'ds', 'Cantidad': 'y'})
    return df_prophet

# Función para realizar validación cruzada y calcular métricas de rendimiento
def realizar_validacion_cruzada(model, initial, period, horizon):
    df_cv = cross_validation(model, initial=initial, period=period, horizon=horizon)
    df_p = performance_metrics(df_cv)
    return df_cv, df_p

def make_forecast(model, df_prophet, periodo_a_predecir = 52):

    """Función para usar el modelo Prophet y que empieze a realizar las predicciones a futuro
    , indicando el horizonte por el ususario.
    
    Parametros:
    - Modelo entrenado
    - Horizonte de prediccion
    
    Salida:
    - El forecast de la determinada jerarquía"""
    future = model.make_future_dataframe(periods=periodo_a_predecir, freq = 'W-MON')
    forecast = model.predict(future)
    return forecast

# Función para unir las predicciones con la demanda real
def join_predictions(df_prophet, forecast):
    df_merged = df_prophet.set_index('ds').join(forecast.set_index('ds')[['yhat']], how='outer')
    return df_merged

def calculate_metrics(df_merged):
    """En esta función nos centramos en unir los datos reales y los predichos por Prophet
    , así creamos una nueva columna llamada MAPE para la comparación de error por cada registro
    y también creamos otra tabla con las combinaciones y vendrá su WMAPE y SMAPE, esto para que se vea
    que combinaciones son las que tienen mejores predicciones.
    
    Parametros:
    - Datframe de la demanda historica
    - Forecast de la combniación
    
    Salida:
    - df_merged que es un dataframe donde se unen los datos historicos y el forecast
    - wmape porcentual por combinación
    - smape porcentual por combinación"""

    df_merged['MAPE'] = np.abs(df_merged['y'] - df_merged['yhat']) / df_merged['y'] * 100

    # Calcular WMAPE
    wmape = np.sum(np.abs(df_merged['y'] - df_merged['yhat'])) / np.sum(df_merged['y'])
    wmape_percentage = wmape * 100

    # Calcular SMAPE
    smape = np.mean(2 * np.abs(df_merged['y'] - df_merged['yhat']) / (np.abs(df_merged['y']) + np.abs(df_merged['yhat'])))
    smape_percentage = smape * 100

    return wmape_percentage, smape_percentage, df_merged
