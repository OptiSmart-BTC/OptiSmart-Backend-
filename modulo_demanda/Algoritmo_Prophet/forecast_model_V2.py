from prophet import Prophet
from prophet.diagnostics import cross_validation, performance_metrics
import pandas as pd
import numpy as np
import optuna

# ---------------------------
# Utilidades por frecuencia
# ---------------------------
def _is_weekly(freq: str) -> bool:
    return isinstance(freq, str) and freq.upper().startswith("W")

def _is_monthly(freq: str) -> bool:
    return isinstance(freq, str) and (freq.upper().startswith("M") or freq.upper() == "MS")

def _days_per_step(freq: str) -> int:
    # Aprox razonables para CV
    if _is_weekly(freq):
        return 7
    if _is_monthly(freq):
        return 30
    return 1  # fallback (diario)

# ---------------------------------------------
# Configura la estacionalidad del modelo Prophet
# ---------------------------------------------
def prophet_configuration(
    freq: str,
    n_changepoints: int,
    changepoint_prior_scale: float = 0.05,
    seasonality_prior_scale: float = 10.0
):
    """
    Ajusta estacionalidades según frecuencia:
    - Semanal: weekly=True, yearly=True
    - Mensual: weekly=False, yearly=True (se mantiene 'monthly' y 'quarterly' explícitas)
    """
    weekly_flag = _is_weekly(freq)
    model = Prophet(
        weekly_seasonality=weekly_flag,
        yearly_seasonality=True,
        daily_seasonality=False,
        n_changepoints=n_changepoints,
        changepoint_prior_scale=changepoint_prior_scale,
        seasonality_prior_scale=seasonality_prior_scale,
    )
    model.add_country_holidays(country_name='MX')

    # Estacionalidades adicionales útiles para retail
    model.add_seasonality(name='monthly',   period=30.5,  fourier_order=5)
    model.add_seasonality(name='quarterly', period=91.25, fourier_order=3)

    # Regresores de calendario (son robustos tanto para MS como W-MON)
    model.add_regressor('day_of_week')
    model.add_regressor('week_of_year')
    model.add_regressor('month')
    return model

# ---------------------------------
# Preparación de datos para Prophet
# ---------------------------------
def data_preparation_prophet(filtered_df: pd.DataFrame) -> pd.DataFrame:
    df = filtered_df[['Fecha', 'Cantidad']].rename(columns={'Fecha': 'ds', 'Cantidad': 'y'})
    # Variables de calendario
    df['day_of_week']  = df['ds'].dt.weekday              # 0=Lun … 6=Dom
    df['week_of_year'] = df['ds'].dt.isocalendar().week.astype(int)
    df['month']        = df['ds'].dt.month
    return df

# --------------------
# Forecast a futuro
# --------------------
def make_forecast(model: Prophet, periods: int, freq: str) -> pd.DataFrame:
    """
    Crea el dataframe futuro en la misma frecuencia efectiva (MS o W-MON).
    """
    future = model.make_future_dataframe(periods=periods, freq=freq)
    future['day_of_week']  = future['ds'].dt.weekday
    future['week_of_year'] = future['ds'].dt.isocalendar().week.astype(int)
    future['month']        = future['ds'].dt.month
    return model.predict(future)

# -------------------------------------
# Unir reales vs predicción (para métricas)
# -------------------------------------
def join_predictions(df_prophet: pd.DataFrame, forecast: pd.DataFrame) -> pd.DataFrame:
    df_merged = df_prophet.set_index('ds').join(forecast.set_index('ds')[['yhat']], how='outer')
    return df_merged

# --------------
# Métricas
# --------------
def calculate_metrics(df_merged: pd.DataFrame):
    # Evitar división por cero (si y==0, MAPE se vuelve inf); lo manejamos con np.where
    denom = np.where(df_merged['y'] == 0, np.nan, df_merged['y'])
    df_merged['MAPE'] = np.abs(df_merged['y'] - df_merged['yhat']) / denom * 100

    # WMAPE (protegido)
    suma_y = np.nansum(df_merged['y'])
    if suma_y == 0:
        wmape_percentage = np.nan
    else:
        wmape_percentage = np.nansum(np.abs(df_merged['y'] - df_merged['yhat'])) / suma_y * 100

    # SMAPE (protegido)
    num = 2 * np.abs(df_merged['y'] - df_merged['yhat'])
    den = (np.abs(df_merged['y']) + np.abs(df_merged['yhat']))
    smape_percentage = np.nanmean(np.where(den == 0, np.nan, num / den)) * 100

    return wmape_percentage, smape_percentage, df_merged

# ---------------------------------------
# Validación cruzada robusta por frecuencia
# ---------------------------------------
def realizar_validacion_cruzada_segura(model: Prophet, df_prophet: pd.DataFrame, freq: str):
    """
    Construye ventanas de CV en 'days' en función de la frecuencia efectiva:
    - MS  -> ~30 días por paso
    - W-MON -> 7 días por paso
    """
    step_days = _days_per_step(freq)

    total_days = (df_prophet['ds'].max() - df_prophet['ds'].min()).days
    if total_days <= 0:
        return pd.DataFrame(), pd.DataFrame()

    # 60% / 20% / 20% en pasos de la frecuencia
    total_steps = max(1, len(df_prophet) - 1)
    initial_steps = max(1, int(total_steps * 0.6))
    period_steps  = max(1, int(total_steps * 0.2))
    horizon_steps = max(1, total_steps - initial_steps - period_steps)

    # A días:
    initial_days = initial_steps * step_days
    period_days  = period_steps  * step_days
    horizon_days = horizon_steps * step_days

    # Guardas para evitar errores de Prophet
    if horizon_days <= 0 or (initial_days + horizon_days) >= total_days:
        return pd.DataFrame(), pd.DataFrame()

    init_str = f"{initial_days} days"
    per_str  = f"{period_days} days"
    hor_str  = f"{horizon_days} days"

    try:
        df_cv = cross_validation(model, initial=init_str, period=per_str, horizon=hor_str)
        df_p  = performance_metrics(df_cv)
        return df_cv, df_p
    except Exception:
        # Si falla (series cortas, etc.), devolvemos vacío sin reventar pipeline
        return pd.DataFrame(), pd.DataFrame()

# ------------------------------------
# Tuning de hiperparámetros con Optuna
# ------------------------------------
def tune_hyperparams(df_prophet: pd.DataFrame, freq: str, periodo_a_predecir: int, n_trials: int = 5):
    def objective(trial):
        cps = trial.suggest_loguniform("changepoint_prior_scale", 0.001, 0.5)
        sps = trial.suggest_loguniform("seasonality_prior_scale", 0.01, 10.0)
        ncp = trial.suggest_int("n_changepoints", 5, 50)

        model = prophet_configuration(
            freq=freq,
            n_changepoints=ncp,
            changepoint_prior_scale=cps,
            seasonality_prior_scale=sps
        )
        model.fit(df_prophet)

        df_cv, _ = realizar_validacion_cruzada_segura(model, df_prophet, freq)
        if df_cv.empty:
            return float("inf")
        perf = performance_metrics(df_cv)
        return float(perf['rmse'].mean())

    study = optuna.create_study(direction="minimize")
    study.optimize(objective, n_trials=n_trials)
    return study.best_params