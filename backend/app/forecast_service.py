"""AI forecast endpoints. Kept in its own module so the existing service stays untouched; wired in with one include_router in main.py.

The forecast models are trained on the shared 1° cubes (data-pipeline/processed_data/grid), so this module always reads those cubes
and never the 0.5° grid v2."""
import datetime as _dt
import json
from functools import lru_cache

import pandas as pd
from fastapi import APIRouter, Query

from . import config  # noqa: F401  (import first: puts data-pipeline on sys.path)
from .errors import ApiError
from .forecast_schemas import (DataStatus, ForecastMapResponse, ForecastRequest, ForecastResponse, RealityCheckResponse)
from .service import _num, _region_label, get_variable, resolve_region

from pipeline import api as papi  # noqa: E402
from pipeline import forecast as pforecast  # noqa: E402
from pipeline import indices as pindices  # noqa: E402

router = APIRouter(prefix="/api/v1")


# ---------------------------------------------------------------- data access
def _fc_model(pipeline_id: str, variant: str = "full"):
    return pforecast.load_model(pipeline_id, variant)


def _fc_cubes(pipeline_id: str) -> dict:
    """Cube of the variable to forecast + the other variables available on the server (used as cross-variable features)."""
    try:
        cubes = {v: papi.load_cube(v) for v in pforecast.AUX if v == pipeline_id or (papi.CUBE_DIR / f"cube_{v}.nc").exists()}
    except FileNotFoundError:
        raise ApiError(503, "DATA_NOT_READY", f"Data for '{pipeline_id}' is not available on the server yet.", {"variable": pipeline_id})
    # Cross-variable features need equal time axes (forecast._same_grid): cut every cube to the months all of them hold
    # (GLDAS cubes run to 2025-12, IMERG and MERRA-2 to 2024-12), so no feature is silently dropped.
    end = min(c.time.values[-1] for c in cubes.values())
    return {v: c.sel(time=slice(None, end)) for v, c in cubes.items()}


def _fc_region(pipeline_id: str, bbox, targets: list[str], variant: str):
    return pforecast.forecast_region(pipeline_id, _fc_cubes(pipeline_id), bbox, targets=targets, variant=variant)


def _fc_map(pipeline_id: str, horizon: int, variant: str):
    return pforecast.forecast_map(pipeline_id, _fc_cubes(pipeline_id), horizon, variant=variant)


def _fc_origin(pipeline_id: str, variant: str):
    """Origin (the last month of data used as input) of each mode."""
    if variant == "outlook":
        return pforecast.latest_origin()
    return pd.Timestamp(_fc_cubes(pipeline_id)[pipeline_id].time.values[-1])


@lru_cache(maxsize=4)
def _metrics(name: str, _mtime: float) -> dict:
    p = pforecast.MODEL_DIR / name
    return json.loads(p.read_text()) if p.exists() else {}


def _fc_metrics(pipeline_id: str, variant: str = "full") -> dict:
    name = "metrics.json" if variant == "full" else "metrics_outlook.json"
    p = pforecast.MODEL_DIR / name
    return _metrics(name, p.stat().st_mtime if p.exists() else 0.0).get(pipeline_id, {})


def _reality_check() -> dict | None:
    p = pforecast.MODEL_DIR / "reality_check.json"
    return json.loads(p.read_text()) if p.exists() else None


def _indices_end() -> dict:
    """Last month with data for each NOAA climate index."""
    d = pindices.load()
    return {c: d[c].dropna().index.max().strftime("%Y-%m") for c in d.columns if d[c].notna().any()}


# ---------------------------------------------------------------- /forecast (AI)

FORECAST_METHOD = ("Two global machine-learning models per variable, both trained on many 1° grid squares at once. 'Satellite' mode uses the "
                   "last 12 months of NASA observations, nearby squares and other variables at the same place. 'Outlook' mode uses only "
                   "ocean-atmosphere climate indices from NOAA plus the long-term warming trend, so it keeps working when satellite data "
                   "is out of date. Each model is a ridge regression plus gradient boosting; it outputs a median, an 80% range "
                   "(conformal calibration) and tercile probabilities. When the backtest shows no skill, forecasts shrink back to "
                   "the seasonal norm. Everything is tested on squares and years the model never saw.")
