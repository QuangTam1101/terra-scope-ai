"""Huấn luyện + backtest dự báo (pipeline/forecast.py) trên CPU. Chạy từ data-pipeline/:
    ../.venv/bin/python train_forecast.py [biến ...] [--fast] [--outlook]
Mỗi biến chạy 2 lần:
  1. backtest : train ≤ 2016-12, hiệu chỉnh 2017–2019, kiểm tra 2020–2024 (số liệu báo cáo; ô kiểm tra KHÔNG nằm trong train)
  2. production: train ≤ 2020-12 trên MỌI ô, hiệu chỉnh 2021–2024 → models/forecast_<biến>.joblib dùng cho web
Kết quả backtest: models/metrics.json.  Dữ liệu: 5 cube NASA + 9 chỉ số NOAA (pipeline/indices.py)."""
import json
import sys
import time
from pathlib import Path

import xarray as xr

from pipeline import forecast as F

GRID = Path("processed_data/grid")
VARS = ["t2m", "tair_land", "soil_moisture", "evap_gldas", "precip"]


def main(argv):
    fast = "--fast" in argv
    variant = "outlook" if "--outlook" in argv else "full"
    names = [a for a in argv if not a.startswith("--")] or VARS
    # outlook: production huấn luyện tới 2022 và hiệu chỉnh 2023–2024 (xu hướng gần hiện tại hơn); full: tới 2020 / 2021–2024
    prod_train, prod_cal = ("2022-12-01", "2024-12-01") if variant == "outlook" else ("2020-12-01", "2024-12-01")
    cubes = {v: xr.open_dataarray(GRID / f"cube_{v}.nc").load() for v in VARS if (GRID / f"cube_{v}.nc").exists()}
    kw = dict(n_train=60_000, n_cal=30_000, n_test_cells=600, iters=80, clf_iters=60) if fast else {}
    F.MODEL_DIR.mkdir(exist_ok=True)
    path = F.MODEL_DIR / ("metrics.json" if variant == "full" else "metrics_outlook.json")
    allm = json.loads(path.read_text()) if path.exists() else {}
    for v in names:
        t0 = time.time()
        _, m = F.fit(v, cubes, "2016-12-01", "2019-12-01", variant=variant, **kw)
        allm[v] = m
        print(f"[{v}] backtest xong {time.time() - t0:.0f}s", flush=True)
        for h, r in m["by_horizon"].items():
            md = r["model"]
            pers = r.get("damped_persistence", {}).get("skill_vs_clim", float("nan"))
            print(f"   h={h:>2} skill {md['skill_vs_clim']:+.3f} (ridge {r['ridge_only']['skill_vs_clim']:+.3f}, persist "
                  f"{pers:+.3f}, trend {r['clim_trend']['skill_vs_clim']:+.3f}) | "
                  f"RPSS {md['rpss']:+.3f} (chưa hiệu chỉnh {md['rpss_uncalibrated']:+.3f}) acc3 {md['tercile_accuracy']:.3f} | "
                  f"cov80 {md['coverage_conformal']:.3f}", flush=True)
        t0 = time.time()
        model, _ = F.fit(v, cubes, prod_train, prod_cal, variant=variant, all_cells=True, **kw)
        F.save_model(model, F.model_path(v, variant))
        print(f"[{v}] production xong {time.time() - t0:.0f}s", flush=True)
        path.write_text(json.dumps(allm, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1:])
