import sys
import pandas as pd
import numpy as np
import json
from pymongo import MongoClient
from datetime import datetime
import logging
from logging.handlers import RotatingFileHandler
import os
import math

# -------------------------
# Logging: solo a archivo (INFO), en la misma carpeta
# -------------------------
def _setup_logging_local():
    """
    Logging SOLO a archivo, en la misma carpeta del ejecutable:
      ./clasificador_demanda.log
    Nivel: INFO.
    Sin salida a consola.
    """
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    log_path = os.path.join(script_dir, "clasificador_demanda.log")

    fh = RotatingFileHandler(log_path, maxBytes=5_000_000, backupCount=3, encoding="utf-8")
    fh.setLevel(logging.INFO)
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    logging.info(f"[LOG INIT] Archivo: {log_path}")

# -------------------------
# Utilidades
# -------------------------
def _fmt_num(x):
    """Formatea números con 4 decimales; NaN/None como 'NaN'."""
    try:
        if x is None or (isinstance(x, float) and math.isnan(x)):
            return "NaN"
        return f"{float(x):.4f}"
    except Exception:
        return str(x)

# -------------------------
# Métricas y clasificación
# -------------------------
def calculate_sbc_metrics(series):
    """
    Calcula ADI y CV² para una serie temporal
    """
    positive_demand = series[series > 0]

    if len(positive_demand) <= 1:
        return {'ADI': np.nan, 'CV2': np.nan}

    adi = len(series) / len(positive_demand)  # ADI = total periodos / periodos > 0
    cv2 = (np.std(positive_demand) / np.mean(positive_demand)) ** 2
    return {'ADI': adi, 'CV2': cv2}

def classify_sbc(adi, cv2):
    """
    Clasifica la serie temporal según SBC
    """
    adi_threshold = 1.32
    cv2_threshold = 0.49

    if pd.isna(adi) or pd.isna(cv2):
        return 'Lumpy/Irregular'  # fallback consistente

    if adi < adi_threshold:
        if cv2 < cv2_threshold:
            return 'Suave'
        else:
            return 'Errática'
    else:
        if cv2 < cv2_threshold:
            return 'Intermitente'
        else:
            return 'Lumpy/Irregular'

# -------------------------
# Detección mensual (opcional)
# -------------------------
def _is_monthly_frequency(fechas: pd.Series) -> bool:
    """
    Determina si la serie de fechas es mensual (calendario) usando infer_freq y una heurística simple:
    - Acepta variantes: 'MS', 'M', 'BMS', 'BM'
    - Heurística: todas las fechas son día 1 y las diferencias están entre 28 y 31 días mayormente.
    """
    fechas = fechas.sort_values()
    inferred = None
    try:
        inferred = pd.infer_freq(fechas)
    except Exception:
        inferred = None

    if inferred in ('MS', 'M', 'BMS', 'BM'):
        return True

    if inferred is None:
        if len(fechas) >= 2:
            day_is_first = (fechas.dt.day == 1).all()
            diffs = fechas.diff().dt.days.dropna()
            if len(diffs) > 0:
                prop_in_month_window = (diffs.between(28, 31)).mean()
                if day_is_first and prop_in_month_window >= 0.8:
                    return True
    return False

# -------------------------
# Análisis principal
# -------------------------
def analyze_demand_patterns(df):
    """
    Analiza patrones de demanda para cada combinación única de producto-canal-ubicación
    """
    # (Mantengo tu parseo original)
    df['Fecha'] = pd.to_datetime(df['Fecha'])

    # Clave DFU
    df['series_key'] = df['Producto'] + '_' + df['Canal'] + '_' + df['Ubicacion']

    # Timestamp único para toda la corrida
    process_ts = datetime.now()

    # DFUs únicos
    unique_series = df['series_key'].unique()
    total_series = len(unique_series)
    logging.info(f"DFUs únicos detectados: {total_series}")

    # Stats de puntos por DFU (antes de reindex)
    dfu_counts_desc = df.groupby('series_key')['Cantidad'].size().describe()
    logging.info(f"Stats de puntos por DFU (antes de reindex):\n{dfu_counts_desc}")

    results = []

    logging.info("Iniciando análisis DFU por DFU...")
    for idx, series_key in enumerate(unique_series, start=1):
        series_data = df[df['series_key'] == series_key].sort_values('Fecha')

        if len(series_data) < 4:
            logging.info(f"[{idx}/{total_series}] DFU={series_key} -> SKIP (<4 puntos)")
            continue

        fechas = series_data['Fecha'].sort_values()
        is_monthly = _is_monthly_frequency(fechas)

        # Reindexado según ruta detectada
        if is_monthly:
            start = fechas.min().to_period('M').to_timestamp()  # inicio de mes
            end   = fechas.max().to_period('M').to_timestamp()
            idx_range = pd.date_range(start=start, end=end, freq='MS')

            complete_series = (
                series_data.set_index('Fecha')['Cantidad']
                .resample('MS').sum()
                .reindex(idx_range, fill_value=0)
            )
        else:
            date_diffs = series_data['Fecha'].diff().dropna()
            if len(date_diffs) == 0:
                avg_interval = 7
            else:
                avg_interval = int(round(date_diffs.mean().days))
                if avg_interval < 1:
                    avg_interval = 7

            min_date = series_data['Fecha'].min()
            max_date = series_data['Fecha'].max()
            full_date_range = pd.date_range(start=min_date, end=max_date, freq=f'{avg_interval}D')

            complete_series = (
                series_data.set_index('Fecha')
                .reindex(full_date_range, fill_value=0)['Cantidad']
            )

        # ✅ NUEVO: % ceros y puntos (sobre serie completa / reindexada)
        porcentaje_ceros = float((complete_series == 0).mean())
        data_points_complete = int(len(complete_series))
        data_points_raw = int(len(series_data))

        # Métricas + categoría (sobre serie completa)
        metrics = calculate_sbc_metrics(complete_series)
        category = classify_sbc(metrics['ADI'], metrics['CV2'])

        # Línea única por DFU (como pediste), con ADI/CV2/Category + %ceros
        logging.info(
            f"[{idx}/{total_series}] DFU={series_key} | "
            f"puntos_raw={data_points_raw} puntos_complete={data_points_complete} | "
            f"%ceros={porcentaje_ceros:.4f} | "
            f"min={fechas.min().date()} max={fechas.max().date()} | "
            f"mensual={is_monthly} | "
            f"ADI={_fmt_num(metrics['ADI'])} | "
            f"CV2={_fmt_num(metrics['CV2'])} | "
            f"Category={category}"
        )

        first_record = series_data.iloc[0]
        results.append({
            'Producto': first_record['Producto'],
            'Canal': first_record['Canal'],
            'Ubicacion': first_record['Ubicacion'],
            'ADI': metrics['ADI'],
            'CV2': metrics['CV2'],
            'Category': category,

            # ✅ Para filtros del Manual (y trazabilidad)
            'Data_Points': data_points_complete,     # consistente con serie completa
            'Raw_Data_Points': data_points_raw,      # original (informativo)
            'Porcentaje_Ceros': porcentaje_ceros,    # <-- NUEVO

            'fecha_clasificacion': process_ts
        })

    results_df = pd.DataFrame(results)

    if not results_df.empty:
        freq_summary = results_df['Category'].value_counts(dropna=False)
        logging.info(f"Resumen categorías: {freq_summary.to_dict()}")
    else:
        logging.warning("No se generaron resultados (posiblemente todas las series tenían <4 puntos).")

    return results_df