DATA_INPUTS = ["NASA GPM IMERG (rain)", "NASA GLDAS Noah (soil moisture, land air temperature, evaporation)", "NASA MERRA-2 (2 m air temperature, global temperature)",
               "NOAA CPC Niño 1+2/3/4/3.4 (ERSSTv5)", "NOAA PSL IOD (DMI), SOI, QBO", "NOAA NCEI PDO", "NOAA CPC NAO",
               "NASA GISS GISTEMP v4 (used only to check forecasts against reality)"]
GROUP_TEXT = {
    "Recent local anomalies": "how unusual the last months were at this place",
    "Neighbouring areas": "what is happening in the surrounding squares",
    "Other climate variables at the location": "other measurements at the same place (rain, soil moisture, temperature, evaporation)",
    "ENSO and Pacific (Niño, SOI, PDO)": "the El Niño / La Niña state of the Pacific Ocean",
    "Indian & Atlantic oceans, QBO (IOD, NAO, QBO)": "patterns in the Indian and Atlantic oceans",
    "Long-term warming": "the long-term warming trend",
}
LIMITS = ["This is a seasonal outlook, not a weather forecast: it cannot say whether a particular day will be rainy or hot.",
          "It shows statistical skill, not causes. Similar climate states in the past do not guarantee similar outcomes.",
          "Probabilities and ranges for a large area are conservative because they average the squares inside it."]
CONF_TEXT = {"high": "High: the backtest shows clear skill for this kind of place and lead time.",
             "moderate": "Moderate: there is some skill, so treat the tilt as a hint, not a promise.",
             "low": "Low: the skill is small; the tilt is only slightly better than a coin toss.",
             "none": "None: the backtest shows no skill here, so the forecast is just the seasonal norm."}


def _today_month() -> str:
    return _dt.date.today().strftime("%Y-%m")


def _variant(mode: str) -> str:
    return "outlook" if mode == "outlook" else "full"


def _model_or_503(pipeline_id: str, variant: str):
    try:
        return _fc_model(pipeline_id, variant)
    except FileNotFoundError:
        raise ApiError(503, "MODEL_NOT_READY", f"No '{variant}' forecast model for '{pipeline_id}' yet. Run data-pipeline/train_forecast.py.",
                       {"variable": pipeline_id, "variant": variant})


def _confidence(metrics: dict, band: str, lead: int) -> str:
    lb = metrics.get("by_latband", {}).get(band, {})
    if not lb:
        return "none"
    h = min(lb, key=lambda k: abs(int(k) - lead))
    r = lb[h]["rpss"]
    return "high" if r >= 0.15 else "moderate" if r >= 0.07 else "low" if r >= 0.02 else "none"


def _skill_rows(metrics: dict) -> list[dict]:
    rows = []
    for h, r in sorted(metrics.get("by_horizon", {}).items(), key=lambda kv: int(kv[0])):
        md = r["model"]
        pers = r.get("damped_persistence")
        rows.append({"lead_months": int(h), "skill_vs_climatology": _num(md["skill_vs_clim"], 3),
                     "skill_vs_persistence": _num(1 - (1 - md["skill_vs_clim"]) / max(1 - pers["skill_vs_clim"], 1e-9), 3) if pers else None,
                     "rpss": _num(md.get("rpss"), 3), "tercile_accuracy": _num(md.get("tercile_accuracy"), 3),
                     "coverage_80": _num(md["coverage_conformal"], 3)})
    return rows


def _targets(mode: str, origin: pd.Timestamp, start: str | None, months: int, hmax: int) -> list[str]:
    first = pd.Timestamp((start or (_today_month() if mode == "outlook" else (origin + pd.DateOffset(months=1)).strftime("%Y-%m"))) + "-01")
    last_ok = origin + pd.DateOffset(months=hmax)
    out = [t for t in pd.date_range(first, periods=months, freq="MS") if origin < t <= last_ok]
    if not out:
        raise ApiError(400, "INVALID_PARAMETER", f"The forecast must start after {origin:%Y-%m} and cannot go beyond {last_ok:%Y-%m} in '{mode}' mode.",
                       {"origin": f"{origin:%Y-%m}", "latest_month": f"{last_ok:%Y-%m}"})
    return [t.strftime("%Y-%m") for t in out]


