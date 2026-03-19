import pandas as pd
import numpy as np
from typing import Dict, Tuple, Optional


# ----------------------------
# Preparación de datos
# ----------------------------
def data_preparation_croston(filtered_df: pd.DataFrame) -> pd.DataFrame:
    """
    Mantiene la misma convención que Prophet:
      Fecha -> ds
      Cantidad -> y
    """
    df = filtered_df[['Fecha', 'Cantidad']].rename(columns={'Fecha': 'ds', 'Cantidad': 'y'}).copy()
    df['ds'] = pd.to_datetime(df['ds'], errors='coerce')
    df['y'] = pd.to_numeric(df['y'], errors='coerce').fillna(0.0)

    # Normalización defensiva:
    # - NaN -> 0
    # - negativos -> 0 (demanda no debe ser negativa)
    df.loc[df['y'] < 0, 'y'] = 0.0

    df = df.sort_values('ds').reset_index(drop=True)
    return df


# ----------------------------
# Núcleo matemático Croston (clásico)
# ----------------------------
def _croston_fit(y: np.ndarray, alpha: float = 0.1) -> Dict:
    """
    Croston clásico con:
      - q1 = t1 + 1 (intervalo desde inicio hasta la primera ocurrencia)
      - min_occurrences = 2 (si <2 ocurrencias -> EXCLUDED)

    Retorna dict con:
      status, yhat, z_last, p_last, n_occurrences, error_msg
    """
    try:
        y = np.asarray(y, dtype=float)
        y = np.where(np.isfinite(y), y, 0.0)
        y = np.where(y > 0, y, 0.0)

        idx = np.flatnonzero(y > 0)
        n_occ = int(len(idx))

        if n_occ < 2:
            return {
                "status": "EXCLUDED",
                "yhat": 0.0,
                "z_last": np.nan,
                "p_last": np.nan,
                "n_occurrences": n_occ,
                "error_msg": "Menos de 2 ocurrencias positivas (Croston requiere >=2)."
            }

        # Demanda en ocurrencias
        demands = y[idx]  # x_i

        # Intervalos entre ocurrencias
        intervals = np.empty(n_occ, dtype=float)
        intervals[0] = float(idx[0] + 1)         # q1 = t1 + 1
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
            "error_msg": ""
        }

    except Exception as e:
        return {
            "status": "ERROR",
            "yhat": 0.0,
            "z_last": np.nan,
            "p_last": np.nan,
            "n_occurrences": 0,
            "error_msg": str(e)
        }


# ----------------------------
# Forecast
# ----------------------------
def make_forecast_croston(
    df_croston: pd.DataFrame,
    periods: int,
    freq: str,
    alpha: float = 0.1
) -> Tuple[pd.DataFrame, Dict]:
    """
    Genera forecast estilo Prophet:
      - input df_croston con columnas ds,y
      - output forecast con columnas ds,yhat (para historia + futuro)
    """
    if df_croston.empty:
        info = {"status": "EXCLUDED", "yhat": 0.0, "error_msg": "Serie vacía"}
        return pd.DataFrame(columns=["ds", "yhat"]), info

    df_croston = df_croston.sort_values("ds").reset_index(drop=True)
    y = df_croston["y"].to_numpy(dtype=float)

    info = _croston_fit(y, alpha=alpha)

    # Construir fechas futuras
    last_ds = df_croston["ds"].max()
    # date_range incluye last_ds si start=last_ds, por eso generamos periods+1 y quitamos el primero
    future_ds = pd.date_range(start=last_ds, periods=periods + 1, freq=freq)[1:]
    all_ds = pd.Index(df_croston["ds"]).append(future_ds)

    forecast = pd.DataFrame({
        "ds": all_ds,
        "yhat": info["yhat"]
    })

    return forecast, info


# ----------------------------
# Helper para convertir a formato Mongo
# ----------------------------
def to_mongo_future_format(
    forecast: pd.DataFrame,
    last_observed_date: pd.Timestamp,
    producto: str,
    canal: str,
    ubicacion: str,
    forecast_date: str
) -> pd.DataFrame:
    """
    Convierte el forecast (ds,yhat) al formato exacto de demand_forecast:
      Producto,Canal,Ubicacion,Fecha,Demanda Predicha,forecast_date
    """
    futuro = forecast[forecast["ds"] > last_observed_date].copy()
    futuro = futuro.rename(columns={"ds": "Fecha", "yhat": "Demanda Predicha"})
    futuro["Producto"] = producto
    futuro["Canal"] = canal
    futuro["Ubicacion"] = ubicacion
    futuro["forecast_date"] = forecast_date
    futuro = futuro[["Producto", "Canal", "Ubicacion", "Fecha", "Demanda Predicha", "forecast_date"]]
    return futuro
