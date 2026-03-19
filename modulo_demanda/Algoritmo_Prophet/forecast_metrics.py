import pandas as pd
import numpy as np

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
