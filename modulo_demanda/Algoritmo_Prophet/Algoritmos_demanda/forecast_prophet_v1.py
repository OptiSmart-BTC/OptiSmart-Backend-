from typing import Dict, Tuple, Any, Optional
import os

import pandas as pd
import numpy as np

from prophet import Prophet
from prophet.diagnostics import cross_validation, performance_metrics

# optuna es opcional: si no está y enable_tuning=True, caemos a modo fijo
try:
    import optuna
except Exception:
    optuna = None


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
# Configura Prophet
# ---------------------------------------------
def prophet_configuration(
    freq: str,
    n_changepoints: int,
    changepoint_prior_scale: float = 0.05,
    seasonality_prior_scale: float = 10.0,
    add_mx_holidays: bool = True,
    add_monthly_seasonality: bool = True,
    add_quarterly_seasonality: bool = True,
    add_calendar_regressors: bool = True,
):
    is_daily  = _is_daily(freq)
    is_weekly = _is_weekly(freq)

    model = Prophet(
        daily_seasonality=is_daily,
        weekly_seasonality=(is_daily or is_weekly),
        yearly_seasonality=True,
        n_changepoints=int(n_changepoints),
        changepoint_prior_scale=float(changepoint_prior_scale),
        seasonality_prior_scale=float(seasonality_prior_scale),
    )

    if add_mx_holidays:
        model.add_country_holidays(country_name="MX")

    if add_monthly_seasonality:
        model.add_seasonality(name="monthly", period=30.5, fourier_order=5)
    if add_quarterly_seasonality:
        model.add_seasonality(name="quarterly", period=91.25, fourier_order=3)

    if add_calendar_regressors:
        model.add_regressor("day_of_week")
        model.add_regressor("week_of_year")
        model.add_regressor("month")

    return model


# ---------------------------------
# Preparación de datos
# ---------------------------------
def data_preparation_prophet(filtered_df: pd.DataFrame) -> pd.DataFrame:
    if filtered_df is None or filtered_df.empty:
        return pd.DataFrame(columns=["ds", "y", "day_of_week", "week_of_year", "month"])

    df = filtered_df[["Fecha", "Cantidad"]].rename(columns={"Fecha": "ds", "Cantidad": "y"}).copy()
    df["ds"] = pd.to_datetime(df["ds"], errors="coerce")
    df["y"] = pd.to_numeric(df["y"], errors="coerce").fillna(0.0)
    df = df.dropna(subset=["ds"]).sort_values("ds")

    # Normalizar: negativos a 0
    df["y"] = np.where(df["y"] > 0, df["y"], 0.0)

    # dedup ds
    df = df.groupby("ds", as_index=False)["y"].sum().sort_values("ds")

    # Variables calendario
    df["day_of_week"]  = df["ds"].dt.weekday
    df["week_of_year"] = df["ds"].dt.isocalendar().week.astype(int)
    df["month"]        = df["ds"].dt.month

    return df.reset_index(drop=True)


# --------------------
# Forecast
# --------------------
def make_forecast(model: Prophet, periods: int, freq: str, add_calendar_regressors: bool = True) -> pd.DataFrame:
    future = model.make_future_dataframe(periods=int(periods), freq=freq)

    if add_calendar_regressors:
        future["day_of_week"]  = future["ds"].dt.weekday
        future["week_of_year"] = future["ds"].dt.isocalendar().week.astype(int)
        future["month"]        = future["ds"].dt.month

    return model.predict(future)


# ---------------------------------------
# Validación cruzada robusta
# ---------------------------------------
def realizar_validacion_cruzada_segura(model: Prophet, df_prophet: pd.DataFrame, freq: str):
    step_days = _days_per_step(freq)
    total_days = (df_prophet["ds"].max() - df_prophet["ds"].min()).days
    if total_days <= 0:
        return pd.DataFrame(), pd.DataFrame()

    total_steps   = max(1, len(df_prophet) - 1)
    initial_steps = max(1, int(total_steps * 0.6))
    period_steps  = max(1, int(total_steps * 0.2))
    horizon_steps = max(1, total_steps - initial_steps - period_steps)

    initial_days = initial_steps * step_days
    period_days  = period_steps  * step_days
    horizon_days = horizon_steps * step_days

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
# Tuning con Optuna (opcional)
# ------------------------------------
def tune_hyperparams(
    df_prophet: pd.DataFrame,
    freq: str,
    periodo_a_predecir: int,
    n_trials: int = 5,
    add_mx_holidays: bool = True,
    add_monthly_seasonality: bool = True,
    add_quarterly_seasonality: bool = True,
    add_calendar_regressors: bool = True,
):
    if optuna is None:
        return None

    def objective(trial):
        # ranges: conservadores para no explotar tiempo
        cps = trial.suggest_float("changepoint_prior_scale", 0.001, 0.5, log=True)
        sps = trial.suggest_float("seasonality_prior_scale", 0.01, 10.0, log=True)
        ncp = trial.suggest_int("n_changepoints", 5, 50)

        model = prophet_configuration(
            freq=freq,
            n_changepoints=ncp,
            changepoint_prior_scale=cps,
            seasonality_prior_scale=sps,
            add_mx_holidays=add_mx_holidays,
            add_monthly_seasonality=add_monthly_seasonality,
            add_quarterly_seasonality=add_quarterly_seasonality,
            add_calendar_regressors=add_calendar_regressors,
        )
        model.fit(df_prophet)

        df_cv, _ = realizar_validacion_cruzada_segura(model, df_prophet, freq)
        if df_cv.empty:
            return float("inf")
        perf = performance_metrics(df_cv)
        return float(perf["rmse"].mean())

    study = optuna.create_study(direction="minimize")
    study.optimize(objective, n_trials=int(n_trials))
    return study.best_params


