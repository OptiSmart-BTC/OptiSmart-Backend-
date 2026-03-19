import pandas as pd
import numpy as np
from typing import Dict, Tuple, Optional, Any


# ----------------------------
# Preparación de datos
# ----------------------------
def data_preparation_croston(filtered_df: pd.DataFrame) -> pd.DataFrame:
    """
    Mantiene la misma convención que Prophet:
      Fecha -> ds
      Cantidad -> y
    """
    if filtered_df is None or filtered_df.empty:
        return pd.DataFrame(columns=["ds", "y"])

    df = filtered_df[["Fecha", "Cantidad"]].rename(columns={"Fecha": "ds", "Cantidad": "y"}).copy()
    df["ds"] = pd.to_datetime(df["ds"], errors="coerce")
    df["y"] = pd.to_numeric(df["y"], errors="coerce").fillna(0.0)

    # Normalización defensiva:
    df = df.dropna(subset=["ds"]).sort_values("ds")
    df["y"] = np.where(df["y"] > 0, df["y"], 0.0)

    # Quitar duplicados por ds (por seguridad)
    df = df.groupby("ds", as_index=False)["y"].sum().sort_values("ds").reset_index(drop=True)
    return df


# ----------------------------
# Núcleo matemático Croston (clásico)
# ----------------------------
def _croston_fit(y: np.ndarray, alpha: float = 0.1, min_occurrences: int = 2) -> Dict[str, Any]:
    """
    Croston clásico con:
      - q1 = t1 + 1 (intervalo desde inicio hasta la primera ocurrencia)
      - min_occurrences (default 2)

    Retorna dict con:
      status, yhat, z_last, p_last, n_occurrences, error_msg
    """
    try:
        y = np.asarray(y, dtype=float)
        y = np.where(np.isfinite(y), y, 0.0)
        y = np.where(y > 0, y, 0.0)

        # Sanitizar alpha
        alpha = float(alpha)
        if not (0.0 < alpha <= 1.0):
            alpha = 0.1

        min_occurrences = int(min_occurrences) if min_occurrences is not None else 2
        if min_occurrences < 1:
            min_occurrences = 1

        idx = np.flatnonzero(y > 0)
        n_occ = int(len(idx))

        if n_occ < min_occurrences:
            return {
                "status": "EXCLUDED",
                "yhat": 0.0,
                "z_last": np.nan,
                "p_last": np.nan,
                "n_occurrences": n_occ,
                "error_msg": f"Menos de {min_occurrences} ocurrencias positivas (Croston requiere >={min_occurrences}).",
                "alpha": alpha,
                "min_occurrences": min_occurrences,
            }

        # Demanda en ocurrencias
        demands = y[idx]  # x_i

        # Intervalos entre ocurrencias
        intervals = np.empty(n_occ, dtype=float)
        intervals[0] = float(idx[0] + 1)          # q1 = t1 + 1
        intervals[1:] = np.diff(idx).astype(float)

        # Inicialización
        z = float(demands[0])
        p = float(intervals[0])

        # Suavizado exponencial sobre z y p
        for d, q in zip(demands[1:], intervals[1:]):
            z = alpha * float(d) + (1.0 - alpha) * z
            p = alpha * float(q) + (1.0 - alpha) * p

        yhat = (z / p) if p > 0 else 0.0

        return {
            "status": "OK",
            "yhat": float(yhat),
            "z_last": float(z),
            "p_last": float(p),
            "n_occurrences": n_occ,
            "error_msg": "",
            "alpha": alpha,
            "min_occurrences": min_occurrences,
        }

    except Exception as e:
        return {
            "status": "ERROR",
            "yhat": 0.0,
            "z_last": np.nan,
            "p_last": np.nan,
            "n_occurrences": 0,
            "error_msg": str(e),
            "alpha": alpha,
            "min_occurrences": min_occurrences,
        }


# ----------------------------
# Forecast
# ----------------------------
def make_forecast_croston(
    df_croston: pd.DataFrame,
    periods: int,
    freq: str,
    alpha: float = 0.1,
    min_occurrences: int = 2,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Genera forecast estilo Prophet:
      - input df_croston con columnas ds,y
      - output forecast con columnas ds,yhat (para historia + futuro)
    """
    if df_croston is None or df_croston.empty:
        info = {"status": "EXCLUDED", "yhat": 0.0, "error_msg": "Serie vacía"}
        return pd.DataFrame(columns=["ds", "yhat"]), info

    df_croston = df_croston.sort_values("ds").reset_index(drop=True)
    y = df_croston["y"].to_numpy(dtype=float)

    info = _croston_fit(y, alpha=alpha, min_occurrences=min_occurrences)

    # Construir fechas futuras
    last_ds = df_croston["ds"].max()
    future_ds = pd.date_range(start=last_ds, periods=int(periods) + 1, freq=freq)[1:]
    all_ds = pd.Index(df_croston["ds"]).append(future_ds)

    # Si EXCLUDED/ERROR, mantenemos yhat=0 (o el yhat calculado, pero status decide)
    yhat_value = float(info.get("yhat", 0.0)) if info.get("status") == "OK" else 0.0

    forecast = pd.DataFrame({
        "ds": all_ds,
        "yhat": yhat_value
    })

    return forecast, info


# ----------------------------
# Runner estándar para pipeline_forecast (opcional, pero recomendado)
# ----------------------------
def run_forecast(
    filtered_df: pd.DataFrame,
    freq: str,
    periods: int,
    forecast_date: str,
    model_params: Optional[Dict[str, Any]] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
    """
    API estándar: (df_prepared, forecast, audit)
    """
    params = model_params or {}

    alpha = float(params.get("alpha", 0.1))
    min_occ = int(params.get("min_occurrences", 2))

    df_c = data_preparation_croston(filtered_df)
    forecast, info = make_forecast_croston(df_c, periods=periods, freq=freq, alpha=alpha, min_occurrences=min_occ)
    forecast["forecast_date"] = forecast_date

    audit = {
        "modelo_usado": "croston",
        "status": info.get("status", "OK"),
        "error_msg": info.get("error_msg", ""),
        "alpha": info.get("alpha", alpha),
        "min_occurrences": info.get("min_occurrences", min_occ),
        "n_occurrences": info.get("n_occurrences", None),
        "z_last": info.get("z_last", None),
        "p_last": info.get("p_last", None),
    }
    return df_c, forecast, audit


# ----------------------------
# Helper para convertir a formato Mongo (sin cambios)
# ----------------------------
def to_mongo_future_format(
    forecast: pd.DataFrame,
    last_observed_date: pd.Timestamp,
    producto: str,
    canal: str,
    ubicacion: str,
    forecast_date: str
) -> pd.DataFrame:
    futuro = forecast[forecast["ds"] > last_observed_date].copy()
    futuro = futuro.rename(columns={"ds": "Fecha", "yhat": "Demanda Predicha"})
    futuro["Producto"] = producto
    futuro["Canal"] = canal
    futuro["Ubicacion"] = ubicacion
    futuro["forecast_date"] = forecast_date
    futuro = futuro[["Producto", "Canal", "Ubicacion", "Fecha", "Demanda Predicha", "forecast_date"]]
    return futuro