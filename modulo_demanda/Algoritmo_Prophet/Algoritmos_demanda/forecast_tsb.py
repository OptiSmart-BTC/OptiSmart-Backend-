import pandas as pd
import numpy as np
from typing import Dict, Tuple, Any, Optional


# ----------------------------
# Preparación de datos
# ----------------------------
def data_preparation_tsb(filtered_df: pd.DataFrame) -> pd.DataFrame:
    """
    Convención:
      Fecha -> ds
      Cantidad -> y
    """
    if filtered_df is None or filtered_df.empty:
        return pd.DataFrame(columns=["ds", "y"])

    df = filtered_df[["Fecha", "Cantidad"]].rename(columns={"Fecha": "ds", "Cantidad": "y"}).copy()
    df["ds"] = pd.to_datetime(df["ds"], errors="coerce")
    df["y"] = pd.to_numeric(df["y"], errors="coerce").fillna(0.0)

    df = df.dropna(subset=["ds"]).sort_values("ds").reset_index(drop=True)
    df["y"] = np.where(df["y"] > 0, df["y"], 0.0)

    # Quitar duplicados por ds (por seguridad)
    df = df.groupby("ds", as_index=False)["y"].sum().sort_values("ds").reset_index(drop=True)
    return df


# ----------------------------
# Fit TSB
# ----------------------------
def _tsb_fit(y: np.ndarray, alpha: float = 0.1, beta: float = 0.1, min_occurrences: int = 2) -> Dict[str, Any]:
    """
    TSB clásico.
    Reglas de exclusión:
      - min_occurrences (default 2)
    """
    try:
        y = np.asarray(y, dtype=float)
        y = np.where(np.isfinite(y), y, 0.0)
        y = np.where(y > 0, y, 0.0)

        n = int(len(y))
        if n == 0:
            return {
                "status": "EXCLUDED",
                "yhat_last": 0.0,
                "z_last": np.nan,
                "p_last": np.nan,
                "n_occurrences": 0,
                "error_msg": "Serie vacía",
                "yhat_hist": np.array([], dtype=float),
            }

        idx = np.flatnonzero(y > 0)
        n_occ = int(len(idx))

        min_occurrences = int(min_occurrences) if min_occurrences is not None else 2
        if min_occurrences < 1:
            min_occurrences = 1

        if n_occ < min_occurrences:
            return {
                "status": "EXCLUDED",
                "yhat_last": 0.0,
                "z_last": float(y[idx[0]]) if n_occ == 1 else np.nan,
                "p_last": float(n_occ / n) if n > 0 else np.nan,
                "n_occurrences": n_occ,
                "error_msg": f"TSB requiere >={min_occurrences} ocurrencias",
                "yhat_hist": np.zeros(n, dtype=float),
            }

        # Sanitizar parámetros
        alpha = float(alpha)
        beta = float(beta)
        if not (0.0 < alpha <= 1.0):
            alpha = 0.1
        if not (0.0 < beta <= 1.0):
            beta = 0.1

        # Inicialización
        z = float(y[idx[0]])
        p = float(n_occ / n)
        p = max(p, 1e-9)

        yhat_hist = np.zeros(n, dtype=float)

        for t in range(n):
            I = 1.0 if y[t] > 0 else 0.0
            p = p + beta * (I - p)
            if I == 1.0:
                z = z + alpha * (y[t] - z)
            yhat_hist[t] = p * z

        return {
            "status": "OK",
            "yhat_last": float(yhat_hist[-1]),
            "z_last": float(z),
            "p_last": float(p),
            "n_occurrences": n_occ,
            "error_msg": "",
            "yhat_hist": yhat_hist,
            "alpha": alpha,
            "beta": beta,
            "min_occurrences": min_occurrences,
        }

    except Exception as e:
        return {
            "status": "ERROR",
            "yhat_last": 0.0,
            "z_last": np.nan,
            "p_last": np.nan,
            "n_occurrences": 0,
            "error_msg": str(e),
            "yhat_hist": np.array([], dtype=float),
        }


