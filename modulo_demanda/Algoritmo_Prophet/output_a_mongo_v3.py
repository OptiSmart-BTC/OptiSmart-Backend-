from pymongo import MongoClient
import pandas as pd
import sys
import os

# usar normalización central del router
from forecast_router import normalize_model_name


def obtener_datos_desde_mongo(mongo_uri, db_name, collection_name):
    """Conectarse a MongoDB y obtener los datos históricos."""
    client = MongoClient(mongo_uri)
    db = client[db_name]

    collection = db[collection_name]
    data = list(collection.find())
    df_historico = pd.DataFrame(data)
    return df_historico, db


def limpiar_versiones_antiguas(db, max_versions=4):
    """Eliminar corridas antiguas completas en demand_forecast, manteniendo solo las últimas max_versions."""
    collection = db.demand_forecast

    combinaciones = collection.aggregate([
        {
            "$group": {
                "_id": {
                    "Producto": "$Producto",
                    "Canal": "$Canal",
                    "Ubicacion": "$Ubicacion"
                },
                "forecast_dates": {"$addToSet": "$forecast_date"},
            }
        }
    ])

    for combinacion in combinaciones:
        forecast_dates = sorted(combinacion["forecast_dates"])

        if len(forecast_dates) > max_versions:
            fechas_a_eliminar = forecast_dates[:len(forecast_dates) - max_versions]

            collection.delete_many({
                "Producto": combinacion["_id"]["Producto"],
                "Canal": combinacion["_id"]["Canal"],
                "Ubicacion": combinacion["_id"]["Ubicacion"],
                "forecast_date": {"$in": fechas_a_eliminar}
            })

            print(
                f"Eliminadas {len(fechas_a_eliminar)} corridas antiguas para la combinación: {combinacion['_id']}"
            )


def subir_demand_forecast(datos_futuros_mongo_df, db):
    """Sube resultados a demand_forecast (historical+future) y limpia versiones antiguas."""
    if datos_futuros_mongo_df is None or datos_futuros_mongo_df.empty:
        print("Sin registros para insertar en demand_forecast. No se insertó nada.")
        return

    # asegurar fechas como datetime nativo
    df = datos_futuros_mongo_df.copy()
    if "Fecha" in df.columns:
        df["Fecha"] = pd.to_datetime(df["Fecha"])

    # Compat: si no viene tipo, asumimos "future"
    if "tipo" not in df.columns:
        df["tipo"] = "future"
    # Compat: si no viene Demanda Real, dejarla en None
    if "Demanda Real" not in df.columns:
        df["Demanda Real"] = None

    data_dict = df.to_dict("records")
    if not data_dict:
        print("Sin registros para insertar en demand_forecast. No se insertó nada.")
        return

    db.demand_forecast.insert_many(data_dict)
    limpiar_versiones_antiguas(db)


def subir_metricas(df_metricas, db):
    """Sube métricas a metricas_resultados."""
    if df_metricas is None or df_metricas.empty:
        print("Sin registros para insertar en metricas_resultados. No se insertó nada.")
        return

    data_dict = df_metricas.to_dict("records")
    if not data_dict:
        print("Sin registros para insertar en metricas_resultados. No se insertó nada.")
        return

    db.metricas_resultados.insert_many(data_dict)


# ----------------------------
# Router helpers (AUTO/MANUAL)
# ----------------------------
def _infer_appuser_from_collection(collection_name: str) -> str:
    """
    collection_name típico: historico_demanda_{appuser}
    """
    prefix = "historico_demanda_"
    if collection_name.startswith(prefix):
        return collection_name[len(prefix):]
    return ""


def _pick_classification_collection(db, appuser: str) -> str:
    """
    Intenta encontrar la colección donde guardas clasificación + recommended_models.
    Prioridad:
      1) clasificacion_demanda_user
      2) clasificacion_demanda_{appuser}
      3) clasificacion_demanda
    """
    existing = set(db.list_collection_names())
    candidates = ["clasificacion_demanda_user"]
    if appuser:
        candidates.append(f"clasificacion_demanda_{appuser}")
    candidates.append("clasificacion_demanda")

    for c in candidates:
        if c in existing:
            return c
    return ""


def _load_recommendations_map(db, collection_name_hist: str):
    """
    Lee la colección de clasificación y construye un map:
      key: "Producto|Canal|Ubicacion"
      val: ["croston","tsb",...]
    """
    appuser = _infer_appuser_from_collection(collection_name_hist)
    coll_name = _pick_classification_collection(db, appuser)

    if not coll_name:
        print("[ROUTER] No se encontró colección de clasificación (recommended_models). Usando fallback global.")
        return {}, ""

    coll = db[coll_name]
    cursor = coll.find(
        {},
        {
            "_id": 0,
            "Producto": 1,
            "Canal": 1,
            "Ubicacion": 1,
            "recommended_models": 1
        }
    )

    rec_map = {}
    n = 0
    for doc in cursor:
        prod = doc.get("Producto")
        canal = doc.get("Canal")
        ubic = doc.get("Ubicacion")
        if not (prod and canal and ubic):
            continue

        raw_list = doc.get("recommended_models") or []
        algo_list = []
        for m in raw_list:
            k = normalize_model_name(m)  # ✅ consistente con router
            if k and k not in algo_list:
                algo_list.append(k)

        if algo_list:
            key = f"{prod}|{canal}|{ubic}"
            rec_map[key] = algo_list
            n += 1

    print(f"[ROUTER] Colección clasificación: {coll_name} | DFUs con recomendación: {n}")
    return rec_map, coll_name