def _data_status(mode: str, origin: pd.Timestamp, pipeline_id: str) -> dict:
    sat_end = pd.Timestamp(_fc_cubes(pipeline_id)[pipeline_id].time.values[-1]).strftime("%Y-%m")
    note = (f"Satellite data on this server ends in {sat_end}, so the outlook is driven by climate indices (El Niño and others) up to {origin:%Y-%m} "
            f"and the long-term warming trend." if mode == "outlook" else
            f"Satellite mode uses NASA observations up to {origin:%Y-%m}. Months before {_today_month()} are hindcasts you can compare with what happened.")
    return {"today": _today_month(), "satellite_data_end": sat_end, "indices_end": _indices_end(), "origin": f"{origin:%Y-%m}", "mode": mode, "note": note}


def _explanation(v, label: str, f: dict, pts: list[dict], metrics: dict, mode: str) -> dict:
    star = f["headline_index"]
    p = pts[star]
    tilt, prob = ("above", p["p_above"]) if p["p_above"] >= p["p_below"] else ("below", p["p_below"])
    pid = v.pipeline_id
    word = (("wetter" if tilt == "above" else "drier") if pid == "precip" else ("warmer" if tilt == "above" else "cooler") if pid in ("t2m", "tair_land")
            else ("moister" if tilt == "above" else "drier") if pid == "soil_moisture" else ("higher-evaporation" if tilt == "above" else "lower-evaporation"))
    conf = p["confidence"]
    lines = []
    if conf == "none" or p["signal"] == "none":
        lines.append(f"For {p['t']} the model sees no clear tilt: chances are close to one in three for each of below, near and above normal "
                     f"({p['p_below'] * 100:.0f}% / {p['p_near'] * 100:.0f}% / {p['p_above'] * 100:.0f}%).")
    else:
        lines.append(f"For {p['t']} the odds favour a {word}-than-normal month: {prob * 100:.0f}% chance, against 33% if there were no signal.")
    conds = f["conditions"]
    if conds:
        lines.append("What the climate system is doing now: " + "; ".join(f"{c['phase']} ({c['label'].split(' (')[0]}, {c['value']:+.1f} {c['unit']})" for c in conds[:3]) + ".")
    shown = [c for c in f["contributions"] if abs(c["effect_p_above"]) + abs(c["effect_p_below"]) >= 0.02][:3]
    contribs = []
    for c in f["contributions"]:
        contribs.append({"group": c["group"], "description": GROUP_TEXT.get(c["group"], c["group"]), "effect_p_above": c["effect_p_above"],
                         "effect_p_below": c["effect_p_below"], "effect_z": c["effect_z"]})
    if shown:
        for c in shown:
            d = c["effect_p_above"] if tilt == "above" else c["effect_p_below"]
            lines.append(f"Why: {GROUP_TEXT.get(c['group'], c['group'])} {'raises' if d > 0 else 'lowers'} the odds of a {tilt}-normal month by about {abs(d) * 100:.0f} point{'' if round(abs(d) * 100) == 1 else 's'}.")
    else:
        lines.append("Why: no single factor stands out, so the forecast stays close to the seasonal norm.")
    an = f["analogs"]
    if an:
        up, dn = sum(a["z_outcome"] > 0.43 for a in an), sum(a["z_outcome"] < -0.43 for a in an)
        lines.append(f"History check: in the {len(an)} past years with the most similar El Niño / Pacific state, {up} ended above normal here, {dn} below, {len(an) - up - dn} near normal.")
    lines.append("Trust level: " + CONF_TEXT[conf])
    lines.append(LIMITS[0])
    h = min((int(k) for k in metrics.get("by_horizon", {"0": 0})), key=lambda k: abs(k - p["lead_months"])) if metrics.get("by_horizon") else None
    bh = metrics.get("by_horizon", {}).get(str(h), {}) if h is not None else {}
    sci = {
        "model": {"mode": mode, "algorithm": "ridge regression per lead time + HistGradientBoosting (quantile 10/50/90 and 3-class tercile classifier)",
                  "target": "monthly anomaly in standard deviations (z) of the same calendar month, per 1° square",
                  "inputs": ("9 NOAA climate indices + long-term linear trend" if mode == "outlook" else
                             "12 lagged anomalies, 5x5 neighbourhood mean, 5 variables at the same square, 9 NOAA indices, global temperature")},
        "training": {"train_until": metrics.get("train_end"), "calibration_until": metrics.get("cal_end"), "backtest_period": metrics.get("test_period"),
                     "backtest_squares": metrics.get("n_test_cells"), "split": "temporal (train < calibration < test) and spatial (different squares)"},
        "calibration": {"lead_months": h, "shrinkage_lambda_by_band": {b: v_.get(str(h)) for b, v_ in metrics.get("lambda_shrink", {}).items()},
                        "probability_temperature_tau": metrics.get("tau_probability", {}).get(str(h)),
                        "conformal_half_width_z": metrics.get("conformal_correction_z", {}).get(str(h))},
        "backtest_at_lead": {"lead_months": h, "model": bh.get("model"), "baselines": {k: bh[k] for k in bh if k not in ("model", "n")}},
        "skill_by_latitude_band": metrics.get("by_latband"), "reliability_diagram": metrics.get("reliability_h3"),
        "feature_group_importance_pct_mae": metrics.get("importance"), "limitations": LIMITS,
        "metrics_glossary": {"skill": "1 - MSE/MSE(climatology); 0 = no better than seasonal norm", "RPSS": "ranked probability skill score vs 1/3-1/3-1/3",
                             "tercile": "lower / middle / upper third of the 2001-2016 distribution of that calendar month",
                             "coverage_80": "share of real values inside the 80% range (ideal 0.80)"}}
    return {"month": p["t"], "headline": lines[0], "simple": lines, "contributions": contribs, "conditions": conds, "scientific": sci}


