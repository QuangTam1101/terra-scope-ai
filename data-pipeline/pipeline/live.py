"""Quan sát MỚI để dự báo "từ bây giờ" (docs/05 mục 10).

Cube NASA trong git dừng ở 12/2024 nên mô hình Satellite không biết gì sau đó. Module này lấy số liệu hàng tháng đến tháng gần nhất
từ NASA POWER (MERRA-2 / IMERG hiệu chỉnh; API công khai, không cần khoá), đổi sang anomaly chuẩn hoá (z) cùng kiểu với mô hình,
rồi đưa vào các đặc trưng "lag" của mô hình Satellite.

Quyền riêng tư: chỉ gửi toạ độ TÂM Ô 1° (làm tròn) tới NASA, không gửi gì khác; kết quả lưu cache trên đĩa để không gọi lại.

Ánh xạ biến (z là không thứ nguyên nên khác đơn vị giữa sản phẩm không sao):
  t2m, tair_land → T2M      precip → PRECTOTCORR × số ngày      soil_moisture → GWETTOP      evap_gldas → EVLAND
"""
from __future__ import annotations

import calendar
import io
import json
import time
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

POWER_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
POWER_PARAMS = "T2M,PRECTOTCORR,GWETTOP,EVLAND"
GISTEMP_URL = "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv"
CACHE_DIR = Path(__file__).resolve().parents[1] / "cache"
COLS = ("t2m", "precip", "soil", "evap")
VAR_COL = {"t2m": "t2m", "tair_land": "t2m", "precip": "precip", "soil_moisture": "soil", "evap_gldas": "evap"}
SD_FLOOR = {"t2m": 0.1, "precip": 2.0, "soil": 0.01, "evap": 0.02}   # sàn độ lệch chuẩn theo đơn vị của POWER
ZCLIP = 5.0
UA = "terra-scope-forecast/1.0"


def cell_center(lat: float, lon: float, step: float = 1.0) -> tuple[float, float]:
    """Tâm ô lưới chứa điểm: chỉ toạ độ này được gửi ra ngoài."""
    lat = min(max(float(lat), -89.999), 89.999)
    lon = (float(lon) + 180.0) % 360.0 - 180.0
    return (np.floor(lat / step) * step + step / 2, np.floor(lon / step) * step + step / 2)


def _http_get(url: str, timeout: float = 60.0) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _cache_path(name: str) -> Path:
    return CACHE_DIR / name


def _fresh(p: Path, ttl_days: float) -> bool:
    return p.exists() and (time.time() - p.stat().st_mtime) < ttl_days * 86400


def parse_power(raw: dict) -> pd.DataFrame:
    """JSON của POWER → DataFrame theo tháng (index = ngày đầu tháng) với cột t2m (°C), precip (mm/tháng), soil (0–1), evap (mm/ngày)."""
    par = raw["properties"]["parameter"]
    months = sorted(k for k in par["T2M"] if not k.endswith("13"))           # '13' = TB cả năm
    idx = pd.to_datetime([f"{k[:4]}-{k[4:]}-01" for k in months])

    def col(name):
        v = np.array([par[name][k] for k in months], dtype="float64")
        v[v <= -990] = np.nan                                              # -999 = thiếu
        return v
    days = np.array([calendar.monthrange(t.year, t.month)[1] for t in idx])
    return pd.DataFrame({"t2m": col("T2M"), "precip": col("PRECTOTCORR") * days, "soil": col("GWETTOP"), "evap": col("EVLAND")}, index=idx)


