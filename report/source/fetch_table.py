"""Regional trend table (Table 3) from the running backend POST /trends."""
import json, requests
B = "http://localhost:8000/api/v1"
P, T, SM, ET = "imerg_precip", "merra2_air_temperature_2m", "gldas_soil_moisture_0_10cm", "gldas_evapotranspiration"
pre = lambda i: {"type": "preset", "id": i}; box = lambda b: {"type": "bbox", "bbox": list(b)}
rows = [("Whole world", T, pre("global"), "2001-01", "2025-12"),
        ("Arctic (north of 66.5° N)", T, box((-180, 66.5, 180, 90)), "2001-01", "2025-12"),
        ("Hanoi, Vietnam", T, pre("hanoi"), "2001-01", "2025-12"),
        ("Southern Ocean and Antarctica (south of 60° S)", T, box((-180, -90, 180, -60)), "2001-01", "2025-12"),
        ("Amazon Basin", P, box((-75, -15, -50, 5)), "2001-01", "2024-12"),
        ("Mekong Delta, Vietnam", P, pre("mekong_delta"), "2001-01", "2024-12"),
        ("Mekong region (whole basin)", P, pre("mekong_region"), "2001-01", "2024-12"),
        ("Central Highlands, Vietnam", ET, pre("central_highlands"), "2001-01", "2025-12"),
        ("California, USA", SM, box((-124.5, 32.5, -114, 42)), "2001-01", "2025-12")]
out = []
for name, v, r, s, e in rows:
    t = requests.post(B + "/trends", json={"variable_id": v, "region": r, "start": s, "end": e}, timeout=900).json()
    if "slope_per_decade" not in t: print(name, t); continue
    out.append({"name": name, "variable": v, "start": s, "end": e, "units": t["units"], "slope": t["slope_per_decade"], "p": t["p_value"],
                "p_hr": t["p_value_autocorr_adjusted"], "sig": t["significant"], "n": t["quality"]["n_months"],
                "missing": t["quality"]["missing_months"], "cov": t["quality"]["coverage_fraction"]})
    print(out[-1])
json.dump(out, open("report/source/table3.json", "w"), indent=1)
