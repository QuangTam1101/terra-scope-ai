"""Lớp phân tích cho web Terra-scope AI và AI Earth Detective (docs/01 mục 7).
Mỗi hàm nhận tham số đơn giản (biến, bbox, khoảng thời gian), trả dict JSON-được gồm SỐ LIỆU + NGUỒN + PHƯƠNG PHÁP
+ GIỚI HẠN. Backend chỉ bọc thành endpoint; LLM chỉ gọi như tool rồi diễn giải, không tự tính, không tự bịa số."""
import math
from functools import lru_cache
from pathlib import Path

import xarray as xr

from .checks import SANITY
from .contradictions import hunt_global, pair_difference_test
from .grid import grid_trend, region_series
from .trends import trend_one

CUBE_DIR = Path("data/processed/grid")

# id → (tên hiển thị, đơn vị chuẩn, nguồn NASA hiển thị trên web + báo cáo)
VARIABLES = {
    "precip": ("Lượng mưa", "mm/month", "GPM IMERG Final Monthly V07 (GPM_3IMERGM.07), NASA GES DISC, via Harmony"),
    "soil_moisture": ("Độ ẩm đất 0–10 cm", "m3/m3", "GLDAS Noah 0.25° Monthly v2.1 (GLDAS_NOAH025_M.2.1), NASA GES DISC, via Harmony"),
    "tair_land": ("Nhiệt độ không khí (đất liền)", "degC", "GLDAS Noah 0.25° Monthly v2.1 (GLDAS_NOAH025_M.2.1), NASA GES DISC, via Harmony"),
    "evap_gldas": ("Bốc thoát hơi (GLDAS)", "mm/day", "GLDAS Noah 0.25° Monthly v2.1 (GLDAS_NOAH025_M.2.1), NASA GES DISC, via Harmony"),
    "t2m": ("Nhiệt độ không khí 2 m", "degC", "MERRA-2 M2IMNXASM v5.12.4, NASA GMAO / GES DISC, via Harmony"),
    "ndvi": ("Chỉ số thực vật NDVI", "1", "MODIS Terra MOD13C2 v061 monthly 0.05° CMG NDVI, NASA LP DAAC"),
    "lst_day": ("Nhiệt độ bề mặt ban ngày", "degC", "MODIS Terra MOD11C3 v061 monthly 0.05° CMG daytime LST, NASA LP DAAC"),
    "lst_night": ("Nhiệt độ bề mặt ban đêm", "degC", "MODIS Terra MOD11C3 v061 monthly 0.05° CMG night-time LST, NASA LP DAAC"),
    "et": ("Bốc thoát hơi thực tế", "mm/month", "MODIS Terra MOD16A2GF v061, NASA LP DAAC"),
    "pet": ("Bốc thoát hơi tiềm năng", "mm/month", "GLDAS Noah 0.25° Monthly v2.1 (GLDAS_NOAH025_M.2.1) potential evaporation, NASA GES DISC, via Harmony"),
    # Lưới 0,5° bản mới (preprocess/clean.py), web nối thêm 15/11/2026; id = tên sản phẩm.
    "precip_gpcc": ("Lượng mưa (trạm đo GPCC)", "mm/month", "GPCC Full Data Monthly v2022 0.25°, Deutscher Wetterdienst (không phải NASA; đối chiếu bằng trạm đo)"),
    "precip_cru": ("Lượng mưa (trạm đo CRU TS)", "mm/month", "CRU TS 4.10, University of East Anglia (không phải NASA; đối chiếu bằng trạm đo)"),
    "sm_surface_smap": ("Độ ẩm đất lớp mặt (SMAP)", "m3/m3", "SMAP L3 Radiometer Global Daily 36 km EASE-Grid Soil Moisture v009 (SPL3SMP.009), NASA NSIDC DAAC qua Harmony"),
    "sm_10_40cm_gldas": ("Độ ẩm đất 10–40 cm", "m3/m3", "GLDAS Noah 0.25° Monthly v2.1 (GLDAS_NOAH025_M.2.1) SoilMoi10_40cm_inst qua Giovanni/Harmony"),
    "sm_40_100cm_gldas": ("Độ ẩm đất 40–100 cm", "m3/m3", "GLDAS Noah 0.25° Monthly v2.1 (GLDAS_NOAH025_M.2.1) SoilMoi40_100cm_inst qua Giovanni/Harmony"),
    "sm_100_200cm_gldas": ("Độ ẩm đất 100–200 cm", "m3/m3", "GLDAS Noah 0.25° Monthly v2.1 (GLDAS_NOAH025_M.2.1) SoilMoi100_200cm_inst qua Giovanni/Harmony"),
    "rootmoist_gldas": ("Nước trong đất vùng rễ", "kg/m2", "GLDAS Noah 0.25° Monthly v2.1 (GLDAS_NOAH025_M.2.1) RootMoist_inst qua Giovanni/Harmony"),
    "chlor_a_seawifs": ("Chlorophyll-a mặt biển", "mg/m3", "SeaWiFS Level-3 mapped monthly CHL 9 km, bản 2022.0 (SeaWiFS_L3m_CHL), NASA OB.DAAC"),
    # Cube 1° thêm 16/11/2026 (build_extra_cubes.py)
    "tws_grace": ("Tổng lượng nước lục địa (GRACE)", "cm", "GRACE/GRACE-FO JPL Mascon RL06.3 CRI v04 (TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4), NASA JPL / PO.DAAC; doi:10.5067/TEMSC-3JC634"),
    "swe_gldas": ("Nước trong tuyết (GLDAS)", "kg/m2", "GLDAS Noah 0.25° Monthly v2.1 (GLDAS_NOAH025_M.2.1) SWE_inst qua Giovanni/Harmony"),
    "aod_merra2": ("Độ dày quang học sol khí (MERRA-2)", "1", "MERRA-2 M2TMNXAER v5.12.4 TOTEXTTAU (550 nm), NASA GMAO / GES DISC qua Harmony"),
    "dust_aod_merra2": ("Độ dày quang học bụi (MERRA-2)", "1", "MERRA-2 M2TMNXAER v5.12.4 DUEXTTAU (550 nm), NASA GMAO / GES DISC qua Harmony"),
    "tmax_cru": ("Nhiệt độ cao nhất ngày (CRU TS)", "degC", "CRU TS 4.10 tmx, University of East Anglia (không phải NASA; nội suy từ trạm)"),
    "tmin_cru": ("Nhiệt độ thấp nhất ngày (CRU TS)", "degC", "CRU TS 4.10 tmn, University of East Anglia (không phải NASA; nội suy từ trạm)"),
    "fire_micasa": ("Phát thải carbon do cháy (MiCASA)", "gC/m2/month", "MiCASA v1 monthly 0.1° (MICASA_FLUX_M.1) FIRE, tính từ diện tích cháy MODIS MCD64A1, NASA GES DISC"),
}
METHOD = ("Trung bình vùng trên lưới 1° (trọng số cos vĩ độ); Seasonal Mann-Kendall + Sen's slope theo mùa; "
          "Hamed-Rao MK trên anomaly (hiệu chỉnh tự tương quan); OLS trên anomaly ± CI 95%; FDR Benjamini–Hochberg cho bản đồ")