def forecast(req: ForecastRequest) -> dict:
    v = get_variable(req.variable_id)
    region, bbox, warnings = resolve_region(req.region)
    variant = _variant(req.mode)
    model = _model_or_503(v.pipeline_id, variant)
    origin = pd.Timestamp(_fc_origin(v.pipeline_id, variant))
    targets = _targets(req.mode, origin, req.start, req.months, model["hmax"])
    try:
        f = _fc_region(v.pipeline_id, bbox, targets, variant)
    except ValueError:
        # Same code and status as /trends for an empty region; the pipeline message is not user-facing (Vietnamese).
        raise ApiError(404, "NO_DATA", f"This region has no grid cells with {v.name.lower()} data "
                       "(for example open sea for a land-only variable).", {"bbox": list(bbox)})
    metrics = _fc_metrics(v.pipeline_id, variant)
    pts = []
    for i, t in enumerate(f["time"]):
        lead = f["horizons"][i]
        conf = _confidence(metrics, f["band"], lead)
        pts.append({"t": t, "lead_months": lead, "forecast": _num(f["forecast"][i], 5), "lower": _num(f["lower"][i], 5), "upper": _num(f["upper"][i], 5),
                    "climatology": _num(f["climatology"][i], 5), "z_forecast": _num(f["z_forecast"][i], 3), "p_below": round(f["p_below"][i], 3),
                    "p_near": round(f["p_near"][i], 3), "p_above": round(f["p_above"][i], 3),
                    "normal_range": (_num(f["tercile_lower"][i], 5), _num(f["tercile_upper"][i], 5)),
                    "signal": f["signal"][i] if conf != "none" else "none", "confidence": conf})
    label = _region_label(region)
    name = v.name.lower()
    trusted = [p for p in pts if p["signal"] != "none"]
    if not any(p["confidence"] != "none" for p in pts):
        summary = (f"For {label}, the backtest shows no reliable skill over the seasonal norm for {name} at these lead times, "
                   f"so the forecast is shown as the seasonal norm with its uncertainty.")
    elif trusted:
        p = max(trusted, key=lambda p: max(p["p_above"], p["p_below"]))
        word, prob = ("above", p["p_above"]) if p["signal"] == "above" else ("below", p["p_below"])
        summary = (f"For {label}, there is a {prob * 100:.0f}% chance that {name} will be {word} normal in {p['t']} "
                   f"(a normal month is {p['normal_range'][0]:.3g}–{p['normal_range'][1]:.3g} {v.units}; with no signal the chance would be 33%). "
                   f"Confidence: {p['confidence']}.")
    else:
        summary = f"For {label}, the model sees no clear tilt toward above- or below-normal {name} over these months."
    warnings = warnings + [
        "Forecast shows statistical skill, not causation; probabilities and ranges for a large region are conservative.",
        f"Model trained on data up to {f['train_end'][:7]}; skill is measured on unseen squares and years (see the reliability section).",
    ]
    if req.mode == "outlook":
        warnings.append("Outlook mode uses climate indices only, so confidence is lower than in satellite mode; it is strongest for temperature in the tropics.")
    if v.note:
        warnings.append(v.note)
    expl = _explanation(v, label, f, pts, metrics, req.mode)
    return {"variable_id": v.id, "region": region, "units": v.units, "mode": req.mode, "origin": f["origin"][:7], "interval": f["interval"],
            "points": pts, "backtest": _skill_rows(metrics), "drivers": metrics.get("importance", {}), "analogs": f["analogs"],
            "analog_horizon": f["analog_horizon"], "data_inputs": DATA_INPUTS, "data_status": _data_status(req.mode, origin, v.pipeline_id),
            "explanation": expl, "method": FORECAST_METHOD, "plain_summary": summary, "source": v.source, "warnings": warnings}


