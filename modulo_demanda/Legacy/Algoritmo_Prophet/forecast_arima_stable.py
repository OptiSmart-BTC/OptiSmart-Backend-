from __future__ import annotations

from typing import Dict, Tuple, Optional, Any
import warnings
import time  # FIX 2: medir fit_sec
import numpy as np
import pandas as pd

try:
    from statsmodels.tsa.statespace.sarimax import SARIMAX
except ImportError as e:
    raise ImportError("Falta statsmodels. Instala con: pip install statsmodels") from e


# -----------------------------
# Helpers
# -----------------------------
def _infer_seasonal_m(freq: str) -> int:
    """
    M estacional sugerido según freq.
    - D: 7 (semanal)
    - W-*: 52 (anual aprox)
    - MS: 12 (anual)
    Si no se reconoce: 0 (sin estacionalidad)
    """
    f = (freq or "").upper()
    if f == "D":
        return 7
    if f.startswith("W"):
        return 52
    if f == "MS":
        return 12
    return 0


def _parse_tuple(x: Any, n: int) -> Optional[Tuple[int, ...]]:
    """
    Acepta:
      - lista/tupla: [p,d,q] o (p,d,q)
      - string: "p,d,q"
    Devuelve tupla de ints o None si no parsea.
    """
    if x is None:
        return None
    if isinstance(x, (tuple, list)):
        if len(x) != n:
            return None
        return tuple(int(v) for v in x)
    if isinstance(x, str):
        parts = [p.strip() for p in x.split(",")]
        if len(parts) != n:
            return None
        return tuple(int(v) for v in parts)
    return None


def data_preparation_arima(df: pd.DataFrame) -> pd.DataFrame:
    """
    Entrada esperada: df con columnas ['Fecha','Cantidad'] (del pipeline, ya completado).
    Salida: df con columnas ['ds','y'] listo para métricas y modelos.
    """
    if df is None or df.empty:
        return pd.DataFrame(columns=["ds", "y"])

    out = df.copy()

    # Aceptar ya venga en ds/y
    if "ds" not in out.columns:
        if "Fecha" not in out.columns:
            raise ValueError("data_preparation_arima: falta columna 'Fecha' (o 'ds').")
        out["ds"] = pd.to_datetime(out["Fecha"])
    else:
        out["ds"] = pd.to_datetime(out["ds"])

    if "y" not in out.columns:
        if "Cantidad" not in out.columns:
            raise ValueError("data_preparation_arima: falta columna 'Cantidad' (o 'y').")
        out["y"] = pd.to_numeric(out["Cantidad"], errors="coerce")
    else:
        out["y"] = pd.to_numeric(out["y"], errors="coerce")

    out = out[["ds", "y"]].sort_values("ds")
    out["y"] = out["y"].fillna(0.0)
    out.loc[out["y"] < 0, "y"] = 0.0

    # Quitar duplicados de ds si existieran (típico si el resample falló)
    out = out.groupby("ds", as_index=False)["y"].sum()
    return out


def _grid_search_order(
    y: np.ndarray,
    seasonal_m: int,
    max_p: int,
    max_q: int,
    max_d: int,
    max_P: int,
    max_Q: int,
    max_D: int,
    use_seasonal: bool,
    enforce_stationarity: bool,
    enforce_invertibility: bool,
    fit_method: str,   # FIX 1: método de optimización
    fit_maxiter: int,  # FIX 1: límite de iteraciones
) -> Tuple[Tuple[int, int, int], Tuple[int, int, int, int], float]:
    """
    Grid search simple por AIC.
    Devuelve: (order, seasonal_order, best_aic)
    """
    best_aic = np.inf
    best_order = (0, 0, 0)
    best_seasonal = (0, 0, 0, 0)

    # Si no hay estacionalidad, forzamos seasonal_m=0
    if not use_seasonal or seasonal_m <= 1:
        seasonal_m = 0

    for d in range(0, max_d + 1):
        for p in range(0, max_p + 1):
            for q in range(0, max_q + 1):
                order = (p, d, q)

                if seasonal_m == 0:
                    seasonal_candidates = [(0, 0, 0, 0)]
                else:
                    seasonal_candidates = []
                    for D in range(0, max_D + 1):
                        for P in range(0, max_P + 1):
                            for Q in range(0, max_Q + 1):
                                seasonal_candidates.append((P, D, Q, seasonal_m))

                for seasonal_order in seasonal_candidates:
                    try:
                        with warnings.catch_warnings():
                            warnings.simplefilter("ignore")
                            model = SARIMAX(
                                y,
                                order=order,
                                seasonal_order=seasonal_order,
                                trend="c",
                                enforce_stationarity=enforce_stationarity,
                                enforce_invertibility=enforce_invertibility,
                            )
                            # FIX 1: fit acotado + método estable
                            res = model.fit(
                                disp=False,
                                method=fit_method,
                                maxiter=int(fit_maxiter),
                            )
                            aic = float(res.aic) if res.aic is not None else np.inf

                        if aic < best_aic:
                            best_aic = aic
                            best_order = order
                            best_seasonal = seasonal_order
                    except Exception:
                        continue

    return best_order, best_seasonal, best_aic


