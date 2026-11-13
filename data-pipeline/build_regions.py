"""Vùng mẫu AppEEARS (R1–R3) → data/processed/regions/observations.parquet (docs/01 S2–S7, docs/02 §2–3).
Chạy: .venv/bin/python build_regions.py
Request chưa tải xong (chưa có .nc) thì bỏ qua; tải xong chạy lại, file được ghi đè."""
import json
from pathlib import Path

import pandas as pd
import xarray as xr

from pipeline.appeears_adapter import VARIABLES, nc_files_for, normalize_area
from pipeline.checks import SANITY, cross_check_temp, sanity_report, trend_ready
from pipeline.grid import region_series
from pipeline.schema import Region, validate

RAW, OUT = Path("data/raw/appeears"), Path("data/processed/regions/observations.parquet")
START, END = "2001-01-01", "2024-12-01"
REQUESTS = {  # thư mục thô (download_appeears.sh) → (dataset, layer giá trị)
    "R1_mvp_MOD13A3": ("MOD13A3.061", ["_1_km_monthly_NDVI"]),
    "R2a_mvp_MOD11A2_day": ("MOD11A2.061", ["LST_Day_1km"]),
    "R2b_mvp_MOD11A2_night": ("MOD11A2.061", ["LST_Night_1km"]),
    "R3_mvp_MOD16A2GF": ("MOD16A2GF.061", ["ET_500m", "PET_500m"]),
}


def load_regions(path="config/regions.geojson"):
    """Cùng thứ tự feature đã gửi AppEEARS (aid0001 = feature đầu tiên)."""
    out = []
    for f in json.loads(Path(path).read_text())["features"]:
        xs, ys = zip(*f["geometry"]["coordinates"][0])
        out.append(Region(f["properties"]["id"], (min(xs), min(ys), max(xs), max(ys))))
    return out


if __name__ == "__main__":
    regions, parts = load_regions(), []
    for folder, (dataset, layers) in REQUESTS.items():
        out = RAW / folder
        task_id = (out / "task_id.txt").read_text().strip()
        for i, region in enumerate(regions):
            ncs = nc_files_for(out, dataset, i)
            if not ncs:
                print("chưa có .nc, bỏ qua:", folder, region.region_id)
                continue
            for nc in ncs:
                for layer in layers:
                    parts.append(normalize_area(nc, region, dataset, layer, task_id))
                    print("xong", folder, region.region_id, layer)
    obs = pd.concat(parts, ignore_index=True)
    # MOD11A2/MOD16A2GF: AppEEARS trả cả composite 26/12/2000 → dòng tháng 12/2000 (NaN), cắt về 2001–2024
    obs = obs[obs["time"].between(START, END)].reset_index(drop=True)
    cfg = {name: {"unit": unit, "valid_range": SANITY[name]} for name, unit in VARIABLES.values()}
    validate(obs, cfg)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    obs.to_parquet(OUT, index=False)
    print("ghi", OUT, len(obs), "dòng")
    print("ngoài khoảng kỳ vọng:", sanity_report(obs).to_dict())
    for (rid, var), g in obs.groupby(["region_id", "variable"]):
        r = trend_ready(g.set_index("time")["value"])
        print(f"{rid:18s} {var:10s} có số {g['value'].notna().mean():.0%}  trend_ready={r['ready']}  "
              f"gap dài nhất={r['longest_gap_months']} tháng")
    tair = xr.open_dataarray("data/processed/grid/cube_tair_land.nc")   # kiểm tra chéo 03 §I
    for region in regions:
        lst = obs[(obs.region_id == region.region_id) & (obs.variable == "lst_day")].set_index("time")["value"]
        if len(lst):
            print(region.region_id, "LST ngày vs GLDAS Tair:", cross_check_temp(lst, region_series(tair, region.bbox)[0]))
