# forecast_router.py
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional, Any

import pandas as pd


# ---------------------------------------------------------------------
# Normalización de nombres (clasificador -> clave interna)
# ---------------------------------------------------------------------
def normalize_model_name(name: str) -> str:
    """
    Convierte nombres humanos (de clasificación/UI) a claves internas:
      - "Croston" -> "croston"
      - "TSB (Teunter-Syntetos-Babai)" -> "tsb"
      - "ARIMA" / "SARIMAX" -> "arima"
      - "Prophet" -> "prophet"
    """
    if not name:
        return ""
    s = str(name).strip().lower()

    # limpiar paréntesis y espacios redundantes (sin depender de regex)
    s = s.replace("–", "-").replace("—", "-")
    s = " ".join(s.split())

    # mapeos directos
    if s in ("prophet", "meta prophet", "fbprophet"):
        return "prophet"

    # croston family
    if "croston" in s:
        return "croston"
    if s in ("sba", "syntetos-boylan", "syntetos-boylan approx", "syntetos boylan"):
        return "sba"

    # TSB
    if s.startswith("tsb") or "teunter" in s or "syntetos-babai" in s or "syntetos babai" in s:
        return "tsb"

    # ARIMA/SARIMAX
    if "sarimax" in s or "arima" in s:
        return "arima"

    # fallback: si ya viene como clave interna
    if s in ("croston", "tsb", "arima", "prophet", "sba"):
        return s

    return s  # dejarlo pasar; el registry validará


# ---------------------------------------------------------------------
# Helpers: completar fechas por estrategia (si quieres que el router sea dueño)
# (Por ahora opcional. Si pipeline ya manda serie completa, no se usa.)
# ---------------------------------------------------------------------
def completar_fechas_zero_fill(df_filtrado: pd.DataFrame, rango_fechas: pd.DatetimeIndex) -> pd.DataFrame:
    df_full = pd.DataFrame({"Fecha": rango_fechas})
    df_merge = df_full.merge(df_filtrado, on="Fecha", how="left").sort_values("Fecha")
    df_merge["Cantidad"] = pd.to_numeric(df_merge["Cantidad"], errors="coerce").fillna(0.0)
    df_merge.loc[df_merge["Cantidad"] < 0, "Cantidad"] = 0.0
    return df_merge


def completar_fechas_ffill(df_filtrado: pd.DataFrame, rango_fechas: pd.DatetimeIndex) -> pd.DataFrame:
    # comportamiento "tipo prophet parity": forward fill (y rellena 0 si queda NaN)
    df_full = pd.DataFrame({"Fecha": rango_fechas})
    df_merge = df_full.merge(df_filtrado, on="Fecha", how="left").sort_values("Fecha")
    df_merge["Cantidad"] = pd.to_numeric(df_merge["Cantidad"], errors="coerce")
    df_merge["Cantidad"] = df_merge["Cantidad"].ffill().fillna(0.0)
    df_merge.loc[df_merge["Cantidad"] < 0, "Cantidad"] = 0.0
    return df_merge


def _completion_strategy_for_model(model_key: str) -> str:
    """
    Decide cómo completar faltantes para correr un modelo:
      - prophet -> ffill (parity con tu flujo actual)
      - croston/tsb/arima -> zero_fill (serie con ceros reales)
    """
    m = (model_key or "").strip().lower()
    if m == "prophet":
        return "ffill"
    return "zero_fill"


