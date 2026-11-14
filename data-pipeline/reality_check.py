"""Kiểm chứng dự báo bằng số liệu THẬT mà mô hình chưa từng thấy: NASA GISS GISTEMP v4 (nhiệt độ bề mặt toàn cầu / Bắc / Nam bán cầu,
cập nhật hàng tháng, có đến 2026). Chạy từ data-pipeline/:  ../.venv/bin/python reality_check.py
  * Mô hình "full" (quan sát vệ tinh tới 12/2024): dự báo 2025-01…2025-12 từ origin 12/2024.
  * Mô hình "outlook" (chỉ số khí hậu): dự báo 2025-01…2026-06 từ origin 12/2024 (chỉ dùng chỉ số tới 12/2024).
So với: khí hậu (anomaly = 0) và persistence (anomaly tháng 12/2024 giữ nguyên). Anomaly thật = GISTEMP trừ TB cùng tháng lịch
trên CÙNG giai đoạn khí hậu mà mô hình dùng (2001 đến năm cuối huấn luyện). Kết quả: models/reality_check.json."""
import io
import json
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

from pipeline import forecast as F

GISTEMP = "https://data.giss.nasa.gov/gistemp/tabledata_v4/{}.Ts+dSST.csv"
REGIONS = {"global": ("GLB", [-180, -90, 180, 90]), "northern_hemisphere": ("NH", [-180, 0, 180, 90]), "southern_hemisphere": ("SH", [-180, -90, 180, 0])}
ORIGIN = pd.Timestamp("2024-12-01")


def gistemp(code):
    raw = urllib.request.urlopen(GISTEMP.format(code), timeout=60).read().decode()
    df = pd.read_csv(io.StringIO(raw), skiprows=1).replace("***", np.nan)
    s = {}
    for _, r in df.iterrows():
        for m, c in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1):
            v = pd.to_numeric(r[c], errors="coerce")
            if pd.notna(v):
                s[pd.Timestamp(int(r["Year"]), m, 1)] = float(v)
    return pd.Series(s).sort_index()


def main():
    cubes = {v: xr.open_dataarray(f"processed_data/grid/cube_{v}.nc").load() for v in F.AUX if Path(f"processed_data/grid/cube_{v}.nc").exists()}
    out = {"source": "NASA GISS Surface Temperature Analysis (GISTEMP v4), land + ocean, monthly", "origin": str(ORIGIN.date())[:7],
           "generated": str(pd.Timestamp.today().date()), "regions": {}}
    for name, (code, bbox) in REGIONS.items():
        g = gistemp(code)
        out["regions"][name] = {}
        for variant, last in (("full", "2025-12"), ("outlook", "2026-06")):
            model = F.load_model("t2m", variant)
            ty = int(model["train_end"][:4])
            base = g.loc["2001-01-01":f"{ty}-12-31"].groupby(g.loc["2001-01-01":f"{ty}-12-31"].index.month).mean()
            anom = pd.Series({t: v - base[t.month] for t, v in g.items()})
            targets = [t.strftime("%Y-%m") for t in pd.date_range("2025-01-01", last + "-01", freq="MS")]
            f = F.forecast_region("t2m", cubes, bbox, origin=ORIGIN, model=model, targets=targets, variant=variant)
            clim = np.array(f["climatology"])
            fa, lo, hi = np.array(f["forecast"]) - clim, np.array(f["lower"]) - clim, np.array(f["upper"]) - clim
            act = np.array([anom.get(pd.Timestamp(t + "-01"), np.nan) for t in targets])
            ok = np.isfinite(act)
            pers = float(anom[ORIGIN])
            out["regions"][name][variant] = {
                "months": targets, "actual": np.round(act, 3).tolist(), "forecast": np.round(fa, 3).tolist(),
                "lower": np.round(lo, 3).tolist(), "upper": np.round(hi, 3).tolist(), "persistence": round(pers, 3),
                "p_above": np.round(f["p_above"], 3).tolist(), "baseline_period": f"2001-{ty}",
                "mae_model": round(float(np.mean(np.abs(fa - act)[ok])), 3), "mae_climatology": round(float(np.mean(np.abs(act)[ok])), 3),
                "mae_persistence": round(float(np.mean(np.abs(pers - act)[ok])), 3),
                "coverage_80": round(float(np.mean(((act >= lo) & (act <= hi))[ok])), 3), "n_months": int(ok.sum()),
                "share_above_normal_actual": round(float(np.mean((act > 0)[ok])), 3)}
            r = out["regions"][name][variant]
            print(f"{name:20s} {variant:8s} n={r['n_months']:>2}  MAE model {r['mae_model']:.2f} | clim {r['mae_climatology']:.2f} | persist {r['mae_persistence']:.2f} | "
                  f"cover80 {r['coverage_80']:.2f}", flush=True)
    F.MODEL_DIR.mkdir(exist_ok=True)
    (F.MODEL_DIR / "reality_check.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