# ------------------------------------
# Runner estándar para pipeline_forecast
# ------------------------------------
def run_forecast(
    filtered_df: pd.DataFrame,
    freq: str,
    periods: int,
    forecast_date: str,
    model_params: Optional[Dict[str, Any]] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
    model_params = model_params or {}

    # defaults + flags
    enable_tuning = bool(model_params.get("enable_tuning", True))
    add_mx_holidays = bool(model_params.get("add_mx_holidays", True))
    add_monthly_seasonality = bool(model_params.get("add_monthly_seasonality", True))
    add_quarterly_seasonality = bool(model_params.get("add_quarterly_seasonality", True))
    add_calendar_regressors = bool(model_params.get("add_calendar_regressors", True))

    # Paridad: N_TRIALS por env si no viene explícito
    if "n_trials" in model_params:
        n_trials = int(model_params.get("n_trials", 0))
    else:
        n_trials = int(os.getenv("N_TRIALS", "3"))

    df_prophet = data_preparation_prophet(filtered_df)

    if df_prophet.empty or len(df_prophet) < 10:
        audit = {
            "modelo_usado": "prophet",
            "status": "EXCLUDED",
            "error_msg": "Serie insuficiente para Prophet (min recomendado ~10).",
        }
        return df_prophet, pd.DataFrame(columns=["ds", "yhat"]), audit

    best = None
    used_tuning = False

    # 1) Tuning si aplica
    if enable_tuning and n_trials > 0 and optuna is not None:
        try:
            best = tune_hyperparams(
                df_prophet, freq, periods, n_trials=n_trials,
                add_mx_holidays=add_mx_holidays,
                add_monthly_seasonality=add_monthly_seasonality,
                add_quarterly_seasonality=add_quarterly_seasonality,
                add_calendar_regressors=add_calendar_regressors,
            )
            used_tuning = bool(best)
        except Exception:
            best = None
            used_tuning = False

    # 2) Si no hay tuning: usar params fijos / defaults razonables
    if not best:
        best = {
            "n_changepoints": int(model_params.get("n_changepoints", 25)),
            "changepoint_prior_scale": float(model_params.get("changepoint_prior_scale", 0.05)),
            "seasonality_prior_scale": float(model_params.get("seasonality_prior_scale", 10.0)),
        }

    # Fit final
    try:
        model = prophet_configuration(
            freq=freq,
            n_changepoints=best["n_changepoints"],
            changepoint_prior_scale=best["changepoint_prior_scale"],
            seasonality_prior_scale=best["seasonality_prior_scale"],
            add_mx_holidays=add_mx_holidays,
            add_monthly_seasonality=add_monthly_seasonality,
            add_quarterly_seasonality=add_quarterly_seasonality,
            add_calendar_regressors=add_calendar_regressors,
        )
        model.fit(df_prophet)

        # CV segura (no rompe)
        _df_cv, _df_p = realizar_validacion_cruzada_segura(model, df_prophet, freq)

        forecast = make_forecast(model, periods, freq, add_calendar_regressors=add_calendar_regressors)
        forecast["forecast_date"] = forecast_date

        audit = {
            "modelo_usado": "prophet",
            "status": "OK",
            "error_msg": "",
            "freq": freq,
            "periods": periods,
            "enable_tuning": enable_tuning,
            "used_tuning": used_tuning,
            "n_trials": n_trials,
            "best_params": best,
            "add_mx_holidays": add_mx_holidays,
            "add_monthly_seasonality": add_monthly_seasonality,
            "add_quarterly_seasonality": add_quarterly_seasonality,
            "add_calendar_regressors": add_calendar_regressors,
        }

        return df_prophet, forecast, audit

    except Exception as e:
        audit = {
            "modelo_usado": "prophet",
            "status": "ERROR",
            "error_msg": str(e),
            "freq": freq,
            "periods": periods,
            "enable_tuning": enable_tuning,
            "n_trials": n_trials,
        }
        return df_prophet, pd.DataFrame(columns=["ds", "yhat"]), audit