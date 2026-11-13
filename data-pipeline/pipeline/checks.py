"""Kiểm tra sau chuẩn hoá (docs/03 §H, §I, §J; docs/01 S7): khoảng toàn cầu, kiểm tra chéo nguồn,
chuỗi đủ để chạy xu hướng. Tên biến theo docs/01 mục 4."""
import pandas as pd

# Khoảng kỳ vọng toàn cầu (đơn vị chuẩn) 🔬
SANITY = {
    "ndvi": (-0.2, 1.0), "lst_day": (-70, 80), "lst_night": (-80, 50),       # 1, °C
    "et": (0, 350), "pet": (0, 700),                                         # mm/month
    "et_pet_ratio": (0, 1.2), "precip": (0, 3000),                           # 1, mm/month
    "soil_moisture": (0, 0.6), "tair_land": (-70, 50), "t2m": (-70, 50),     # m3/m3, °C
    "evap_gldas": (0, 12),                                                   # mm/day
}


def sanity_report(obs):
    """obs: bảng chuẩn (variable, value). Trả số dòng ngoài khoảng kỳ vọng theo biến, để người xem lại."""
    lo = obs["variable"].map(lambda v: SANITY[v][0])
    hi = obs["variable"].map(lambda v: SANITY[v][1])
    bad = obs[obs["value"].notna() & ((obs["value"] < lo) | (obs["value"] > hi))]
    return bad.groupby("variable").size()


def cross_check_temp(lst_day_c, tair_c):
    """LST ban ngày (MODIS, °C) vs nhiệt độ không khí (GLDAS Tair hoặc MERRA-2 T2M, °C), cùng vùng, cùng tháng."""
    both = pd.concat([lst_day_c, tair_c], axis=1, keys=["lst", "air"]).dropna()
    return {"r": float(both["lst"].corr(both["air"])),          # kỳ vọng r > 0.7 (cùng nhịp mùa)
            "frac_lst_gt_air": float((both["lst"] > both["air"]).mean()),  # ban ngày thường > 0.8
            "n": len(both)}


def cross_check_et(et_modis_month, evap_gldas_mm_day):
    """ET MODIS (mm/tháng) vs GLDAS Evap (mm/ngày → mm/tháng)."""
    gldas = evap_gldas_mm_day * evap_gldas_mm_day.index.days_in_month
    both = pd.concat([et_modis_month, gldas], axis=1, keys=["modis", "gldas"]).dropna()
    return {"r": float(both["modis"].corr(both["gldas"])),
            "ratio_median": float((both["modis"] / both["gldas"]).median()), "n": len(both)}


def trend_ready(s, n_expected=288, min_frac=0.7, min_years_per_month=10):
    """s: chuỗi tháng (index = ngày đầu tháng, NaN = thiếu)."""
    full = pd.date_range("2001-01-01", "2024-12-01", freq="MS")
    s = s.reindex(full)
    per_month = s.notna().groupby(s.index.month).sum()      # mỗi tháng trong năm có bao nhiêu năm
    gap = (s.isna().astype(int).groupby(s.notna().cumsum()).sum()).max()  # khoảng trống dài nhất
    checks = {
        "length_ok": len(s) == n_expected,
        "frac_ok": s.notna().mean() >= min_frac,
        "every_month_ok": bool((per_month >= min_years_per_month).all()),  # Seasonal MK so tháng với tháng
        "longest_gap_months": int(gap),
    }
    checks["ready"] = checks["length_ok"] and checks["frac_ok"] and checks["every_month_ok"]
    return checks
