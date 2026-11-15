"""Request log for the research paper: every live-app value used in the text and tables.
Queries the public Terra-scope API and saves each request, its UTC time and the response fields used.
Usage: python fetch_live_tables.py OUT_DIR"""
import json, sys, datetime, time, requests
B = "https://terra-scope-nasa.vercel.app/api/v1"; out = sys.argv[1]
log = {"api": B, "started_utc": datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z", "requests": []}
def call(method, path, body=None, params=None, keep=None):
    t = datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"
    for attempt in range(4):                     # serverless cold starts can return a non-JSON 5xx page
        r = requests.request(method, B + path, json=body, params=params, timeout=900)
        try:
            d = r.json(); break
        except ValueError:
            time.sleep(5 * (attempt + 1))
    else:
        raise RuntimeError(f"{path} failed: HTTP {r.status_code}")
    entry = {"utc": t, "attempts": attempt + 1, "method": method, "path": path, "body": body, "params": params, "status": r.status_code,
             "response": keep(d) if keep else d}
    log["requests"].append(entry); return d
bb = lambda b: {"type": "bbox", "bbox": b}
trend_keep = lambda d: {k: d.get(k) for k in ("trend_id", "variable_id", "region", "start", "end", "slope_per_decade", "p_value",
                                               "p_value_autocorr_adjusted", "significant", "quality")}
call("GET", "/health")
call("GET", "/variables", keep=lambda d: [{k: v.get(k) for k in ("id", "spatial_resolution_deg", "coverage", "source", "available")} for v in d.get("variables", d)])
cases = [("imerg_precip", [104.4, 8.5, 106.9, 11.1]), ("merra2_air_temperature_2m", [105.3, 20.5, 106.1, 21.4]),
         ("imerg_precip", [-75, -15, -50, 5]), ("gldas_soil_moisture_0_10cm", [-124.5, 32.5, -114, 42]),
         ("merra2_air_temperature_2m", [-17, 10, 30, 18]), ("merra2_air_temperature_2m", [-92.9, 42.5, -86.8, 47.1]),
         ("gldas_air_temperature", [-17, 10, 30, 18]), ("merra2_air_temperature_2m", [-180, -90, 180, 90]),
         ("merra2_air_temperature_2m", [-180, 66.5, 180, 90])]
for v, b in cases:
    call("POST", "/trends", {"variable_id": v, "region": bb(b), "start": "2001-01", "end": "2024-12"}, keep=trend_keep)
for v in ("merra2_air_temperature_2m", "imerg_precip"):
    call("POST", "/trends", {"variable_id": v, "region": {"type": "preset", "id": "mekong_delta"}, "start": "2001-01", "end": "2024-12"}, keep=trend_keep)
call("POST", "/compare", {"variable_id": "merra2_air_temperature_2m", "region_a": bb([-17, 10, 30, 18]), "region_b": bb([-92.9, 42.5, -86.8, 47.1]),
                          "start": "2001-01", "end": "2024-12"}, keep=lambda d: {"compare_id": d["compare_id"], "difference": d["difference"], "verdict": d["verdict"]})
def grid_keep(d):
    c = [x for x in d["cells"] if x.get("valid")]; s = [x for x in c if x.get("significant_fdr")]
    return {"cell_size_deg": d["cell_size_deg"], "cells": len(d["cells"]), "valid": len(c), "significant_fdr": len(s),
            "significant_up": sum(1 for x in s if x["slope_per_decade"] > 0), "significant_down": sum(1 for x in s if x["slope_per_decade"] < 0)}
for v in ("merra2_air_temperature_2m", "imerg_precip"):
    call("GET", "/trends/grid", params={"variable_id": v, "start": "2001-01", "end": "2024-12"}, keep=grid_keep)
for v in ("merra2_air_temperature_2m", "gldas_air_temperature", "gldas_soil_moisture_0_10cm", "gldas_evapotranspiration", "imerg_precip"):
    for mode in ("satellite", "outlook"):
        call("POST", "/forecast", {"variable_id": v, "region": bb([104.4, 8.5, 106.9, 11.1]), "mode": mode, "months": 3},
             keep=lambda d: {"origin": d.get("origin"), "backtest": d.get("backtest")})
log["finished_utc"] = datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"
json.dump(log, open(out + "/live_requests.json", "w"), indent=1, ensure_ascii=False)
print(log["started_utc"], "->", log["finished_utc"], len(log["requests"]), "requests")