def forecast_status(variable_id: str, mode: str) -> dict:
    v = get_variable(variable_id)
    variant = _variant(mode)
    _model_or_503(v.pipeline_id, variant)
    return _data_status(mode, pd.Timestamp(_fc_origin(v.pipeline_id, variant)), v.pipeline_id)


def forecast_map(variable_id: str, mode: str, month: str | None) -> dict:
    v = get_variable(variable_id)
    variant = _variant(mode)
    model = _model_or_503(v.pipeline_id, variant)
    origin = pd.Timestamp(_fc_origin(v.pipeline_id, variant))
    default_base = origin if mode == "satellite" else pd.Timestamp(_today_month() + "-01")
    target = pd.Timestamp((month or (default_base + pd.DateOffset(months=3)).strftime("%Y-%m")) + "-01")
    lead = (target.year - origin.year) * 12 + target.month - origin.month
    if not 1 <= lead <= model["hmax"]:
        raise ApiError(400, "INVALID_PARAMETER", f"In '{mode}' mode the map month must be between {(origin + pd.DateOffset(months=1)):%Y-%m} and "
                       f"{(origin + pd.DateOffset(months=model['hmax'])):%Y-%m}.", {"month": month})
    m = _fc_map(v.pipeline_id, lead, variant)
    metrics = _fc_metrics(v.pipeline_id, variant)
    warn = ["Colours show which third of the climate (below, near or above normal) is more likely; 'signal' marks squares where one third has at least 45% probability.",
            "Normal means the 2001-2016 climate of each square, so temperature maps lean towards 'above' because of global warming."]
    if not any(_confidence(metrics, b, lead) != "none" for b in ("tropics", "midlatitudes", "polar")):
        warn.append("The backtest shows no reliable skill for this variable at this lead time; treat the map as the seasonal norm.")
    return {"variable_id": v.id, "mode": mode, "origin": m["origin"][:7], "t": m["time"], "lead_months": lead, "interval": m["interval"],
            "cells": [dict(zip(("lat", "lon", "z_forecast", "signal", "p_below", "p_above"), c)) for c in m["cells"]], "warnings": warn}


def reality_check() -> dict:
    r = _reality_check()
    if r is None:
        raise ApiError(503, "REALITY_CHECK_NOT_READY", "Run data-pipeline/reality_check.py to compare past forecasts with NASA GISTEMP.")
    return r


# ---------------------------------------------------------------- routes
@router.post("/forecast", response_model=ForecastResponse)
def forecast_route(req: ForecastRequest):
    return forecast(req)


@router.get("/forecast/map", response_model=ForecastMapResponse)
def forecast_map_route(variable_id: str, mode: str = Query("outlook", pattern="^(outlook|satellite)$"),
                       month: str | None = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="Target month; default: 3 months from now (outlook) or satellite data end (satellite)")):
    return forecast_map(variable_id, mode, month)


@router.get("/forecast/status", response_model=DataStatus)
def forecast_status_route(variable_id: str, mode: str = Query("outlook", pattern="^(outlook|satellite)$")):
    return forecast_status(variable_id, mode)


@router.get("/forecast/reality-check", response_model=RealityCheckResponse)
def forecast_reality_check_route():
    return reality_check()
