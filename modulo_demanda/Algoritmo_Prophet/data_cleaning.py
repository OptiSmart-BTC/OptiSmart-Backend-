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

    rango_fechas = pd.date_range(start=df_historico['Fecha'].min(), end=df_historico['Fecha'].max(), freq='W-MON')

    return df_historico, rango_fechas

def completar_fechas(df_filtrado, rango_fechas):
    """
    Completa las fechas faltantes en un DataFrame de series temporales
    usando el método de Forward Fill para valores faltantes.

    Args:
        df_filtrado (pd.DataFrame): DataFrame de un DFU con ['Fecha', 'Cantidad'].
        rango_fechas (pd.DatetimeIndex): Rango global de fechas.

    Returns:
        pd.DataFrame: DataFrame con las fechas completadas y los valores rellenados.
    """
    # Creación de un dataframe con el rango de fechas completo
    df_completado = pd.DataFrame({'Fecha': rango_fechas})

    # Completar fechas faltantes con NaN
    df_completado = pd.merge(df_completado, df_filtrado, on='Fecha', how='left')

    # Rellenar valores faltantes utilizando el último valor conocido (Forward Fill)
    df_completado['Cantidad'] = df_completado['Cantidad'].fillna(method='ffill')

    return df_completado





