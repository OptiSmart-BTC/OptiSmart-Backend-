from prophet import Prophet
from prophet.diagnostics import cross_validation, performance_metrics
import pandas as pd
import numpy as np
import optuna
from typing import Dict, Tuple


# ---------------------------
# Utilidades por frecuencia
# ---------------------------
def _is_weekly(freq: str) -> bool:
    return isinstance(freq, str) and freq.upper().startswith("W")

def _is_monthly(freq: str) -> bool:
    return isinstance(freq, str) and (freq.upper().startswith("M") or freq.upper() == "MS")

def _is_daily(freq: str) -> bool:
    return isinstance(freq, str) and freq.upper() == "D"

def _days_per_step(freq: str) -> int:
    if _is_weekly(freq):  return 7
    if _is_monthly(freq): return 30
    return 1  # diario por defecto


# ---------------------------------------------
# Configura la estacionalidad del modelo Prophet
# ---------------------------------------------
def prophet_configuration(
    freq: str,
    n_changepoints: int,
    changepoint_prior_scale: float = 0.05,
    seasonality_prior_scale: float = 10.0
):
    is_daily  = _is_daily(freq)
    is_weekly = _is_weekly(freq)

    model = Prophet(
        daily_seasonality=is_daily,
        weekly_seasonality=(is_daily or is_weekly),
        yearly_seasonality=True,
        n_changepoints=n_changepoints,
        changepoint_prior_scale=changepoint_prior_scale,
        seasonality_prior_scale=seasonality_prior_scale,
    )

    # Feriados México + estacionalidades retail
    model.add_country_holidays(country_name='MX')
    model.add_seasonality(name='monthly',   period=30.5,  fourier_order=5)
    model.add_seasonality(name='quarterly', period=91.25, fourier_order=3)

    # Regresores calendario
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
    df['day_of_week']  = df['ds'].dt.weekday
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


# ---------------------------------------
# Validación cruzada robusta por frecuencia
# ---------------------------------------
def realizar_validacion_cruzada_segura(model: Prophet, df_prophet: pd.DataFrame, freq: str):
    """
    Construye ventanas de CV en 'days' en función de la frecuencia efectiva:
    - MS     -> ~30 días por paso
    - W-MON  -> 7 días por paso
    - D      -> 1 día por paso
    """
    step_days = _days_per_step(freq)
    total_days = (df_prophet['ds'].max() - df_prophet['ds'].min()).days
    if total_days <= 0:
        return pd.DataFrame(), pd.DataFrame()

    total_steps   = max(1, len(df_prophet) - 1)
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

    try:
        df_cv = cross_validation(
            model,
            initial=f"{initial_days} days",
            period=f"{period_days} days",
            horizon=f"{horizon_days} days",
        )
        df_p = performance_metrics(df_cv)
        return df_cv, df_p
    except Exception:
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


# ------------------------------------
# Runner estándar para pipeline_forecast
# ------------------------------------
def run_forecast(
    filtered_df: pd.DataFrame,
    freq: str,
    periods: int,
    forecast_date: str,
    model_params: Dict = None,
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict]:
    """
    API estándar para pipeline_forecast.py: (df_prepared, forecast, audit)
    - df_prepared: ds,y + regresores (histórico)
    - forecast: salida de model.predict(future) + forecast_date
    - audit: metadata para metricas_resultados
    """
    model_params = model_params or {}

    # Paridad con tu pipeline: N_TRIALS por env (default 3)
    # Si model_params incluye n_trials, lo respetamos.
    n_trials = int(model_params.get("n_trials", 0)) if "n_trials" in model_params else int(
        __import__("os").getenv("N_TRIALS", "3")
    )

    # Preparar data
    df_prophet = data_preparation_prophet(filtered_df)

    # Tuning
    best = tune_hyperparams(df_prophet, freq, periods, n_trials=n_trials)

    # Fit final
    model = prophet_configuration(
        freq=freq,
        n_changepoints=best['n_changepoints'],
        changepoint_prior_scale=best['changepoint_prior_scale'],
        seasonality_prior_scale=best['seasonality_prior_scale']
    )
    model.fit(df_prophet)

    # CV segura (no rompe pipeline)
    _df_cv, _df_p = realizar_validacion_cruzada_segura(model, df_prophet, freq)

    # Forecast (hist+fut)
    forecast = make_forecast(model, periods, freq)
    forecast['forecast_date'] = forecast_date

    audit = {
        "modelo_usado": "prophet",
        "status": "OK",
        "error_msg": "",
        "freq": freq,
        "periods": periods,
        "n_trials": n_trials,
        "best_params": best,
    }

    return df_prophet, forecast, audit
