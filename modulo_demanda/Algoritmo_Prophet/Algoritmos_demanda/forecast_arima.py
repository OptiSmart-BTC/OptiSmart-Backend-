from __future__ import annotations

from typing import Dict, Tuple, Optional, Any, List
import warnings
import time
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
    if df is None or df.empty:
        return pd.DataFrame(columns=["ds", "y"])

    out = df.copy()

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

    out = out.groupby("ds", as_index=False)["y"].sum()
    return out


def _as_int_list(x: Any, default: List[int]) -> List[int]:
    """
    Permite pasar candidatos estacionales vía params:
      - lista/tupla: [0,1]
      - string: "0,1"
      - int: 0
    """
    if x is None:
        return list(default)
    if isinstance(x, int):
        return [int(x)]
    if isinstance(x, (list, tuple)):
        return [int(v) for v in x]
    if isinstance(x, str):
        parts = [p.strip() for p in x.split(",") if p.strip() != ""]
        if not parts:
            return list(default)
        return [int(v) for v in parts]
    return list(default)


def _fit_aic(
    y: np.ndarray,
    order: Tuple[int, int, int],
    seasonal_order: Tuple[int, int, int, int],
    trend: str,
    enforce_stationarity: bool,
    enforce_invertibility: bool,
    fit_method: str,
    maxiter: int,
) -> Tuple[float, Optional[Any], Optional[str]]:
    """
    Fit rápido para comparar AIC durante búsqueda.
    Devuelve: (aic, res, error_msg)
    """
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = SARIMAX(
                y,
                order=order,
                seasonal_order=seasonal_order,
                trend=trend,
                enforce_stationarity=enforce_stationarity,
                enforce_invertibility=enforce_invertibility,
            )
            res = model.fit(disp=False, method=fit_method, maxiter=int(maxiter))
            aic = float(res.aic) if res.aic is not None else np.inf
        return aic, res, None
    except Exception as e:
        return np.inf, None, str(e)