def power_monthly(lat: float, lon: float, ttl_days: float = 3.0, fetch=_http_get, cache: bool = True) -> pd.DataFrame:
    """Chuỗi tháng 2001 → tháng gần nhất cho ô 1° chứa (lat, lon). Cache JSON trên đĩa `ttl_days` ngày."""
    la, lo = cell_center(lat, lon)
    p = _cache_path(f"power/{la:+06.1f}_{lo:+07.1f}.json")
    if cache and _fresh(p, ttl_days):
        raw = json.loads(p.read_text())
    else:
        url = (f"{POWER_URL}?parameters={POWER_PARAMS}&community=AG&longitude={lo}&latitude={la}"
               f"&start=2001&end={pd.Timestamp.today().year}&format=JSON")
        raw = json.loads(fetch(url))
        if "properties" not in raw:
            raise RuntimeError("NASA POWER returned no data for this location")
        if cache:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(raw))
    return parse_power(raw)


def power_z(df: pd.DataFrame, base_end_year: int = 2020) -> pd.DataFrame:
    """z-score theo tháng lịch với khí hậu 2001..base_end_year (cùng kiểu mô hình, chỉ dùng giai đoạn nền để tính TB và độ lệch chuẩn)."""
    out = pd.DataFrame(index=df.index, columns=df.columns, dtype="float64")
    base = df.loc[:f"{base_end_year}-12-31"]
    for c in df.columns:
        mu = base[c].groupby(base.index.month).mean()
        sd = base[c].groupby(base.index.month).std(ddof=1).clip(lower=SD_FLOOR[c])
        m = df.index.month
        out[c] = ((df[c] - mu.reindex(m).to_numpy()) / sd.reindex(m).to_numpy()).clip(-ZCLIP, ZCLIP)
    return out


def last_complete(z: pd.DataFrame, cols=COLS) -> pd.Timestamp:
    """Tháng gần nhất mà MỌI cột cần thiết đều có số liệu."""
    return z[list(cols)].dropna().index.max()


def gistemp_global(ttl_days: float = 3.0, fetch=_http_get) -> pd.Series:
    """Anomaly nhiệt độ toàn cầu hàng tháng của NASA GISTEMP (so với 1951–1980), cache trên đĩa."""
    p = _cache_path("gistemp_glb.csv")
    if _fresh(p, ttl_days):
        raw = p.read_text()
    else:
        raw = fetch(GISTEMP_URL).decode()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(raw)
    df = pd.read_csv(io.StringIO(raw), skiprows=1).replace("***", np.nan)
    s = {}
    for _, r in df.iterrows():
        for m, c in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1):
            v = pd.to_numeric(r[c], errors="coerce")
            if pd.notna(v):
                s[pd.Timestamp(int(r["Year"]), m, 1)] = float(v)
    return pd.Series(s).sort_index()


def refresh_indices(max_age_days: float = 3.0) -> bool:
    """Tải lại 9 chỉ số khí hậu của NOAA nếu file cũ hơn `max_age_days`; lỗi mạng thì dùng bản đang có. Trả True nếu vừa tải mới."""
    from . import indices
    if _fresh(indices.CSV, max_age_days):
        return False
    try:
        indices.download()
        return True
    except Exception:
        return False


def indices_extended(ext: pd.DatetimeIndex) -> pd.DataFrame:
    """Chỉ số NOAA trên trục thời gian `ext`: giữ giá trị gần nhất tới 6 tháng (ENSO, SOI, PDO, IOD thay đổi chậm), NAO và QBO tới 3 tháng, sau đó 0."""
    from . import indices
    d = indices.load().reindex(ext)
    slow = [c for c in ("nino12", "nino3", "nino4", "nino34", "soi", "pdo", "dmi") if c in d]
    fast = [c for c in ("nao", "qbo") if c in d]
    d[slow] = d[slow].ffill(limit=6)
    d[fast] = d[fast].ffill(limit=3)
    return d.fillna(0.0)


def indices_last_update() -> dict:
    """Tháng cuối có dữ liệu của từng chỉ số (để cho người dùng biết độ mới)."""
    from . import indices
    d = indices.load()
    return {c: d[c].dropna().index.max().strftime("%Y-%m") for c in d.columns if d[c].notna().any()}