# ----------------------------
# Forecast
# ----------------------------
def make_forecast_tsb(
    df_tsb: pd.DataFrame,
    periods: int,
    freq: str,
    alpha: float = 0.1,
    beta: float = 0.1,
    min_occurrences: int = 2,
    future_strategy: str = "constant",  # "constant" (default) o "last"
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    - output forecast con columnas ds,yhat (historia + futuro)
    """
    if df_tsb is None or df_tsb.empty:
        info = {"status": "EXCLUDED", "yhat_last": 0.0, "error_msg": "Serie vacía"}
        return pd.DataFrame(columns=["ds", "yhat"]), info

    df_tsb = df_tsb.sort_values("ds").reset_index(drop=True)
    y = df_tsb["y"].to_numpy(dtype=float)

    info = _tsb_fit(y, alpha=alpha, beta=beta, min_occurrences=min_occurrences)

    last_ds = df_tsb["ds"].iloc[-1]
    future_ds = pd.date_range(start=last_ds, periods=int(periods) + 1, freq=freq)[1:]
    all_ds = pd.Index(df_tsb["ds"]).append(future_ds)

    if info.get("status") != "OK":
        forecast = pd.DataFrame({"ds": all_ds, "yhat": 0.0})
        return forecast, info

    # Histórico
    yhat_hist = np.asarray(info["yhat_hist"], dtype=float)

    # Futuro
    if (future_strategy or "").lower() == "last":
        last_val = float(yhat_hist[-1]) if len(yhat_hist) else float(info["p_last"] * info["z_last"])
        yhat_future = np.repeat(last_val, len(future_ds))
    else:
        # constante esperado
        yhat_future = np.repeat(float(info["p_last"] * info["z_last"]), len(future_ds))

    all_yhat = np.concatenate([yhat_hist, yhat_future])
    forecast = pd.DataFrame({"ds": all_ds, "yhat": all_yhat})
    return forecast, info


# ----------------------------
# Runner estándar para pipeline_forecast
# ----------------------------
def run_forecast(
    filtered_df: pd.DataFrame,
    freq: str,
    periods: int,
    forecast_date: str,
    model_params: Optional[Dict[str, Any]] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
    params = model_params or {}

    alpha = float(params.get("alpha", 0.1))
    beta = float(params.get("beta", 0.1))
    min_occ = int(params.get("min_occurrences", 2))
    future_strategy = str(params.get("future_strategy", "constant"))

    df_t = data_preparation_tsb(filtered_df)
    forecast, info = make_forecast_tsb(
        df_t, periods=periods, freq=freq,
        alpha=alpha, beta=beta,
        min_occurrences=min_occ,
        future_strategy=future_strategy,
    )
    forecast["forecast_date"] = forecast_date

    audit = {
        "modelo_usado": "tsb",
        "status": info.get("status", "OK"),
        "error_msg": info.get("error_msg", ""),
        "alpha": info.get("alpha", alpha),
        "beta": info.get("beta", beta),
        "min_occurrences": info.get("min_occurrences", min_occ),
        "future_strategy": future_strategy,
        "n_occurrences": info.get("n_occurrences", None),
        "z_last": info.get("z_last", None),
        "p_last": info.get("p_last", None),
    }
    return df_t, forecast, audit


# ----------------------------
# Helper opcional: formato Mongo futuro
# ----------------------------
def to_mongo_future_format(
    forecast: pd.DataFrame,
    last_observed_date: pd.Timestamp,
    producto: str,
    canal: str,
    ubicacion: str,
    forecast_date: str,
) -> pd.DataFrame:
    futuro = forecast[forecast["ds"] > last_observed_date].copy()
    futuro = futuro.rename(columns={"ds": "Fecha", "yhat": "Demanda Predicha"})
    futuro["Producto"] = producto
    futuro["Canal"] = canal
    futuro["Ubicacion"] = ubicacion
    futuro["forecast_date"] = forecast_date
    futuro = futuro[["Producto", "Canal", "Ubicacion", "Fecha", "Demanda Predicha", "forecast_date"]]
    return futuro