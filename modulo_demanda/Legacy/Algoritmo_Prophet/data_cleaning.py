import pandas as pd
import numpy as np

def load_and_clean_data(df_historico):
    """

    Input: 

    - Dataframe con los datos históricos de la demanda.

    Limpieza de los datos históricos en su fromateo de guardado, errores y procesamiento de fechas. 
    Guardado del índice de rango de fechas.

    Output:

    - Dataframe con los datos históricos limpios y en formato correcto.
    - Lista guardada con el rango de fechas de los datos históricos.

    """

    # Arreglar valores numéricos
    df_historico['Cantidad'] = df_historico['Cantidad'].replace({',': '', '\\$': ''}, regex=True)

    # Convertir la columna 'Qty' a numérico
    df_historico['Cantidad'] = pd.to_numeric(df_historico['Cantidad'])

    # Convertir la columna '*StartDate' a formato datetime
    df_historico['Fecha'] = pd.to_datetime(df_historico['Fecha'], format='%d/%m/%Y')

    freq = pd.infer_freq(df_historico['Fecha'].sort_values())

    return df_historico, freq

def completar_fechas(df_filtrado, rango_fechas):
    """
    Completa las fechas faltantes (un rango ya predefinido) y hace FFill.
    Atención: las decisiones de "min_registros" y "% ceros" deben aplicarse
    sobre df_filtrado ORIGINAL, antes de rellenar, para no contar valores inventados.
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
    Si la serie NO está ya en frecuencia semanal (target_freq),
    la agrupamos y sumamos por semana.
    """
    # inferir frecuencia actual
    current_freq = pd.infer_freq(df[on].sort_values())
    if current_freq and current_freq.upper().startswith('W'):
        # ya es semanal: devolvemos sin tocar
        return df, current_freq.upper()
    # si no es semanal, resampleamos a target_freq
    df_sem = (
        df
        .set_index(on)
        .groupby(['Producto','Canal','Ubicacion'])[value_col]
        .resample(target_freq).sum()
        .reset_index()
    )
    return df_sem, target_freq





