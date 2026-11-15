"""Fetch the data for Figures 1-3 from the live Terra-scope API (1° grid, 2001-2024)."""
import json, sys, requests
B = "https://terra-scope-nasa.vercel.app/api/v1"; out = sys.argv[1]
P = lambda p, b: requests.post(B + p, json=b, timeout=600).json()
md = {"type": "preset", "id": "mekong_delta"}
d = {}
for k, v in [("md_t2m", "merra2_air_temperature_2m"), ("md_pr", "imerg_precip")]:
    d[k + "_series"] = P("/series", {"variable_id": v, "region": md, "start": "2001-01", "end": "2024-12"})
    d[k + "_trend"] = P("/trends", {"variable_id": v, "region": md, "start": "2001-01", "end": "2024-12"})
json.dump(d, open(out + "/api.json", "w"))
for k in ("md_t2m_trend", "md_pr_trend"):
    t = d[k]; print(k, t.get("region", {}).get("bbox"), t["slope_per_decade"], t["p_value"], t.get("p_value_autocorr_adjusted"), t["significant"], t["quality"])
c = P("/compare", {"variable_id": "merra2_air_temperature_2m", "region_a": {"type": "bbox", "bbox": [-17, 10, 30, 18]},
                   "region_b": {"type": "bbox", "bbox": [-92.9, 42.5, -86.8, 47.1]}, "start": "2001-01", "end": "2024-12"})
json.dump(c, open(out + "/compare.json", "w")); print("compare", c["difference"], c["verdict"])
sw = {k: P("/series", {"variable_id": "merra2_air_temperature_2m", "region": {"type": "bbox", "bbox": bb}, "start": "2001-01", "end": "2024-12"})
      for k, bb in [("sahel", [-17, 10, 30, 18]), ("wisc", [-92.9, 42.5, -86.8, 47.1])]}
json.dump(sw, open(out + "/sw.json", "w"))
g = requests.get(B + "/trends/grid", params={"variable_id": "merra2_air_temperature_2m", "start": "2001-01", "end": "2024-12"}, timeout=900).json()
json.dump(g, open(out + "/grid.json", "w")); print("grid", g["cell_size_deg"], len(g["cells"]))
