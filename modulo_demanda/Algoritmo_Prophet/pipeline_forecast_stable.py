import datetime
import time
import logging
import os
import json
from typing import Dict, Tuple, Any, Optional

import pandas as pd

from data_cleaning_V2 import (
    load_and_clean_data,
    resample_to_target,
    _normalize_freq,
)
from generador_combinaciones import generate_combinations
from valid_combinations import obtener_combinaciones_validas

# Métricas comunes
from forecast_metrics import join_predictions, calculate_metrics

#  Router (AUTO/MANUAL) centralizado
from forecast_router import run_forecast_router, build_dfu_key


# ---------------------------------------------------------------------
# Helpers: cargar defaults JSON + merge con overrides
# ---------------------------------------------------------------------
def load_default_model_params_json(path: str) -> Dict[str, Any]:
    """
    Carga parámetros default desde un JSON (ej. model_params.defaults.json).
    Si no existe o falla, regresa {} (y NO truena el pipeline).
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data or {}
    except FileNotFoundError:
        print(f"[CFG] defaults json not found: {path} (using empty defaults)")
        return {}
    except Exception as e:
        print(f"[CFG] defaults json error: {path} err={e} (using empty defaults)")
        return {}


def merge_model_params(defaults: Dict[str, Any], overrides: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Merge shallow por bloques (global/router/arima/prophet/tsb/croston).
    overrides pisa defaults.
    """
    if not defaults:
        defaults = {}
    if not overrides:
        return dict(defaults)

    out = dict(defaults)
    for k, v in overrides.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = {**out[k], **v}
        else:
            out[k] = v
    return out


# ---------------------------------------------------------------------
# Helpers: model_params por modelo (global/router/<model>)
# (Duplicado intencional del router para que el pipeline no dependa
#  de funciones privadas del router y mantenga compatibilidad.)
# ---------------------------------------------------------------------
def _is_nested_model_params(params: Any) -> bool:
    """
    True si params tiene estructura por modelo:
      { "global": {...}, "router": {...}, "arima": {...}, ... }
    """
    if not isinstance(params, dict):
        return False
    for k in ("global", "router", "arima", "prophet", "tsb", "croston", "sba"):
        if k in params and isinstance(params.get(k), dict):
            return True
    return False


