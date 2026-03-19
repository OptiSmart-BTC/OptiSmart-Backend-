from prophet import Prophet
from prophet.diagnostics import cross_validation, performance_metrics
import pandas as pd
import numpy as np
import optuna

# Configura la estacionalidad del modelo Prophet
def prophet_configuration(
    n_changepoints,
    changepoint_prior_scale=0.05,
    seasonality_prior_scale=10.0
):
    model = Prophet(
        weekly_seasonality=True,
        yearly_seasonality=True,
        daily_seasonality=False,
        n_changepoints=n_changepoints,
        changepoint_prior_scale=changepoint_prior_scale,
        seasonality_prior_scale=seasonality_prior_scale,
    )
    model.add_country_holidays(country_name='MX')
    model.add_seasonality(name='monthly',   period=30.5,  fourier_order=5)
    model.add_seasonality(name='quarterly', period=91.25, fourier_order=3)
    model.add_regressor('day_of_week')
    model.add_regressor('week_of_year')
    model.add_regressor('month')
    return model

# Función para preparar los datos de Prophet
def data_preparation_prophet(filtered_df):
    df = filtered_df[['Fecha', 'Cantidad']].rename(columns={'Fecha': 'ds', 'Cantidad': 'y'})
    # Variables de calendario
    df['day_of_week'] = df['ds'].dt.weekday      # 0=Lun … 6=Dom
    df['week_of_year'] = df['ds'].dt.isocalendar().week.astype(int)
    df['month']       = df['ds'].dt.month
    return df

def make_forecast(model, periods, freq):

    """Función para usar el modelo Prophet y que empieze a realizar las predicciones a futuro
    , indicando el horizonte por el ususario.
    
    Parametros:
    - Modelo entrenado
    - Horizonte de prediccion
    
    Salida:
    - El forecast de la determinada jerarquía"""
    future = model.make_future_dataframe(periods=periods, freq=freq)
    future['day_of_week']  = future['ds'].dt.weekday
    future['week_of_year'] = future['ds'].dt.isocalendar().week.astype(int)
    future['month']        = future['ds'].dt.month
    return model.predict(future)

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

def realizar_validacion_cruzada_segura(model, df_prophet):
    total_days = (df_prophet['ds'].max() - df_prophet['ds'].min()).days
    initial    = int(total_days * 0.6)
    period     = int(total_days * 0.2)
    horizon    = total_days - initial - period
    if horizon <= 0 or total_days < initial + horizon:
        return pd.DataFrame(), pd.DataFrame()
    init_str   = f"{initial} days"
    per_str    = f"{period} days"
    hor_str    = f"{horizon} days"
    df_cv = cross_validation(model, initial=init_str, period=per_str, horizon=hor_str)
    df_p  = performance_metrics(df_cv)
    return df_cv, df_p

def tune_hyperparams(df_prophet, freq, periodo_a_predecir, n_trials=5):
    def objective(trial):
        cps = trial.suggest_loguniform("changepoint_prior_scale", 0.001, 0.5)
        sps = trial.suggest_loguniform("seasonality_prior_scale", 0.01, 10.0)
        ncp = trial.suggest_int("n_changepoints", 5, 50)
        model = Prophet(
            weekly_seasonality=True,
            yearly_seasonality=True,
            daily_seasonality=False,
            changepoint_prior_scale=cps,
            seasonality_prior_scale=sps,
            n_changepoints=ncp
        )
        model.add_country_holidays(country_name='MX')
        model.add_seasonality(name='monthly',   period=30.5,  fourier_order=5)
        model.add_seasonality(name='quarterly', period=91.25, fourier_order=3)
        model.add_regressor('day_of_week')
        model.add_regressor('week_of_year')
        model.add_regressor('month')
        model.fit(df_prophet)
        df_cv, _ = realizar_validacion_cruzada_segura(model, df_prophet)
        if df_cv.empty:
            return float("inf")
        perf = performance_metrics(df_cv)
        return perf['rmse'].mean()
    
    study = optuna.create_study(direction="minimize")
    study.optimize(objective, n_trials=n_trials)
    return study.best_params
