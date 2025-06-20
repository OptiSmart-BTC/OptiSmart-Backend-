import itertools
import pandas as pd

def generate_combinations(df):

    """Esta función su objetivo es generar una dataframe con todas las combinaciones posibles
    del archivo de demanda subido, cada combinación se consta de un producto, canal y locación
    de venta
    
    Parametros:
    - El dataframe ya arreglado con las columnas necesarias
    
    Salida:
    - Un dataframe con todas las combinaciones posibles"""
    
    dmd_units = df['Producto'].unique()
    dmd_groups = df['Canal'].unique()
    locs = df['Ubicacion'].unique()

    combinaciones = list(itertools.product(dmd_units, dmd_groups, locs))
    df_combinaciones = pd.DataFrame(combinaciones, columns=['Producto', 'Canal', 'Ubicacion'])
    
    return df_combinaciones