def _merge_params(base: Optional[Dict[str, Any]], override: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    if isinstance(base, dict):
        out.update(base)
    if isinstance(override, dict):
        out.update(override)
    return out


def _resolve_router_params(model_params: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Devuelve params efectivos para el router.
    - Si plano: regresa tal cual.
    - Si anidado: regresa merge(global, router)
    """
    model_params = model_params or {}
    if not _is_nested_model_params(model_params):
        return model_params

    global_params = model_params.get("global", {}) if isinstance(model_params.get("global"), dict) else {}
    router_block = model_params.get("router", {}) if isinstance(model_params.get("router"), dict) else {}
    return _merge_params(global_params, router_block)


# ---------------------------------------------------------------------
# Diagnóstico opcional: % ceros y n_registros por combinación (post-resample)
# ---------------------------------------------------------------------
def _debug_zeros_por_combinacion(df_resampleado, min_registros, max_porcentaje_ceros):
    try:
        req_cols = {"Producto", "Canal", "Ubicacion", "Cantidad", "Fecha"}
        if not req_cols.issubset(set(df_resampleado.columns)):
            print("[DEBUG-ZEROS] Columns missing. Found:", df_resampleado.columns.tolist())
            return

        combos = df_resampleado.groupby(["Producto", "Canal", "Ubicacion"], dropna=False)

        print("\n[DEBUG-ZEROS] ---- Diagnóstico por combinación (post-resample) ----")
        for (prod, canal, ubic), g in combos:
            n = len(g)
            if n == 0:
                continue
            pct_zeros = (g["Cantidad"] == 0).mean()
            pasa = (
                (n >= min_registros)
                and (pct_zeros <= max_porcentaje_ceros)
                and (g.isnull().sum().sum() == 0)
            )
            print(f"  • {prod} | {canal} | {ubic} -> n={n}, %ceros={pct_zeros:.2%}, pasa_filtro={pasa}")
        print("[DEBUG-ZEROS] ------------------------------------------------------\n")
    except Exception as e:
        print("[DEBUG-ZEROS] Error:", e)


def _silenciar_cmdstanpy():
    logger = logging.getLogger("cmdstanpy")
    logger.addHandler(logging.NullHandler())
    logger.propagate = False
    logger.setLevel(logging.CRITICAL)


# ---------------------------------------------------------------------
# Pipeline universal (con router)
# ---------------------------------------------------------------------
def ejecutar_pipeline(
    df_historico: pd.DataFrame,
    min_registros: int,
    max_porcentaje_ceros: float,
    periodo_a_predecir: int,
    algorithm: str = "prophet",
    imprimir_debug_zeros: bool = True,
    model_params: Optional[Dict[str, Any]] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Pipeline universal:
      - Clean + infer freq global
      - Resample a freq efectiva (D / W-MON / MS)
      - Genera combinaciones y filtra válidas (min_registros, %ceros, nulos)
      - Por DFU: llama al forecast_router (AUTO/MANUAL) + métricas
      - Devuelve:
          df_futuros: (Producto,Canal,Ubicacion,Fecha,Demanda Predicha,forecast_date)
          df_metric:  métricas + auditoría (incluye router)
    """
    _silenciar_cmdstanpy()

    t_pipeline = time.perf_counter()

    # -------------------------------------------------------------
    # 0) Cargar defaults JSON + aplicar overrides (si vienen)
    # -------------------------------------------------------------
    # Puedes configurar la ruta con env var:
    #   export MODEL_PARAMS_DEFAULTS="/ruta/model_params.defaults.json"
    defaults_path = os.getenv("MODEL_PARAMS_DEFAULTS", "model_params.defaults.json")
    defaults = load_default_model_params_json(defaults_path)

    # model_params (override) puede venir None, {} o dict parcial
    model_params = merge_model_params(defaults, model_params or {})

    # router_params se calculan a partir de model_params (flat o nested)
    router_params = _resolve_router_params(model_params)

    algo_in = (algorithm or "prophet").strip().lower()
    forecast_date = datetime.datetime.now().replace(microsecond=0).isoformat()

    print("\n=== PIPELINE START ===")
    print(f"[CFG] algo={algo_in} min_registros={min_registros} max_%_ceros={max_porcentaje_ceros} periods={periodo_a_predecir}")
    print(f"[CFG] forecast_date={forecast_date}")
    print(f"[CFG] defaults_path={defaults_path}")
    print(f"[CFG] model_params_scope={'nested' if _is_nested_model_params(model_params) else 'flat'}")

    # 1) Carga + limpieza + inferencia freq global
    df, freq_inferida = load_and_clean_data(df_historico)
    freq = _normalize_freq(freq_inferida)  # 'D'|'W-MON'|'MS'

    # 2) Resampleo a la frecuencia efectiva
    df, freq = resample_to_target(df, target_freq=freq)
    print(f"[PIPE] Frecuencia efectiva para el modelado: {freq}")

    # 3) Rango de fechas global (para completar series dentro del router según estrategia por modelo)
    rango_fechas = pd.date_range(df["Fecha"].min(), df["Fecha"].max(), freq=freq)

    # 4) Combinaciones
    df_combinaciones = generate_combinations(df)

    # 5) Debug de ceros
    if imprimir_debug_zeros:
        _debug_zeros_por_combinacion(df, min_registros, max_porcentaje_ceros)

    # 6) Filtrado de combinaciones válidas (post-resample)
    combinaciones_validas = obtener_combinaciones_validas(
        df_combinaciones, df, min_registros, max_porcentaje_ceros
    )

    total_validas = len(combinaciones_validas)
    print(f"[PIPE] Total combinaciones válidas: {total_validas}")

    # 7) Router config
    is_router = algo_in in ("auto", "router", "frs", "manual")

    # IMPORTANTE:
    # - dfu_recommendations, dfu_selected_models, router_fallback, router_source_collection
    #   se leen de router_params (merge global+router si es nested).
    dfu_recommendations = router_params.get("dfu_recommendations") if is_router else None
    dfu_selected_models = router_params.get("dfu_selected_models") if is_router else None
    fallback_models = router_params.get("router_fallback") if is_router else [algo_in]

    if is_router:
        src = router_params.get("router_source_collection", "")
        if algo_in == "manual":
            print(f"[ROUTER] mode=MANUAL source_collection={src or '(unknown)'} fallback={fallback_models}")
        else:
            print(f"[ROUTER] mode=AUTO source_collection={src or '(unknown)'} fallback={fallback_models}")

        try:
            n_sel = len(dfu_selected_models) if isinstance(dfu_selected_models, dict) else 0
            if algo_in == "manual":
                print(f"[ROUTER] DFUs con selected_model (map): {n_sel}")
        except Exception:
            pass
    else:
        print(f"[ROUTER] mode=SINGLE model={algo_in}")

    datos_futuros_mongo = []
    metricas_combinaciones = []

    for i, (Producto, Canal, Ubicacion) in enumerate(combinaciones_validas, start=1):
        t_dfu = time.perf_counter()
        dfu_key = build_dfu_key(Producto, Canal, Ubicacion)
        prefix = f"[DFU {i}/{total_validas}] "

        print(f"\n{prefix}START {dfu_key}")

        try:
            filtered_df = df[
                (df["Producto"] == Producto)
                & (df["Canal"] == Canal)
                & (df["Ubicacion"] == Ubicacion)
            ][["Fecha", "Cantidad"]].sort_values("Fecha")

            # (seguro) si por alguna razón hay duplicados por Fecha tras resample:
            filtered_df = (
                filtered_df.groupby("Fecha", as_index=False)["Cantidad"].sum().sort_values("Fecha")
            )

            # Corre router (AUTO/MANUAL o SINGLE)
            # Pasamos model_params COMPLETO (flat o nested, ya mergeado con defaults).
            # El router se encarga de resolver params por modelo (global + <model>).
            df_prepared, forecast, audit = run_forecast_router(
                dfu_key=dfu_key,
                filtered_df=filtered_df,
                freq=freq,
                periods=periodo_a_predecir,
                forecast_date=forecast_date,
                model_params=model_params,  # <-- se pasa completo
                dfu_recommendations=dfu_recommendations,
                dfu_selected_models=dfu_selected_models,
                fallback_models=fallback_models,
                rango_fechas=rango_fechas,
                print_prefix=prefix,
            )

            status = (audit or {}).get("status", "OK")
            modelo_usado = (audit or {}).get("modelo_usado", None)

            # Si el router no logró forecast OK, guardamos métricas con ERROR/EXCLUDED
            if status != "OK" or forecast is None or forecast.empty:
                dt = time.perf_counter() - t_dfu
                print(f"{prefix}{status} {dfu_key} sec={dt:.2f} modelo={modelo_usado} err={(audit or {}).get('error_msg','')}")
                metricas_combinaciones.append({
                    "Producto": Producto,
                    "Canal": Canal,
                    "Ubicacion": Ubicacion,
                    "WMAPE": None,
                    "SMAPE": None,
                    "forecast_date": forecast_date,
                    "freq": freq,
                    "modelo_usado": modelo_usado,
                    "status": status,
                    "error_msg": (audit or {}).get("error_msg", ""),
                    **{k: (audit or {}).get(k) for k in (
                        "router_mode","models_to_try","models_tried","chosen_model","router_total_sec",
                        "model_params_scope"
                    ) if (audit or {}).get(k) is not None}
                })
                continue

            # Horizonte futuro: frontera = último punto del rango global
            frontera = pd.to_datetime(rango_fechas.max())
            futuro = forecast[forecast["ds"] > frontera].copy()

            futuro = futuro.rename(columns={"ds": "Fecha", "yhat": "Demanda Predicha"})
            futuro["Producto"] = Producto
            futuro["Canal"] = Canal
            futuro["Ubicacion"] = Ubicacion
            futuro["forecast_date"] = forecast_date
            futuro = futuro[["Producto", "Canal", "Ubicacion", "Fecha", "Demanda Predicha", "forecast_date"]]
            datos_futuros_mongo.append(futuro)

            # Métricas (comunes)
            wmape = None
            smape = None
            try:
                df_merged = join_predictions(df_prepared, forecast)
                wmape, smape, _dfm = calculate_metrics(df_merged)
            except Exception:
                wmape, smape = None, None

            row = {
                "Producto": Producto,
                "Canal": Canal,
                "Ubicacion": Ubicacion,
                "WMAPE": wmape,
                "SMAPE": smape,
                "forecast_date": forecast_date,
                "freq": freq,
                "modelo_usado": modelo_usado,
                "status": status,
                "error_msg": (audit or {}).get("error_msg", ""),
            }

            # Auditoría extra (incluye router + arima fit_sec etc.)
            for k in (
                "router_mode","models_to_try","models_tried","chosen_model","router_total_sec","model_params_scope",
                "alpha", "beta", "n_occurrences", "z_last", "p_last",
                "fit_sec","maxiter","fit_method","maxiter_search","maxiter_final","grid_debug","grid_best_aic",
                "order", "seasonal_order", "aic", "bic", "n_obs", "use_seasonal", "seasonal_m",
            ):
                if audit and k in audit:
                    row[k] = audit[k]

            metricas_combinaciones.append(row)

            dt = time.perf_counter() - t_dfu
            print(
                f"{prefix}OK {dfu_key} sec={dt:.2f} wmape={wmape} smape={smape} "
                f"modelo={modelo_usado} status={status}"
            )

        except Exception as e:
            dt = time.perf_counter() - t_dfu
            print(f"{prefix}ERROR {dfu_key} sec={dt:.2f} err={str(e)}")

            metricas_combinaciones.append({
                "Producto": Producto,
                "Canal": Canal,
                "Ubicacion": Ubicacion,
                "WMAPE": None,
                "SMAPE": None,
                "forecast_date": forecast_date,
                "freq": freq,
                "modelo_usado": None,
                "status": "ERROR",
                "error_msg": str(e),
            })

    df_futuros = pd.concat(datos_futuros_mongo, ignore_index=True) if datos_futuros_mongo else pd.DataFrame()
    df_metric = pd.DataFrame(metricas_combinaciones)

    # -----------------------------------------------------------------
    # Control / Auditoría en log
    # -----------------------------------------------------------------
    if not df_futuros.empty:
        print(f"\n[PIPE] Total filas forecast futuro: {len(df_futuros)}")

        resumen_fcst = (
            df_futuros
            .groupby(["Producto", "Canal", "Ubicacion", "forecast_date"], as_index=False)
            .agg(
                fecha_inicio=("Fecha", "min"),
                fecha_fin=("Fecha", "max"),
                n_periodos=("Fecha", "count"),
                demanda_predicha_prom=("Demanda Predicha", "mean"),
                demanda_predicha_min=("Demanda Predicha", "min"),
                demanda_predicha_max=("Demanda Predicha", "max"),
            )
            .sort_values(["Producto", "Canal", "Ubicacion"])
        )

        with pd.option_context(
            "display.max_rows", None,
            "display.max_columns", None,
            "display.width", 200,
            "display.max_colwidth", 60,
        ):
            print("\n=== RESUMEN FORECAST (1 fila por DFU válido) ===")
            print(resumen_fcst.to_string(index=False))

    if not df_metric.empty:
        print(f"\n[PIPE] Total combinaciones válidas (métricas): {len(df_metric)}")
        dfm = df_metric.sort_values(["Producto", "Canal", "Ubicacion"]).copy()

        with pd.option_context(
            "display.max_rows", None,
            "display.max_columns", None,
            "display.width", 200,
            "display.max_colwidth", 60,
        ):
            print("\n=== METRICAS / AUDIT (todas las combinaciones válidas) ===")
            print(dfm.to_string(index=False))

    total_sec = time.perf_counter() - t_pipeline
    print(f"\n=== PIPELINE END === sec={total_sec:.2f}")

    return df_futuros, df_metric