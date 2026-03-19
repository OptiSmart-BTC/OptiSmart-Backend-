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
    if _is_weekly(freq):
        return 7
    if _is_monthly(freq):
        return 30
    return 1  # diario por defecto


# ---------------------------
# Métricas para tuning (CV)
# ---------------------------
def _wmape(y_true: np.ndarray, y_pred: np.ndarray, eps: float = 1e-9) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    denom = np.sum(np.abs(y_true))
    if denom < eps:
        # Si todo es ~0, WMAPE no es informativa; penalizamos por MAE
        return float(np.mean(np.abs(y_true - y_pred)))
    return float(np.sum(np.abs(y_true - y_pred)) / (denom + eps))


def _smape(y_true: np.ndarray, y_pred: np.ndarray, eps: float = 1e-9) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    denom = (np.abs(y_true) + np.abs(y_pred))
    return float(np.mean(2.0 * np.abs(y_pred - y_true) / np.maximum(denom, eps)))


def _rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def _mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return float(np.mean(np.abs(y_true - y_pred)))


def _apply_target_transform(y: np.ndarray, transform: str) -> np.ndarray:
    t = (transform or "none").lower()
    if t in ("log1p", "log"):
        return np.log1p(np.maximum(y, 0.0))
    return y


def _invert_target_transform(y: np.ndarray, transform: str) -> np.ndarray:
    t = (transform or "none").lower()
    if t in ("log1p", "log"):
        return np.maximum(np.expm1(y), 0.0)
    return y


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
    # nuevos (opcionales)
    seasonality_mode: str = "additive",
    changepoint_range: float = 0.80,
    interval_width: float = 0.90,
    uncertainty_samples: int = 500,
):
    is_daily = _is_daily(freq)
    is_weekly = _is_weekly(freq)

    model = Prophet(
        daily_seasonality=is_daily,
        weekly_seasonality=(is_daily or is_weekly),
        yearly_seasonality=True,
        n_changepoints=int(n_changepoints),
        changepoint_prior_scale=float(changepoint_prior_scale),
        seasonality_prior_scale=float(seasonality_prior_scale),
        seasonality_mode=str(seasonality_mode),
        changepoint_range=float(changepoint_range),
        interval_width=float(interval_width),
        uncertainty_samples=int(uncertainty_samples),
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
    df["day_of_week"] = df["ds"].dt.weekday
    df["week_of_year"] = df["ds"].dt.isocalendar().week.astype(int)
    df["month"] = df["ds"].dt.month

    return df.reset_index(drop=True)


# --------------------
# Forecast
# --------------------
def make_forecast(model: Prophet, periods: int, freq: str, add_calendar_regressors: bool = True) -> pd.DataFrame:
    future = model.make_future_dataframe(periods=int(periods), freq=freq)

    if add_calendar_regressors:
        future["day_of_week"] = future["ds"].dt.weekday
        future["week_of_year"] = future["ds"].dt.isocalendar().week.astype(int)
        future["month"] = future["ds"].dt.month

    return model.predict(future)


# ---------------------------------------
# Validación cruzada robusta
# ---------------------------------------
def realizar_validacion_cruzada_segura(model: Prophet, df_prophet: pd.DataFrame, freq: str):
    step_days = _days_per_step(freq)
    total_days = (df_prophet["ds"].max() - df_prophet["ds"].min()).days
    if total_days <= 0:
        return pd.DataFrame(), pd.DataFrame()

    total_steps = max(1, len(df_prophet) - 1)
    initial_steps = max(1, int(total_steps * 0.6))
    period_steps = max(1, int(total_steps * 0.2))
    horizon_steps = max(1, total_steps - initial_steps - period_steps)

    initial_days = initial_steps * step_days
    period_days = period_steps * step_days
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
    # nuevos
    tuning_objective: str = "rmse",
    target_transform: str = "none",
    outlier_clip: Optional[Dict[str, Any]] = None,
    tuning_ranges: Optional[Dict[str, Any]] = None,
    seasonality_mode_choices: Optional[list] = None,
    changepoint_range_bounds: Optional[Tuple[float, float]] = None,
    interval_width: float = 0.90,
    uncertainty_samples: int = 500,
):
    if optuna is None:
        return None

    tuning_objective = (tuning_objective or "rmse").lower()
    seasonality_mode_choices = seasonality_mode_choices or ["additive", "multiplicative"]

    # RANGOS por defecto (sensatos para producción)
    tr = tuning_ranges or {}
    cps_low, cps_high = tr.get("changepoint_prior_scale", (0.01, 0.5))
    sps_low, sps_high = tr.get("seasonality_prior_scale", (0.1, 30.0))
    ncp_low, ncp_high = tr.get("n_changepoints", (10, 50))

    cpr_low, cpr_high = (changepoint_range_bounds or (0.80, 0.98))

    def _score(y_true: np.ndarray, y_pred: np.ndarray) -> float:
        if tuning_objective == "wmape":
            return _wmape(y_true, y_pred)
        if tuning_objective == "smape":
            return _smape(y_true, y_pred)
        if tuning_objective == "mae":
            return _mae(y_true, y_pred)
        # default rmse
        return _rmse(y_true, y_pred)

    def objective(trial):
        cps = trial.suggest_float("changepoint_prior_scale", float(cps_low), float(cps_high), log=True)
        sps = trial.suggest_float("seasonality_prior_scale", float(sps_low), float(sps_high), log=True)
        ncp = trial.suggest_int("n_changepoints", int(ncp_low), int(ncp_high))
        cpr = trial.suggest_float("changepoint_range", float(cpr_low), float(cpr_high))
        smode = trial.suggest_categorical("seasonality_mode", list(seasonality_mode_choices))

        model = prophet_configuration(
            freq=freq,
            n_changepoints=ncp,
            changepoint_prior_scale=cps,
            seasonality_prior_scale=sps,
            add_mx_holidays=add_mx_holidays,
            add_monthly_seasonality=add_monthly_seasonality,
            add_quarterly_seasonality=add_quarterly_seasonality,
            add_calendar_regressors=add_calendar_regressors,
            seasonality_mode=smode,
            changepoint_range=cpr,
            interval_width=interval_width,
            uncertainty_samples=uncertainty_samples,
        )
        model.fit(df_prophet)

        df_cv, _ = realizar_validacion_cruzada_segura(model, df_prophet, freq)
        if df_cv.empty:
            return float("inf")

        # df_cv trae columnas y, yhat (en escala entrenada: quizá transformada)
        y_true = df_cv["y"].astype(float).to_numpy()
        y_pred = df_cv["yhat"].astype(float).to_numpy()

        # Si entrenamos en log1p, medimos en escala original (mejor para WMAPE/SMAPE)
        if (target_transform or "none").lower() in ("log1p", "log"):
            y_true = _invert_target_transform(y_true, target_transform)
            y_pred = _invert_target_transform(y_pred, target_transform)

        return float(_score(y_true, y_pred))

    # pruner para acelerar si n_trials es grande
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

    # nuevos: objetivo, transform, outliers y rangos de tuning
    tuning_objective = str(model_params.get("tuning_objective", "rmse")).lower()
    target_transform = str(model_params.get("target_transform", "none")).lower()
    outlier_clip = model_params.get("outlier_clip") if isinstance(model_params.get("outlier_clip"), dict) else None
    tuning_ranges = model_params.get("tuning_ranges") if isinstance(model_params.get("tuning_ranges"), dict) else None

    seasonality_mode_fixed = model_params.get("seasonality_mode")  # puede ser str o None
    seasonality_mode_choices = model_params.get("seasonality_mode_choices")
    if isinstance(seasonality_mode_choices, list) and seasonality_mode_choices:
        smode_choices = seasonality_mode_choices
    else:
        smode_choices = ["additive", "multiplicative"]

    # Parámetros Prophet adicionales (fijos o tunables)
    changepoint_range_fixed = model_params.get("changepoint_range")
    changepoint_range_bounds = model_params.get("changepoint_range_bounds")
    if isinstance(changepoint_range_bounds, (list, tuple)) and len(changepoint_range_bounds) == 2:
        cpr_bounds = (float(changepoint_range_bounds[0]), float(changepoint_range_bounds[1]))
    else:
        cpr_bounds = (0.80, 0.98)

    interval_width = float(model_params.get("interval_width", 0.90))
    uncertainty_samples = int(model_params.get("uncertainty_samples", 500))

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

    # 0) Outlier clip (antes de transform)
    clip_info = {"enabled": False}
    if outlier_clip and bool(outlier_clip.get("enabled", False)):
        lo_q = float(outlier_clip.get("lower_q", 0.01))
        hi_q = float(outlier_clip.get("upper_q", 0.99))
        lo = float(df_prophet["y"].quantile(lo_q))
        hi = float(df_prophet["y"].quantile(hi_q))
        df_prophet["y"] = df_prophet["y"].clip(lower=lo, upper=hi)
        clip_info = {"enabled": True, "lower_q": lo_q, "upper_q": hi_q, "lower": lo, "upper": hi}

    # 1) Target transform
    if target_transform in ("log1p", "log"):
        df_prophet["y"] = _apply_target_transform(df_prophet["y"].to_numpy(), target_transform)

    best = None
    used_tuning = False

    # 2) Tuning si aplica
    if enable_tuning and n_trials > 0 and optuna is not None:
        try:
            best = tune_hyperparams(
                df_prophet=df_prophet,
                freq=freq,
                periodo_a_predecir=periods,
                n_trials=n_trials,
                add_mx_holidays=add_mx_holidays,
                add_monthly_seasonality=add_monthly_seasonality,
                add_quarterly_seasonality=add_quarterly_seasonality,
                add_calendar_regressors=add_calendar_regressors,
                tuning_objective=tuning_objective,
                target_transform=target_transform,
                outlier_clip=outlier_clip,
                tuning_ranges=tuning_ranges,
                seasonality_mode_choices=smode_choices,
                changepoint_range_bounds=cpr_bounds,
                interval_width=interval_width,
                uncertainty_samples=uncertainty_samples,
            )
            used_tuning = bool(best)
        except Exception:
            best = None
            used_tuning = False

    # 3) Si no hay tuning: usar params fijos / defaults razonables
    if not best:
        best = {
            "n_changepoints": int(model_params.get("n_changepoints", 25)),
            "changepoint_prior_scale": float(model_params.get("changepoint_prior_scale", 0.05)),
            "seasonality_prior_scale": float(model_params.get("seasonality_prior_scale", 10.0)),
        }
        # opcionales
        if "changepoint_range" in model_params:
            best["changepoint_range"] = float(model_params.get("changepoint_range", 0.80))
        if "seasonality_mode" in model_params:
            best["seasonality_mode"] = str(model_params.get("seasonality_mode", "additive"))

    # Fit final
    try:
        model = prophet_configuration(
            freq=freq,
            n_changepoints=int(best.get("n_changepoints", 25)),
            changepoint_prior_scale=float(best.get("changepoint_prior_scale", 0.05)),
            seasonality_prior_scale=float(best.get("seasonality_prior_scale", 10.0)),
            add_mx_holidays=add_mx_holidays,
            add_monthly_seasonality=add_monthly_seasonality,
            add_quarterly_seasonality=add_quarterly_seasonality,
            add_calendar_regressors=add_calendar_regressors,
            seasonality_mode=str(best.get("seasonality_mode", seasonality_mode_fixed or "additive")),
            changepoint_range=float(best.get("changepoint_range", changepoint_range_fixed or 0.80)),
            interval_width=interval_width,
            uncertainty_samples=uncertainty_samples,
        )
        model.fit(df_prophet)

        # CV segura (no rompe)
        _df_cv, _df_p = realizar_validacion_cruzada_segura(model, df_prophet, freq)

        forecast = make_forecast(model, periods, freq, add_calendar_regressors=add_calendar_regressors)

        # Invertir transform en predicciones
        if target_transform in ("log1p", "log"):
            for col in ("yhat", "yhat_lower", "yhat_upper"):
                if col in forecast.columns:
                    forecast[col] = _invert_target_transform(forecast[col].astype(float).to_numpy(), target_transform)

        # No negativos
        if "yhat" in forecast.columns:
            forecast["yhat"] = np.maximum(forecast["yhat"].astype(float), 0.0)

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
            "tuning_objective": tuning_objective,
            "target_transform": target_transform,
            "outlier_clip": clip_info,
            "interval_width": interval_width,
            "uncertainty_samples": uncertainty_samples,
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
            "tuning_objective": tuning_objective,
            "target_transform": target_transform,
        }
        return df_prophet, pd.DataFrame(columns=["ds", "yhat"]), audit