def _load_recommendations_and_selected_map(db, collection_name_hist: str, force_actual: bool = False):
    """
    Construye dos mapas:
      rec_map[key] = ["croston","tsb",...]
      sel_map[key] = "arima" (si existe selected_model)
    Fuente:
      - AUTO: usa _pick_classification_collection como siempre
      - MANUAL: si existe clasificacion_demanda_actual y force_actual=True -> usa esa
    """
    existing = set(db.list_collection_names())
    appuser = _infer_appuser_from_collection(collection_name_hist)

    coll_name = ""
    if force_actual and ("clasificacion_demanda_actual" in existing):
        coll_name = "clasificacion_demanda_actual"
        print("[ROUTER] Modo MANUAL: usando clasificacion_demanda_actual para recommended_models + selected_model.")
    else:
        coll_name = _pick_classification_collection(db, appuser)

    if not coll_name:
        print("[ROUTER] No se encontró colección de clasificación. Usando fallback global.")
        return {}, {}, ""

    coll = db[coll_name]
    cursor = coll.find(
        {},
        {
            "_id": 0,
            "Producto": 1,
            "Canal": 1,
            "Ubicacion": 1,
            "recommended_models": 1,
            "selected_model": 1,   # 👈 NUEVO
        }
    )

    rec_map = {}
    sel_map = {}

    n_rec = 0
    n_sel = 0

    for doc in cursor:
        prod = doc.get("Producto")
        canal = doc.get("Canal")
        ubic = doc.get("Ubicacion")
        if not (prod and canal and ubic):
            continue

        key = f"{prod}|{canal}|{ubic}"

        # recommended_models -> lista normalizada
        raw_list = doc.get("recommended_models") or []
        algo_list = []
        for m in raw_list:
            k = normalize_model_name(m)
            if k and k not in algo_list:
                algo_list.append(k)

        if algo_list:
            rec_map[key] = algo_list
            n_rec += 1

        # selected_model -> string normalizado
        raw_sel = doc.get("selected_model", "")
        ksel = normalize_model_name(raw_sel)
        if ksel:
            sel_map[key] = ksel
            n_sel += 1

    print(f"[ROUTER] Colección clasificación: {coll_name} | DFUs con recomendación: {n_rec} | DFUs con selected_model: {n_sel}")
    return rec_map, sel_map, coll_name


def main(db_name, collection_name, mongo_uri, min_registros, max_porcentaje_ceros, periodo_a_predecir, algorithm="prophet"):
    df_historico, db = obtener_datos_desde_mongo(mongo_uri, db_name, collection_name)

    from pipeline_forecast import ejecutar_pipeline

    algorithm = (algorithm or "prophet").strip().lower()

    model_params = {}

    # Modo AUTO / MANUAL (router)
    if algorithm in ("auto", "router", "frs", "manual"):
        # MANUAL: priorizar clasificacion_demanda_actual (si existe)
        force_actual = (algorithm == "manual")

        dfu_recs, dfu_sel, coll_used = _load_recommendations_and_selected_map(
            db, collection_name, force_actual=force_actual
        )

        model_params["dfu_recommendations"] = dfu_recs
        model_params["dfu_selected_models"] = dfu_sel  # 👈 NUEVO
        model_params["router_source_collection"] = coll_used

        # fallback global: si DFU no existe en clasificación o si fallan modelos recomendados / selected_model
        model_params["router_fallback"] = ["prophet", "arima", "tsb", "croston"]

        # router_mode: auto vs manual
        model_params["router_mode"] = "manual" if algorithm == "manual" else "auto"
        print(f"[ROUTER] router_mode: {model_params['router_mode']}")

    datos_futuros_mongo_df, df_metricas = ejecutar_pipeline(
        df_historico,
        min_registros,
        max_porcentaje_ceros,
        periodo_a_predecir,
        algorithm=algorithm,
        model_params=model_params
    )

    subir_demand_forecast(datos_futuros_mongo_df, db)
    subir_metricas(df_metricas, db)


if __name__ == "__main__":
    script_dir = os.path.dirname(__file__)

    # run_id legible y estable
    run_id = pd.Timestamp.now().strftime("%Y%m%d_%H%M%S")
    logs_dir = os.path.join(script_dir, "logs")
    os.makedirs(logs_dir, exist_ok=True)

    # 1 log por corrida (no pisa el anterior)
    log_file = os.path.join(logs_dir, f"forecast_{run_id}.log")

    # line-buffered para ver progreso “en vivo”
    f = open(log_file, "a", buffering=1, encoding="utf-8")
    sys.stdout = f
    sys.stderr = f

    try:
        mongo_uri = sys.argv[3]
        db_name = sys.argv[1]
        collection_name = sys.argv[2]
        min_registros = int(sys.argv[4])
        max_porcentaje_ceros = float(sys.argv[5])
        periodo_a_predecir = int(sys.argv[6])
        algorithm = sys.argv[7] if len(sys.argv) > 7 else "prophet"

        print("=== FORECAST RUN START ===")
        print("db:", db_name, "collection:", collection_name, "algo:", algorithm)
        print("min_registros:", min_registros, "max_%_ceros:", max_porcentaje_ceros, "periods:", periodo_a_predecir)
        print("log_file:", log_file)

        main(db_name, collection_name, mongo_uri, min_registros, max_porcentaje_ceros, periodo_a_predecir, algorithm)

        print("=== FORECAST RUN END (OK) ===")

    except Exception as e:
        print("=== FORECAST RUN END (ERROR) ===")
        print("ERROR:", str(e))
        raise
    finally:
        try:
            f.flush()
            f.close()
        except Exception:
            pass