LIMITATIONS = [
    "Xu hướng quan sát được không chứng minh nguyên nhân.",
    "Lưới 1°: vùng nhỏ hơn ~100 km không phân tích được; ô ven biển có thể lẫn biển (IMERG, MERRA-2).",
    "Biến MODIS (NDVI, LST, ET) trên lưới là 1 pixel mẫu mỗi ô, không phải trung bình ô; thiếu khi trời nhiều mây.",
    "GLDAS và MERRA-2 là mô hình / tái phân tích, không phải quan sát trực tiếp.",
    "Chlorophyll SeaWiFS chỉ có 2001–2010 (vệ tinh ngừng cuối 2010) và chỉ trên biển.",
]


def _clean(x):
    """NaN/inf → None, numpy → python, để json.dumps không lỗi và frontend nhận null."""
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    if hasattr(x, "item"):
        x = x.item()
    return None if isinstance(x, float) and not math.isfinite(x) else x


@lru_cache(maxsize=None)
def load_cube(variable):
    if variable not in VARIABLES:
        raise ValueError(f"Biến không hỗ trợ: {variable}. Có: {list(VARIABLES)}")
    path = CUBE_DIR / f"cube_{variable}.nc"
    if not path.exists():
        raise FileNotFoundError(f"Chưa có dữ liệu lưới cho {variable} ({path})")
    da = xr.open_dataarray(path).load()
    if VARIABLES[variable][1] == "m3/m3":
        # K22 (docs/03): GLDAS ghi 1,0 m³/m³ cố định trên ô băng, ô ven băng có giá trị trộn 0,6–0,95 (cube 1° 0–10 cm: 954 ô;
        # bản 0,5° của preprocess/clean.py chỉ bỏ θ > 0,95 nên còn ~600 ô mỗi tầng). Che cả ô (mọi tháng) nếu có lúc vượt SANITY.
        da = da.where(da.max("time") <= SANITY["soil_moisture"][1])
    return da


