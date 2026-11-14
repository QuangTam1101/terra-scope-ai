"""Oracle vs backend API for every case in cases.py. Writes validation/results/backend_cases.json.
Run with the backend on http://127.0.0.1:8000:  python validation/run_backend.py"""
import json
import math
import os
import sys
import time
from pathlib import Path

import numpy as np
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import oracle  # noqa: E402
from cases import CASES  # noqa: E402

API = os.getenv("TERRA_E2E_BASE", "http://127.0.0.1:8000").rstrip("/") + "/api/v1"
OUT = Path(__file__).resolve().parent / "results"

# Tolerances (justified in SCIENTIFIC_E2E_TEST_PLAN.md):
SERIES_ABS = 6e-7          # API rounds series values to 6 decimals (|error| <= 5e-7) plus float64 summation noise
REL = 1e-9                 # unrounded statistics: float64 arithmetic, different summation order
P_ABS = 1e-12              # two-sided p-values near 0..1


def close(a, b, rel=REL, abs_=1e-12):
    if a is None or b is None:
        return a is None and b is None
    return math.isclose(float(a), float(b), rel_tol=rel, abs_tol=abs_)


def post(path, body):
    r = requests.post(API + path, json=body, timeout=600)
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, {"raw": r.text[:300]}


def run_case(case):
    tid, label, var, region, bbox, start, end, expect = case
    rec = {"id": tid, "label": label, "variable_id": var, "region": region, "bbox": list(bbox), "start": start, "end": end,
           "expected_behaviour": expect if isinstance(expect, str) else {"http": expect[0], "code": expect[1]}, "checks": []}
    body = {"variable_id": var, "region": region, "start": start, "end": end}
    t0 = time.time()
    s_code, ser = post("/series", body)
    t_code, tr = post("/trends", body)
    rec["api_ms"] = round((time.time() - t0) * 1000)

    def check(name, ok, expected=None, actual=None, delta=None):
        rec["checks"].append({"check": name, "pass": bool(ok), "expected": expected, "actual": actual, "delta": delta})

    if not isinstance(expect, str):                                   # an error is the correct behaviour
        code = expect[0]
        check("HTTP status of /series", s_code == code, code, s_code)
        check("HTTP status of /trends", t_code == code, code, t_code)
        if expect[1]:
            check("API error code", (tr.get("error") or {}).get("code") == expect[1], expect[1], (tr.get("error") or {}).get("code"))
        try:
            exp = oracle.regional_expected(var, bbox, start, end)
            rec["oracle_note"] = "oracle found data" if not exp.get("no_data") else "oracle: no valid observation in the box"
        except ValueError as e:
            rec["oracle_note"] = f"oracle: {e}"
        rec["status"] = "PASS" if all(c["pass"] for c in rec["checks"]) else "FAIL"
        return rec

    exp = oracle.regional_expected(var, bbox, start, end)
    check("HTTP 200 for /series and /trends", s_code == 200 and t_code == 200, 200, [s_code, t_code])
    if s_code != 200 or t_code != 200:
        rec["status"] = "FAIL"; rec["api_error"] = [ser.get("error"), tr.get("error")]
        return rec
    pts = ser["points"]
    api_vals = np.array([np.nan if p["value"] is None else p["value"] for p in pts])
    ora_vals = exp["series"].to_numpy()
    check("time stamps", [p["t"] for p in pts] == [d.strftime("%Y-%m") for d in exp["series"].index],
          f"{len(ora_vals)} months {exp['series'].index[0]:%Y-%m}..{exp['series'].index[-1]:%Y-%m}", f"{len(pts)} months {pts[0]['t']}..{pts[-1]['t']}")
    api_anom = np.array([np.nan if p["anomaly"] is None else p["anomaly"] for p in pts])
    ora_anom = oracle.anomaly(exp["series"]).to_numpy()
    ok_a = np.isfinite(api_anom) & np.isfinite(ora_anom)
    d_anom = float(np.max(np.abs(api_anom[ok_a] - ora_anom[ok_a]))) if ok_a.any() else 0.0
    check("chart data: monthly anomalies", d_anom <= SERIES_ABS * 2 and bool((np.isfinite(api_anom) == np.isfinite(ora_anom)).all()), "oracle anomalies", "api anomalies", d_anom)
    both = np.isfinite(api_vals) & np.isfinite(ora_vals)
    same_missing = bool((np.isfinite(api_vals) == np.isfinite(ora_vals)).all())
    max_d = float(np.max(np.abs(api_vals[both] - ora_vals[both]))) if both.any() else 0.0
    check("missing months identical", same_missing, int((~np.isfinite(ora_vals)).sum()), int((~np.isfinite(api_vals)).sum()))
    check("all monthly values", max_d <= SERIES_ABS, "oracle series", "api series", max_d)
    check("n_months", ser["quality"]["n_months"] == exp["n_months"], exp["n_months"], ser["quality"]["n_months"])
    check("missing_months", ser["quality"]["missing_months"] == exp["missing_months"], exp["missing_months"], ser["quality"]["missing_months"])
    cov_d = abs(ser["quality"]["coverage_fraction"] - exp["coverage_fraction"])
    check("coverage_fraction (API rounds to 3 dp)", cov_d <= 5.01e-4, round(exp["coverage_fraction"], 4), ser["quality"]["coverage_fraction"], cov_d)
    units = {"imerg_precip": "mm/month", "gldas_evapotranspiration": "mm/month", "gldas_soil_moisture_0_10cm": "m3/m3",
             "gldas_air_temperature": "degC", "merra2_air_temperature_2m": "degC"}[var]
    check("units", tr["units"] == units and ser["units"] == units, units, tr["units"])
    check("sufficiency", tr["quality"]["sufficient"] == exp["sufficient"], exp["sufficient"], tr["quality"]["sufficient"])
    rec["expected"] = {k: exp.get(k) for k in ("slope_per_decade", "S", "var_S", "z", "p_value", "significant", "p_value_hr",
                                                "ols_slope_per_decade", "ols_ci95", "n_months", "missing_months", "coverage_fraction", "sufficient", "n_cells_in_box")}
    rec["actual_backend"] = {k: tr.get(k) for k in ("trend_id", "slope_per_decade", "z", "p_value", "significant", "p_value_autocorr_adjusted", "slope_ci", "n", "direction")}
    d_slope = None if tr["slope_per_decade"] is None else abs(tr["slope_per_decade"] - exp["slope_per_decade"])
    check("Sen slope per decade", close(tr["slope_per_decade"], exp["slope_per_decade"]), exp["slope_per_decade"], tr["slope_per_decade"], d_slope)
    if exp["sufficient"]:
        check("Z statistic", close(tr["z"], exp["z"]), exp["z"], tr["z"], abs(tr["z"] - exp["z"]))
        check("raw Seasonal MK p", close(tr["p_value"], exp["p_value"], abs_=P_ABS), exp["p_value"], tr["p_value"], abs(tr["p_value"] - exp["p_value"]))
        check("significance verdict (p < alpha)", tr["significant"] == exp["significant"], exp["significant"], tr["significant"])
        check("Hamed-Rao adjusted p", close(tr["p_value_autocorr_adjusted"], exp["p_value_hr"], rel=1e-7, abs_=1e-10),
              exp["p_value_hr"], tr["p_value_autocorr_adjusted"], abs(tr["p_value_autocorr_adjusted"] - exp["p_value_hr"]))
        lo, hi = exp["ols_ci95"]
        check("OLS anomaly 95% CI", tr["slope_ci"] is not None and close(tr["slope_ci"][0], lo, rel=1e-8) and close(tr["slope_ci"][1], hi, rel=1e-8),
              [lo, hi], tr["slope_ci"])
        want_dir = ("increasing" if exp["slope_per_decade"] > 0 else "decreasing") if exp["significant"] else "no_trend"
        check("direction label", tr["direction"] == want_dir, want_dir, tr["direction"])
    else:
        check("no p-value when insufficient", tr["p_value"] is None and tr["significant"] is None, None, [tr["p_value"], tr["significant"]])
    rec["status"] = "PASS" if all(c["pass"] for c in rec["checks"]) else "FAIL"
    return rec


def main():
    OUT.mkdir(exist_ok=True)
    results = []
    for c in CASES:
        try:
            r = run_case(c)
        except Exception as e:   # recorded honestly, never turned into a pass
            r = {"id": c[0], "label": c[1], "status": "BLOCKED", "error": repr(e)}
        results.append(r)
        print(r["id"], r["status"], *(f"{k['check']}={k['delta']}" for k in r.get("checks", []) if not k["pass"]))
    (OUT / "backend_cases.json").write_text(json.dumps(results, indent=1, default=str), encoding="utf-8")


if __name__ == "__main__":
    main()
