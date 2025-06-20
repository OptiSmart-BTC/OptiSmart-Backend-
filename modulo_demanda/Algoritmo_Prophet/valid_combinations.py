def obtener_combinaciones_validas(df_combinaciones, df, min_registros=100, max_porcentaje_ceros=0.1):
    """
    Función para obtener las combinaciones válidas de DmdUnit, DmdGroup y Loc.
    
    Parámetros:
        df_combinaciones: DataFrame con las combinaciones posibles.
        df: DataFrame original con los datos.
        min_registros: Número mínimo de registros requeridos.
        max_porcentaje_ceros: Máximo porcentaje de ceros permitido en la columna 'Qty'.

    Retorna:
        combinaciones_validas: Lista de combinaciones que cumplen con los requisitos.
    """
    combinaciones_validas = []

    # Iterar sobre cada combinación de DmdUnit, DmdGroup, y Loc
    for index, row in df_combinaciones.iterrows():
        dmd_unit = row['Producto']
        dmd_group = row['Canal']
        loc = row['Ubicacion']

        # Filtrar los datos del DataFrame original para esta combinación
        filtered_df = df[(df['Producto'] == dmd_unit) & 
                         (df['Canal'] == dmd_group) & 
                         (df['Ubicacion'] == loc)]

        # 1. Verificar si hay registros suficientes
        if filtered_df.shape[0] < min_registros:
            print(f"Combinación {dmd_unit}-{dmd_group}-{loc} descartada por tener menos de {min_registros} registros.")
            continue

        # 2. Verificar si hay datos nulos
        if filtered_df.isnull().sum().sum() > 0:
            print(f"Combinación {dmd_unit}-{dmd_group}-{loc} descartada por contener valores nulos.")
            continue

        # 3. Verificar el porcentaje de ceros en la demanda ('Qty')
        porcentaje_ceros = (filtered_df['Cantidad'] == 0).mean()
        if porcentaje_ceros > max_porcentaje_ceros:
            print(f"Combinación {dmd_unit}-{dmd_group}-{loc} descartada por tener más del {max_porcentaje_ceros*100}% de ceros.")
            continue

        # Si todos los criterios se cumplen, agregar a la lista de combinaciones válidas
        combinaciones_validas.append((dmd_unit, dmd_group, loc))

    # Devolver las combinaciones válidas
    print(f"Total de combinaciones válidas: {len(combinaciones_validas)}")
    return combinaciones_validas