def _meta(variable):
    name, unit, source = VARIABLES[variable]
    return {"variable": variable, "name": name, "unit": unit, "source": source}


def list_variables():
    return [_clean({**_meta(v), "available": (CUBE_DIR / f"cube_{v}.nc").exists()}) for v in VARIABLES]


def trend_map(variable, start=None, end=None, q=0.05):
    """Heatmap: mọi ô có kết quả → [lat, lon, slope/thập kỷ, q-value FDR]; significant = q < 0.05."""
    tr = grid_trend(load_cube(variable), start, end)
    df = tr[["slope_per_decade", "p_value_fdr"]].to_dataframe().dropna().reset_index()
    return _clean({**_meta(variable), "start": tr.attrs["start"], "end": tr.attrs["end"], "q_threshold": q,
                   "columns": ["lat", "lon", "slope_per_decade", "q_value"],
                   "cells": df[["lat", "lon", "slope_per_decade", "p_value_fdr"]].round(5).values.tolist(),
                   "method": METHOD})


def _region(variable, bbox, start, end):
    value, frac = region_series(load_cube(variable), bbox)
    return value[start:end].asfreq("MS"), frac[start:end]


def analyze_region(variable, bbox, start=None, end=None):
    """Một vùng bất kỳ người dùng vẽ: chuỗi tháng + xu hướng (p, CI) + chất lượng dữ liệu + nguồn + giới hạn."""
    s, frac = _region(variable, bbox, start, end)
    tr = trend_one(s)
    return _clean({**_meta(variable), "bbox": list(bbox), "start": str(s.index[0].date()), "end": str(s.index[-1].date()),
                   "series": {"time": s.index.strftime("%Y-%m").tolist(), "value": s.round(4).tolist(),
                              "valid_frac": frac.round(3).tolist()},
                   "trend": tr,
                   "quality": {"months_with_data": int(s.notna().sum()), "months_total": len(s),
                               "mean_valid_frac": float(frac.mean()), "insufficient_data": tr["insufficient_data"]},
                   "method": METHOD, "limitations": LIMITATIONS})


def compare_regions(variable, bbox_a, bbox_b, start=None, end=None, alpha=0.05):
    """Hai vùng người dùng chọn: xu hướng mỗi vùng + kiểm định KHÁC BIỆT (docs/05 loại A, bước 4)."""
    a, _ = _region(variable, bbox_a, start, end)
    b, _ = _region(variable, bbox_b, start, end)
    diff = pair_difference_test(a, b)
    reliable = diff["p_diff"] < alpha and (diff["ci95_low"] > 0 or diff["ci95_high"] < 0)
    return _clean({**_meta(variable), "region_a": {"bbox": list(bbox_a), "trend": trend_one(a)},
                   "region_b": {"bbox": list(bbox_b), "trend": trend_one(b)},
                   "difference": diff, "reliable": bool(reliable),
                   "method": METHOD + "; khác biệt: Hamed-Rao MK + Sen trên hiệu anomaly A − B, CI bootstrap khối 12 tháng",
                   "limitations": LIMITATIONS})


def find_contradictions(variable, start=None, end=None, top_n=10):
    """Contradiction Hunter toàn cầu: điểm nóng tăng / giảm tự tìm + các cặp đã kiểm định khác biệt."""
    pairs, spots = hunt_global(load_cube(variable), variable, VARIABLES[variable][1], start, end, top_n=top_n)
    return _clean({**_meta(variable), "start": start, "end": end,
                   "hotspots": spots.to_dict("records"), "pairs": pairs.head(top_n).to_dict("records"),
                   "method": "Grid trend + FDR → gom ô liền kề cùng chiều → kiểm định khác biệt từng cặp (docs/05)",
                   "limitations": LIMITATIONS})
