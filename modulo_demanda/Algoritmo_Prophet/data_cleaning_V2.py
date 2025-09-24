import pandas as pd
import numpy as np

def _infer_freq_by_gaps(fecha_series: pd.Series) -> str:
    """
    Inferencia robusta de frecuencia a partir de los gaps de fechas.
    - MS si la mediana del gap > 25 días
    - W-MON si la mediana del gap ∈ [5, 9] días
    - D en otros casos (por defecto)
    """
    s = fecha_series.dropna().sort_values().unique()
    if len(s) < 3:
        return "D"
    gaps = pd.Series(s[1:]) - pd.Series(s[:-1])
    med_days = gaps.dt.days.median()
    if med_days is None or np.isnan(med_days):
        return "D"
    if med_days > 25:
        return "MS"       # mensual (inicio de mes)
    if 5 <= med_days <= 9:
        return "W-MON"    # semanal (lunes)
    return "D"            # diario (fallback)

def load_and_clean_data(df_historico):
    """
    Limpieza y tipificación de columnas base + inferencia de frecuencia global.
    """
    # Numerifica 'Cantidad'
    df_historico['Cantidad'] = (
        df_historico['Cantidad']
        .replace({',': '', r'\$': ''}, regex=True)
        .astype(float)
    )

    # Fecha a datetime (formato dd/mm/yyyy)
    df_historico['Fecha'] = pd.to_datetime(df_historico['Fecha'], format='%d/%m/%Y', errors='coerce')

    # Sanidad básica
    df_historico = df_historico.dropna(subset=['Fecha']).copy()
    df_historico = df_historico.sort_values('Fecha')

    # Intento 1: pandas infer_freq sobre TODAS las fechas (puede fallar con múltiples series)
    freq = pd.infer_freq(df_historico['Fecha'].drop_duplicates().sort_values())

    # Fallback robusto si infer_freq devuelve None
    if not freq:
        freq = _infer_freq_by_gaps(df_historico['Fecha'])

    # Normaliza strings
    freq = freq.upper() if isinstance(freq, str) else 'D'
    if freq.startswith('W'):
        freq = 'W-MON'
    if freq.startswith('M'):
        freq = 'MS'

    return df_historico, freq

def completar_fechas(df_filtrado, rango_fechas):
    """
    Completa el rango ya definido y hace FFill de 'Cantidad'.
    (El filtrado por min_registros y %ceros debe hacerse ANTES, sobre datos originales resampleados.)
    """
    df_full = pd.DataFrame({'Fecha': rango_fechas})
    df_merge = (
        df_full
        .merge(df_filtrado, on='Fecha', how='left')
        .sort_values('Fecha')
    )
    df_merge['Cantidad'] = df_merge['Cantidad'].fillna(method='ffill')
    return df_merge

def resample_if_not_weekly(df, on='Fecha', value_col='Cantidad', target_freq='W-MON'):
    """
    **ACTUALIZADO**: ahora preserva MENSUAL si la serie lo es (MS).
    - Si es semanal → regresa igual y reporta 'W-MON'
    - Si es mensual → regresa mensual (MS)
    - En otros casos → convierte a semanal (W-MON)
    """
    # OJO: el df trae múltiples combinaciones; inferimos sobre todas las fechas.
    current_freq = pd.infer_freq(df[on].drop_duplicates().sort_values())
    if not current_freq:
        current_freq = _infer_freq_by_gaps(df[on])

    current_freq = current_freq.upper() if isinstance(current_freq, str) else ''
    if current_freq.startswith('W'):
        return df, 'W-MON'
    if current_freq.startswith('M') or current_freq == 'MS':
        # Preservar MENSUAL: agregación a inicio de mes
        df_mon = (
            df.set_index(on)
              .groupby(['Producto','Canal','Ubicacion'])[value_col]
              .resample('MS').sum()
              .reset_index()
        )
        return df_mon, 'MS'

    # Default: semanal
    df_sem = (
        df.set_index(on)
          .groupby(['Producto','Canal','Ubicacion'])[value_col]
          .resample(target_freq).sum()
          .reset_index()
    )
    return df_sem, 'W-MON'