# ---------------------------------------------------------------------
# Registry: runners (lazy imports)
# Cada runner debe cumplir firma:
#   run_forecast(filtered_df, freq, periods, forecast_date, model_params) -> (df_prepared, forecast, audit)
# ---------------------------------------------------------------------
def _get_runner(model_key: str):
    m = (model_key or "").strip().lower()

    if m == "prophet":
        from Algoritmos_demanda.forecast_prophet import run_forecast as run_prophet
        return run_prophet

    if m == "croston":
        # tu módulo croston actual usa data_preparation + make_forecast
        from Algoritmos_demanda.forecast_croston import data_preparation_croston, make_forecast_croston

        def run_croston(filtered_df, freq, periods, forecast_date, model_params):
            params = model_params or {}
            alpha = float(params.get("alpha", 0.1))

            df_c = data_preparation_croston(filtered_df)
            forecast, info = make_forecast_croston(df_c, periods=periods, freq=freq, alpha=alpha)
            forecast["forecast_date"] = forecast_date

            audit = {
                "modelo_usado": "croston",
                "status": info.get("status", "OK"),
                "error_msg": info.get("error_msg", ""),
                "alpha": alpha,
                "n_occurrences": info.get("n_occurrences", None),
                "z_last": info.get("z_last", None),
                "p_last": info.get("p_last", None),
            }
            return df_c, forecast, audit

        return run_croston

    if m == "tsb":
        from Algoritmos_demanda.forecast_tsb import data_preparation_tsb, make_forecast_tsb

        def run_tsb(filtered_df, freq, periods, forecast_date, model_params):
            params = model_params or {}
            alpha = float(params.get("alpha", 0.1))
            beta = float(params.get("beta", 0.1))

            df_t = data_preparation_tsb(filtered_df)
            forecast, info = make_forecast_tsb(df_t, periods=periods, freq=freq, alpha=alpha, beta=beta)
            forecast["forecast_date"] = forecast_date

            audit = {
                "modelo_usado": "tsb",
                "status": info.get("status", "OK"),
                "error_msg": info.get("error_msg", ""),
                "alpha": info.get("alpha", alpha),
                "beta": info.get("beta", beta),
                "n_occurrences": info.get("n_occurrences", None),
                "z_last": info.get("z_last", None),
                "p_last": info.get("p_last", None),
            }
            return df_t, forecast, audit

        return run_tsb

    if m == "arima":
        from Algoritmos_demanda.forecast_arima import run_forecast as run_arima
        return run_arima

    raise ValueError(f"Model not registered: {model_key}")


# ---------------------------------------------------------------------
# Router Config / Resultado
# ---------------------------------------------------------------------
@dataclass
class RouterDecision:
    dfu_key: str
    models_to_try: List[str]
    chosen_model: Optional[str] = None
    models_tried: List[str] = None
    errors: List[str] = None
    total_sec: Optional[float] = None


def build_dfu_key(producto: str, canal: str, ubicacion: str) -> str:
    return f"{producto}|{canal}|{ubicacion}"


def resolve_models_to_try(
    dfu_key: str,
    dfu_recommendations: Optional[Dict[str, List[str]]] = None,
    fallback_models: Optional[List[str]] = None,
    dfu_selected_models: Optional[Dict[str, str]] = None,  # 👈 NUEVO
) -> List[str]:
    """
    Resuelve la lista ordenada de modelos a intentar:
      0) selected_model del DFU (si existe en dfu_selected_models)
      1) recommended_models del DFU (si existe)
      2) fallback_models global (si no existe o si queda vacío)
    - Dedup manteniendo orden.
    """
    seq: List[str] = []
    seen = set()

    # 0) selected_model (manual)
    if dfu_selected_models and dfu_key in dfu_selected_models:
        sm = normalize_model_name(dfu_selected_models.get(dfu_key, ""))
        if sm and sm not in seen:
            seq.append(sm)
            seen.add(sm)

    # 1) recommended_models
    recs = []
    if dfu_recommendations and dfu_key in dfu_recommendations:
        recs = dfu_recommendations[dfu_key] or []

    for r in recs:
        k = normalize_model_name(r)
        if not k:
            continue
        if k not in seen:
            seq.append(k)
            seen.add(k)

    # 2) fallback
    fb = fallback_models or []
    for f in fb:
        k = normalize_model_name(f)
        if not k:
            continue
        if k not in seen:
            seq.append(k)
            seen.add(k)

    return seq


