"""Kiểm chứng cách dự báo từ quan sát MỚI (NASA POWER) trên số đo thật sau giai đoạn mô hình đã thấy (từ 2025-01 đến tháng gần nhất).
Chạy từ data-pipeline/:  ../.venv/bin/python live_backtest.py [số_ô_đất] [số_ô_biển]
Chọn ngẫu nhiên (seed cố định) ô đất liền (cho cả 5 biến) và ô biển (chỉ t2m, mưa); mỗi ô gọi POWER một lần (cache trên đĩa).
Kết quả: models/live_backtest.json — web dùng để hiển thị độ tin cậy ĐO ĐƯỢC của chế độ "từ bây giờ"."""
import json
import sys
import time

import numpy as np

from pipeline import forecast as F
from pipeline import live

VARS = ["t2m", "tair_land", "soil_moisture", "evap_gldas", "precip"]


def main(n_land=60, n_sea=20, seed=0):
    rng = np.random.default_rng(seed)
    models = {v: F.load_model(v, "full") for v in VARS}
    land = np.array(sorted(set(models["soil_moisture"]["valid"].tolist()) & set(models["tair_land"]["valid"].tolist())))
    sea = np.array(sorted(set(models["t2m"]["valid"].tolist()) - set(land.tolist())))
    pick = {"land": rng.choice(land, n_land, replace=False), "sea": rng.choice(sea, n_sea, replace=False)}
    lat, lon = models["t2m"]["lat"], models["t2m"]["lon"]
    frames = {}
    t0 = time.time()
    for kind, idx in pick.items():
        for c in idx:
            key = (float(lat[c]), float(lon[c]))
            try:
                frames[(kind, key)] = live.power_monthly(*key)
            except Exception as e:                                   # một ô lỗi mạng thì bỏ qua, không dừng cả lần chạy
                print("skip", key, e)
            time.sleep(0.4)
    print(f"downloaded {len(frames)} cells in {time.time() - t0:.0f}s", flush=True)
    out = {}
    for v in VARS:
        use = {k[1]: df for k, df in frames.items() if k[0] == "land" or v in ("t2m", "precip")}
        out[v] = F.live_backtest(v, use, model=models[v])
        b = out[v]["by_horizon"]
        print(f"[{v}] cells {out[v]['n_cells']} " + " | ".join(
            f"h{h}: skill {r['model']['skill_vs_clim']:+.2f} rpss {r['model']['rpss']:+.2f} acc3 {r['model']['tercile_accuracy']:.2f} (persist {r['persistence']['skill_vs_clim']:+.2f})"
            for h, r in b.items()), flush=True)
    (F.MODEL_DIR / "live_backtest.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    a = sys.argv[1:]
    main(*(int(x) for x in a))