# -----------------------------
# Two-stage SARIMA search
# -----------------------------
def _two_stage_search(
    y: np.ndarray,
    seasonal_m: int,
    use_seasonal: bool,
    max_p: int,
    max_q: int,
    max_d: int,
    P_candidates: List[int],
    D_candidates: List[int],
    Q_candidates: List[int],
    fit_method: str,
    maxiter_search: int,
    enforce_stationarity: bool,
    enforce_invertibility: bool,
    search_budget_sec: float,
) -> Tuple[Tuple[int, int, int], Tuple[int, int, int, int], float, Dict[str, Any]]:
    """
    Fase A: busca order (p,d,q) sin estacionalidad
    Fase B: con order fijo, prueba un set pequeño de seasonal_order con m
    Devuelve: (best_order, best_seasonal_order, best_aic, debug)
    """
    t0 = time.perf_counter()
    deadline = t0 + float(search_budget_sec)

    dbg: Dict[str, Any] = {
        "stageA": {"n_tried": 0, "n_ok": 0, "n_failed": 0},
        "stageB": {"n_tried": 0, "n_ok": 0, "n_failed": 0},
        "budget_sec": float(search_budget_sec),
        "seasonal_m": int(seasonal_m),
        "use_seasonal": bool(use_seasonal),
        "P_candidates": P_candidates,
        "D_candidates": D_candidates,
        "Q_candidates": Q_candidates,
        "maxiter_search": int(maxiter_search),
    }

    best_aic = np.inf
    best_order = (0, 0, 0)
    best_seasonal = (0, 0, 0, 0)

    # ---- Stage A: non-seasonal order search ----
    seasonal0 = (0, 0, 0, 0)
    for d in range(0, max_d + 1):
        for p in range(0, max_p + 1):
            for q in range(0, max_q + 1):
                if time.perf_counter() > deadline:
                    dbg["stopped_reason"] = "BUDGET_STAGE_A"
                    dbg["grid_sec"] = float(time.perf_counter() - t0)
                    return best_order, best_seasonal, float(best_aic), dbg

                order = (p, d, q)
                dbg["stageA"]["n_tried"] += 1

                # Para capturar drift/tendencia leve y evitar forecasts demasiado planos:
                trend = "c"

                aic, _, err = _fit_aic(
                    y=y,
                    order=order,
                    seasonal_order=seasonal0,
                    trend=trend,
                    enforce_stationarity=enforce_stationarity,
                    enforce_invertibility=enforce_invertibility,
                    fit_method=fit_method,
                    maxiter=maxiter_search,
                )
                if np.isfinite(aic):
                    dbg["stageA"]["n_ok"] += 1
                    if aic < best_aic:
                        best_aic = aic
                        best_order = order
                        best_seasonal = seasonal0
                else:
                    dbg["stageA"]["n_failed"] += 1

    # ---- Stage B: seasonal refinement (small candidate set) ----
    if use_seasonal and seasonal_m > 1:
        # Probamos combinaciones pequeñas sobre el order ganador
        for D in D_candidates:
            for P in P_candidates:
                for Q in Q_candidates:
                    if time.perf_counter() > deadline:
                        dbg["stopped_reason"] = "BUDGET_STAGE_B"
                        dbg["grid_sec"] = float(time.perf_counter() - t0)
                        return best_order, best_seasonal, float(best_aic), dbg

                    seasonal_order = (int(P), int(D), int(Q), int(seasonal_m))
                    dbg["stageB"]["n_tried"] += 1

                    trend = "c"

                    aic, _, err = _fit_aic(
                        y=y,
                        order=best_order,
                        seasonal_order=seasonal_order,
                        trend=trend,
                        enforce_stationarity=enforce_stationarity,
                        enforce_invertibility=enforce_invertibility,
                        fit_method=fit_method,
                        maxiter=maxiter_search,
                    )
                    if np.isfinite(aic):
                        dbg["stageB"]["n_ok"] += 1
                        if aic < best_aic:
                            best_aic = aic
                            best_seasonal = seasonal_order
                    else:
                        dbg["stageB"]["n_failed"] += 1

    dbg["stopped_reason"] = "COMPLETED"
    dbg["grid_sec"] = float(time.perf_counter() - t0)
    return best_order, best_seasonal, float(best_aic), dbg