# ---------------------------------------------------------------------
# Main: run router para 1 DFU (automatic/manual mode)
# ---------------------------------------------------------------------
def run_forecast_router(
    dfu_key: str,
    filtered_df: pd.DataFrame,
    freq: str,
    periods: int,
    forecast_date: str,
    model_params: Optional[Dict[str, Any]] = None,
    dfu_recommendations: Optional[Dict[str, List[str]]] = None,
    dfu_selected_models: Optional[Dict[str, str]] = None,  # 👈 NUEVO
    fallback_models: Optional[List[str]] = None,
    rango_fechas: Optional[pd.DatetimeIndex] = None,
    print_prefix: str = "",
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
    """
    Router (AUTO/MANUAL):
      - decide secuencia
      - intenta modelos en orden
      - si falla/EXCLUDED, prueba siguiente
      - retorna el primer OK
      - si ninguno sirve: retorna ERROR

    Nota:
      - filtered_df se espera con ['Fecha','Cantidad'] (como en pipeline).
      - Si pipeline ya manda serie completa, puedes pasar rango_fechas=None y el router no completará.
        (o puedes pasar rango_fechas para que el router complete según estrategia por modelo).
    """
    params = model_params or {}

    # detectar modo desde params (si viene)
    router_mode = (params.get("router_mode", "") or "").strip().lower()
    if router_mode not in ("auto", "manual"):
        router_mode = "auto"

    seq = resolve_models_to_try(
        dfu_key=dfu_key,
        dfu_recommendations=dfu_recommendations,
        fallback_models=fallback_models,
        dfu_selected_models=dfu_selected_models,
    )

    decision = RouterDecision(
        dfu_key=dfu_key,
        models_to_try=seq,
        chosen_model=None,
        models_tried=[],
        errors=[],
        total_sec=None,
    )

    t0 = time.perf_counter()

    if not seq:
        # sin modelos: error
        audit = {
            "modelo_usado": None,
            "status": "ERROR",
            "error_msg": "No hay modelos para intentar (recommended vacío y fallback vacío).",
            "models_to_try": [],
            "models_tried": [],
            "router_mode": router_mode,
            "selected_model": normalize_model_name((dfu_selected_models or {}).get(dfu_key, "")) if dfu_selected_models else "",
            "selected_model_used": False,
        }
        return pd.DataFrame(columns=["ds", "y"]), pd.DataFrame(columns=["ds", "yhat"]), audit

    # selected_model “efectivo” para auditoría
    selected_model_norm = normalize_model_name((dfu_selected_models or {}).get(dfu_key, "")) if dfu_selected_models else ""
    selected_model_used = False

    # intentar en orden
    for i, model_key in enumerate(seq, start=1):
        decision.models_tried.append(model_key)
        try:
            runner = _get_runner(model_key)

            # completar si nos dan rango_fechas (router dueño de la estrategia)
            df_input = filtered_df
            if rango_fechas is not None:
                strat = _completion_strategy_for_model(model_key)
                if strat == "ffill":
                    df_input = completar_fechas_ffill(filtered_df, rango_fechas)
                else:
                    df_input = completar_fechas_zero_fill(filtered_df, rango_fechas)

            if print_prefix:
                print(f"{print_prefix}[ROUTER] try {i}/{len(seq)} model={model_key}")

            t1 = time.perf_counter()
            df_prepared, forecast, audit = runner(
                filtered_df=df_input,
                freq=freq,
                periods=periods,
                forecast_date=forecast_date,
                model_params=params,
            )
            dt = time.perf_counter() - t1

            status = (audit or {}).get("status", "OK")
            if print_prefix:
                print(f"{print_prefix}[ROUTER] model={model_key} status={status} sec={dt:.2f}")

            # reglas de aceptación
            # - OK => aceptar
            # - EXCLUDED => intentar siguiente
            # - ERROR => intentar siguiente
            if status == "OK":
                decision.chosen_model = model_key
                decision.total_sec = time.perf_counter() - t0

                # si el chosen es el selected_model, marcarlo
                if selected_model_norm and model_key == selected_model_norm:
                    selected_model_used = True

                audit_out = dict(audit or {})
                audit_out.update({
                    "router_mode": router_mode,
                    "models_to_try": seq,
                    "models_tried": decision.models_tried,
                    "chosen_model": decision.chosen_model,
                    "router_total_sec": decision.total_sec,
                    "selected_model": selected_model_norm,
                    "selected_model_used": selected_model_used,
                })
                return df_prepared, forecast, audit_out

            # si no OK, registrar error (si hay)
            msg = (audit or {}).get("error_msg", "")
            if msg:
                decision.errors.append(f"{model_key}: {msg}")

        except Exception as e:
            decision.errors.append(f"{model_key}: {str(e)}")
            if print_prefix:
                print(f"{print_prefix}[ROUTER] model={model_key} EXCEPTION: {e}")

            # continúa al siguiente

    # si llegamos aquí: ninguno funcionó
    decision.total_sec = time.perf_counter() - t0
    audit = {
        "modelo_usado": None,
        "status": "ERROR",
        "error_msg": "Ningún modelo produjo status=OK.",
        "router_mode": router_mode,
        "models_to_try": seq,
        "models_tried": decision.models_tried,
        "errors": decision.errors,
        "router_total_sec": decision.total_sec,
        "selected_model": selected_model_norm,
        "selected_model_used": False,
    }
    return pd.DataFrame(columns=["ds", "y"]), pd.DataFrame(columns=["ds", "yhat"]), audit
