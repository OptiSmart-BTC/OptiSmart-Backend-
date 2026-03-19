import pandas as pd
import numpy as np
from typing import Dict, Tuple


# ----------------------------
# Preparación de datos
# ----------------------------
def data_preparation_tsb(filtered_df: pd.DataFrame) -> pd.DataFrame:
    """
    Mantiene la misma convención que Prophet/Croston:
      Fecha -> ds
      Cantidad -> y
    """
    df = filtered_df[["Fecha", "Cantidad"]].rename(columns={"Fecha": "ds", "Cantidad": "y"}).copy()
    df["ds"] = pd.to_datetime(df["ds"], errors="coerce")
    df["y"] = pd.to_numeric(df["y"], errors="coerce").fillna(0.0)

    df = df.dropna(subset=["ds"]).sort_values("ds").reset_index(drop=True)
    # TSB se define sobre demanda >=0 (tratamos negativos como 0)
    df["y"] = np.where(df["y"] > 0, df["y"], 0.0)

    return df


# ----------------------------
# Fit TSB
# ----------------------------
def _tsb_fit(y: np.ndarray, alpha: float = 0.1, beta: float = 0.1) -> Dict:
    """
    TSB (Teunter–Syntetos–Babai) clásico:

      I_t = 1 si y_t>0, si no 0
      p_t = p_{t-1} + beta*(I_t - p_{t-1})
      z_t = z_{t-1} + alpha*(y_t - z_{t-1})   si I_t=1
            z_{t-1}                           si I_t=0
      yhat_t = p_t * z_t

    Reglas de exclusión (alineado con Croston):
      - min_occurrences = 2 (si <2 ocurrencias -> EXCLUDED)

    Retorna dict con:
      status, yhat_last, z_last, p_last, n_occurrences, error_msg, yhat_hist (np.array)
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
        if n_occ < 2:
            return {
                "status": "EXCLUDED",
                "yhat_last": 0.0,
                "z_last": float(y[idx[0]]) if n_occ == 1 else np.nan,
                "p_last": float(n_occ / n),
                "n_occurrences": n_occ,
                "error_msg": "TSB requiere >=2 ocurrencias",
                "yhat_hist": np.zeros(n, dtype=float),
            }

        # Sanitizar parámetros
        alpha = float(alpha)
        beta = float(beta)
        if not (0.0 < alpha <= 1.0):
            alpha = 0.1
        if not (0.0 < beta <= 1.0):
            beta = 0.1

        # Inicialización robusta:
        # - z: primer positivo
        # - p: frecuencia promedio (ocurrencias / periodos)
        z = float(y[idx[0]])
        p = float(n_occ / n)
        p = max(p, 1e-9)  # evitar 0 exacto

        yhat_hist = np.zeros(n, dtype=float)

        for t in range(n):
            I = 1.0 if y[t] > 0 else 0.0

            # Actualizar probabilidad SIEMPRE
            p = p + beta * (I - p)

            # Actualizar tamaño SOLO si hubo ocurrencia
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
) -> Tuple[pd.DataFrame, Dict]:
    """
    Genera forecast estilo Prophet:
      - input df_tsb con columnas ds,y
      - output forecast con columnas ds,yhat (historia + futuro)
    """
    if df_tsb.empty:
        info = {"status": "EXCLUDED", "yhat_last": 0.0, "error_msg": "Serie vacía"}
        return pd.DataFrame(columns=["ds", "yhat"]), info

    df_tsb = df_tsb.sort_values("ds").reset_index(drop=True)
    y = df_tsb["y"].to_numpy(dtype=float)

    info = _tsb_fit(y, alpha=alpha, beta=beta)

    # Si EXCLUDED/ERROR devolvemos yhat=0 para todo (historia+futuro)
    if info.get("status") != "OK":
        last_ds = df_tsb["ds"].iloc[-1]
        future_ds = pd.date_range(start=last_ds, periods=periods + 1, freq=freq)[1:]
        all_ds = pd.Index(df_tsb["ds"]).append(future_ds)

        forecast = pd.DataFrame({"ds": all_ds, "yhat": 0.0})
        return forecast, info

    # Histórico: yhat dinámico (por el p_t)
    yhat_hist = info["yhat_hist"]

    # Futuro: forecast esperado constante = p_last * z_last
    last_ds = df_tsb["ds"].iloc[-1]
    future_ds = pd.date_range(start=last_ds, periods=periods + 1, freq=freq)[1:]
    yhat_future = np.repeat(float(info["p_last"] * info["z_last"]), len(future_ds))

    all_ds = pd.Index(df_tsb["ds"]).append(future_ds)
    all_yhat = np.concatenate([yhat_hist, yhat_future])

    forecast = pd.DataFrame({"ds": all_ds, "yhat": all_yhat})
    return forecast, info


# ----------------------------
# Helper opcional: formato Mongo futuro
# (si luego quieres usarlo como en croston)
# ----------------------------
def to_mongo_future_format(
    forecast: pd.DataFrame,
    last_observed_date: pd.Timestamp,
    producto: str,
    canal: str,
    ubicacion: str,
    forecast_date: str,
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