def run_forecast(
    filtered_df: pd.DataFrame,
    freq: str,
    periods: int,
    forecast_date: str,
    model_params: Dict,
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict]:
    """
    Firma estándar para pipeline_forecast.

    Devuelve:
      df_prepared: columnas ds,y
      forecast: columnas ds,yhat (incluye historia + futuro)
      audit: dict
    """
    params = model_params or {}

    df_prepared = data_preparation_arima(filtered_df)
    if df_prepared.empty or len(df_prepared) < 10:
        audit = {
            "modelo_usado": "arima",
            "status": "EXCLUDED",
            "error_msg": "Serie insuficiente para ARIMA (min recomendado ~10).",
        }
        return df_prepared, pd.DataFrame(columns=["ds", "yhat"]), audit

    df_prepared = df_prepared.sort_values("ds")
    y = df_prepared["y"].astype(float).values

    # Defaults / parámetros
    enforce_stationarity = bool(params.get("enforce_stationarity", False))
    enforce_invertibility = bool(params.get("enforce_invertibility", False))

    # FIX 1: límites del fit para que no se vaya infinito
    fit_method = str(params.get("fit_method", "lbfgs"))
    fit_maxiter = int(params.get("maxiter", 60))

    # Estacionalidad
    
    seasonal_m = int(params.get("seasonal_m", _infer_seasonal_m(freq)))
    use_seasonal = bool(params.get("use_seasonal", seasonal_m > 1))

    # Si hay muy pocos puntos, desactiva estacionalidad para evitar sobreajuste/errores
    if use_seasonal and len(y) < (2 * seasonal_m + 10):
        use_seasonal = False
        seasonal_m = 0

    # Si el usuario da order/seasonal_order explícitos, los usamos
    order = _parse_tuple(params.get("order"), 3)
    seasonal_order = _parse_tuple(params.get("seasonal_order"), 4)

    # Auto-search si no hay order
    auto = bool(params.get("auto", True))
    aic = None
    bic = None

    if (order is None) and auto:
        max_p = int(params.get("max_p", 2))
        max_q = int(params.get("max_q", 2))
        max_d = int(params.get("max_d", 1))

        max_P = int(params.get("max_P", 1))
        max_Q = int(params.get("max_Q", 1))
        max_D = int(params.get("max_D", 1))

        best_order, best_seasonal, best_aic = _grid_search_order(
            y=y,
            seasonal_m=seasonal_m,
            max_p=max_p,
            max_q=max_q,
            max_d=max_d,
            max_P=max_P,
            max_Q=max_Q,
            max_D=max_D,
            use_seasonal=use_seasonal,
            enforce_stationarity=enforce_stationarity,
            enforce_invertibility=enforce_invertibility,
            fit_method=fit_method,     # FIX 1
            fit_maxiter=fit_maxiter,   # FIX 1
        )
        order = best_order
        seasonal_order = best_seasonal
        aic = best_aic

    # Si sigue None, usa fallback simple
    if order is None:
        order = (1, 0, 1)

    if seasonal_order is None:
        if use_seasonal and seasonal_m > 1:
            seasonal_order = (0, 0, 0, seasonal_m)
        else:
            seasonal_order = (0, 0, 0, 0)

    # Fit + predicción
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = SARIMAX(
                y,
                order=order,
                seasonal_order=seasonal_order,
                trend="c",
                enforce_stationarity=enforce_stationarity,
                enforce_invertibility=enforce_invertibility,
            )

            # FIX 2: medir tiempo SOLO del fit
            t0 = time.perf_counter()
            res = model.fit(
                disp=False,
                method=fit_method,       # FIX 1
                maxiter=int(fit_maxiter) # FIX 1
            )
            fit_sec = float(time.perf_counter() - t0)

        # In-sample: predicción para toda la historia
        pred_in = res.get_prediction(start=0, end=len(y) - 1).predicted_mean
        pred_in = np.asarray(pred_in, dtype=float)

        # Future
        fc = res.get_forecast(steps=int(periods)).predicted_mean
        fc = np.asarray(fc, dtype=float)

        # Fechas futuras (continuas según freq)
        last_ds = df_prepared["ds"].iloc[-1]
        future_ds = pd.date_range(last_ds, periods=periods + 1, freq=freq)[1:]

        # Construir forecast (historia + futuro)
        ds_all = pd.concat([df_prepared["ds"], pd.Series(future_ds)], ignore_index=True)
        yhat_all = np.concatenate([pred_in, fc], axis=0)

        forecast = pd.DataFrame({"ds": ds_all, "yhat": yhat_all})
        forecast["forecast_date"] = forecast_date

        # Métricas/Audit
        try:
            bic = float(res.bic) if res.bic is not None else None
            if aic is None:
                aic = float(res.aic) if res.aic is not None else None
        except Exception:
            pass

        audit = {
            "modelo_usado": "arima",
            "status": "OK",
            "error_msg": "",
            "order": str(order),
            "seasonal_order": str(seasonal_order),
            "aic": aic,
            "bic": bic,
            "n_obs": int(len(y)),
            "use_seasonal": bool(use_seasonal),
            "seasonal_m": int(seasonal_m),
            "fit_method": fit_method,      # FIX 1 (audit)
            "maxiter": int(fit_maxiter),   # FIX 1 (audit)
            "fit_sec": fit_sec,            # FIX 2
        }

        return df_prepared, forecast, audit

    except Exception as e:
        audit = {
            "modelo_usado": "arima",
            "status": "ERROR",
            "error_msg": str(e),
            "order": str(order),
            "seasonal_order": str(seasonal_order),
            "use_seasonal": bool(use_seasonal),
            "seasonal_m": int(seasonal_m),
            "fit_method": fit_method,    # FIX 1
            "maxiter": int(fit_maxiter), # FIX 1
        }
        return df_prepared, pd.DataFrame(columns=["ds", "yhat"]), audit