# -------------------------
# Recomendaciones por categoría
# -------------------------
def get_model_recommendations(category):
    recommendations = {
        'Suave': ['Prophet','Arima'],
        'Errática': ['Arima','Prophet'],
        'Intermitente': ['TSB (Teunter-Syntetos-Babai)','Croston'],
        'Lumpy/Irregular': ['TSB (Teunter-Syntetos-Babai)','Croston']
    }
    return recommendations.get(category, [])

# -------------------------
# Main
# -------------------------
def main():
    if len(sys.argv) < 5:
        _setup_logging_local()  # asegura logger si sales temprano
        logging.error("Error: Faltan argumentos.")
        logging.error("Uso: python ejecutable_clasificador.py <dbName> <userCollection> <resultCollection> <mongoUrl>")
        sys.exit(1)

    _setup_logging_local()

    db_name = sys.argv[1]
    user_collection = sys.argv[2]
    result_collection = sys.argv[3]
    mongo_url = sys.argv[4]

    try:
        logging.info(f"Conectando a MongoDB en {db_name}...")
        client = MongoClient(mongo_url)
        db = client[db_name]

        logging.info(f"Cargando datos desde la colección {user_collection}...")
        data = list(db[user_collection].find({}))
        if not data:
            logging.error("No se encontraron datos en la colección.")
            sys.exit(1)

        df = pd.DataFrame(data)
        logging.info(f"Registros cargados: {len(df)} | Columnas: {list(df.columns)}")

        required_columns = ['Producto', 'Canal', 'Ubicacion', 'Fecha', 'Cantidad']
        for col in required_columns:
            if col not in df.columns:
                logging.error(f"Columna requerida faltante: '{col}'")
                sys.exit(1)

        logging.info("Analizando patrones de demanda (DFUs)...")
        categorized_df = analyze_demand_patterns(df)

        if not categorized_df.empty:
            categorized_df['recommended_models'] = categorized_df['Category'].apply(get_model_recommendations)
        else:
            categorized_df['recommended_models'] = []

        category_summary = categorized_df['Category'].value_counts().to_dict() if not categorized_df.empty else {}
        logging.info(f"Resumen de clasificación: {category_summary}")

        process_ts = categorized_df['fecha_clasificacion'].iloc[0] if len(categorized_df) else datetime.now()
        metadata = {
            'processed_records': len(df),
            'classified_series': len(categorized_df),
            'summary': category_summary,
            'process_date': process_ts
        }

        logging.info("Guardando metadatos en 'clasificacion_demanda_metadata' (limpieza previa)...")
        db["clasificacion_demanda_metadata"].delete_many({})
        db["clasificacion_demanda_metadata"].insert_one(metadata)

        logging.info(f"Guardando {len(categorized_df)} resultados en {result_collection} (limpieza previa)...")
        db[result_collection].delete_many({})
        if len(categorized_df):
            results_to_insert = json.loads(categorized_df.to_json(orient='records', date_format='iso'))
            db[result_collection].insert_many(results_to_insert)

        logging.info("Proceso de clasificación completado exitosamente.")

    except Exception as e:
        logging.exception(f"Error en el proceso: {str(e)}")
        sys.exit(1)
    finally:
        if 'client' in locals():
            client.close()

if __name__ == "__main__":
    main()