# -----------------------------
# Main
# -----------------------------
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

    # Defaults estables
    enforce_stationarity = bool(params.get("enforce_stationarity", True))
    enforce_invertibility = bool(params.get("enforce_invertibility", True))

    fit_method = str(params.get("fit_method", "lbfgs"))

    # Nuevo: maxiter separado para búsqueda vs refit final
    maxiter_search = int(params.get("maxiter_search", 12))
    maxiter_final = int(params.get("maxiter_final", params.get("maxiter", 60)))

    # Estacionalidad (activada de nuevo)
    seasonal_m = int(params.get("seasonal_m", _infer_seasonal_m(freq)))
    use_seasonal = bool(params.get("use_seasonal", seasonal_m > 1))

    # Si hay muy pocos puntos para estacionalidad, apágala
    if use_seasonal and seasonal_m > 1 and len(y) < (2 * seasonal_m + 10):
        use_seasonal = False
        seasonal_m = 0

    # Overrides explícitos (si te los pasan)
    order = _parse_tuple(params.get("order"), 3)
    seasonal_order = _parse_tuple(params.get("seasonal_order"), 4)

    auto = bool(params.get("auto", True))
    two_stage = bool(params.get("two_stage", True))

    aic = None
    bic = None
    grid_debug = None
    grid_best_aic = None

    # ============================
    # AUTO: Two-stage fast SARIMA
    # ============================
    if (order is None or seasonal_order is None) and auto and two_stage:
        # Stage A search space
        max_p = int(params.get("max_p", 2))
        max_q = int(params.get("max_q", 2))
        max_d = int(params.get("max_d", 1))

        # Stage B candidate lists (defaults optimizados para tu caso semanal)
        # Basado en tu ganador viejo: P=0, D=1, Q=1, m=52
        P_candidates = _as_int_list(params.get("seasonal_P_candidates"), default=[0])
        D_candidates = _as_int_list(params.get("seasonal_D_candidates"), default=[0, 1])
        Q_candidates = _as_int_list(params.get("seasonal_Q_candidates"), default=[0, 1])

        # Presupuesto de búsqueda total por DFU (sin router timeout)
        search_budget_sec = float(params.get("search_budget_sec", 90))

        best_order, best_seasonal, best_aic, dbg = _two_stage_search(
            y=y,
            seasonal_m=seasonal_m,
            use_seasonal=use_seasonal,
            max_p=max_p,
            max_q=max_q,
            max_d=max_d,
            P_candidates=P_candidates,
            D_candidates=D_candidates,
            Q_candidates=Q_candidates,
            fit_method=fit_method,
            maxiter_search=maxiter_search,
            enforce_stationarity=enforce_stationarity,
            enforce_invertibility=enforce_invertibility,
            search_budget_sec=search_budget_sec,
        )

        grid_debug = dbg
        grid_best_aic = best_aic

        # Solo seteamos lo que falte (respetar overrides parciales)
        if order is None:
            order = best_order
        if seasonal_order is None:
            seasonal_order = best_seasonal

        # Si por alguna razón quedó seasonal_m=0, asegure seasonal_order=0
        if not use_seasonal or seasonal_m <= 1:
            seasonal_order = (0, 0, 0, 0)

        # aic estimado de búsqueda
        if np.isfinite(best_aic):
            aic = float(best_aic)

    # Si auto está apagado o no usó two_stage, aplica fallbacks sensatos
    if order is None:
        order = (0, 1, 1)

    if seasonal_order is None:
        if use_seasonal and seasonal_m > 1:
            # default SARIMA simple si no se especificó
            seasonal_order = (0, 1, 1, seasonal_m)
        else:
            seasonal_order = (0, 0, 0, 0)

    # ============================
    # Fit final (converge bien)
    # ============================
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")

            # trend="c" para permitir drift y evitar futuro plano en series con nivel/tendencia
            trend = "c"

            model = SARIMAX(
                y,
                order=order,
                seasonal_order=seasonal_order,
                trend=trend,
                enforce_stationarity=enforce_stationarity,
                enforce_invertibility=enforce_invertibility,
            )

            t0 = time.perf_counter()
            res = model.fit(
                disp=False,
                method=fit_method,
                maxiter=int(maxiter_final),
            )
            fit_sec = float(time.perf_counter() - t0)

        pred_in = res.get_prediction(start=0, end=len(y) - 1).predicted_mean
        pred_in = np.asarray(pred_in, dtype=float)

        fc = res.get_forecast(steps=int(periods)).predicted_mean
        fc = np.asarray(fc, dtype=float)

        last_ds = df_prepared["ds"].iloc[-1]
        future_ds = pd.date_range(last_ds, periods=int(periods) + 1, freq=freq)[1:]

        ds_all = pd.concat([df_prepared["ds"], pd.Series(future_ds)], ignore_index=True)
        yhat_all = np.concatenate([pred_in, fc], axis=0)

        forecast = pd.DataFrame({"ds": ds_all, "yhat": yhat_all})
        forecast["forecast_date"] = forecast_date

        try:
            bic = float(res.bic) if res.bic is not None else None
            if aic is None:
                aic = float(res.aic) if res.aic is not None else None
        except Exception:
            pass

        audit: Dict[str, Any] = {
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
            "fit_method": fit_method,
            "maxiter_search": int(maxiter_search),
            "maxiter_final": int(maxiter_final),
            "fit_sec": float(fit_sec),
        }

        if grid_debug is not None:
            audit["grid_debug"] = grid_debug
        if grid_best_aic is not None and np.isfinite(grid_best_aic):
            audit["grid_best_aic"] = float(grid_best_aic)

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
            "fit_method": fit_method,
            "maxiter_search": int(maxiter_search),
            "maxiter_final": int(maxiter_final),
        }
        if grid_debug is not None:
            audit["grid_debug"] = grid_debug

        return df_prepared, pd.DataFrame(columns=["ds", "yhat"]), audit