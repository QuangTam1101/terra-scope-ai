"""Cầu nối duy nhất giữa backend và `data-pipeline/pipeline`. Backend KHÔNG tự tính thống kê:
mọi xu hướng / kiểm định đều gọi hàm của pipeline (Long, Đăng)."""
import base64
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

from . import config  # phải import trước: thêm data-pipeline vào sys.path
from .errors import ApiError

from pipeline import api as papi  # noqa: E402
from pipeline.contradictions import pair_difference_test  # noqa: E402,F401  (re-export)
from pipeline.grid import grid_trend, region_series, shape_mask  # noqa: E402,F401
from pipeline.trends import anomaly, trend_one  # noqa: E402,F401

papi.CUBE_DIR = config.CUBE_DIR


def set_cube_dir(path) -> None:
    """Đổi thư mục cube (dùng cho test hoặc khi Long bàn giao dữ liệu ở chỗ khác) và xoá cache."""
    config.CUBE_DIR = papi.CUBE_DIR = Path(path)
    papi.load_cube.cache_clear()
    _load_v2.cache_clear()
    _meta.cache_clear()
    grid_result.cache_clear()


# pipeline id (cube 1° cũ) → tên sản phẩm lưới 0,5° bản mới (preprocess/clean.py) và đơn vị của sản phẩm đó.
# ponytail: coverage đọc từ trục time; file GRID_V2_DIR chưa cắt thì GPCC/SMAP báo 2001–2025 (trục rỗng),
# cần bản cắt như data/web_cubes (cube_<id>.nc) nếu bật GRID_V2_DIR có các sản phẩm này.
V2_PRODUCT = {"precip": "precip_imerg", "soil_moisture": "sm_0_10cm_gldas", "tair_land": "tair_gldas",
              "evap_gldas": "evap_gldas", "t2m": "t2m_merra2", "ndvi": "ndvi_modis", "lst_day": "lst_day_modis",
              "lst_night": "lst_night_modis", "pet": "pet_gldas",
              **{p: p for p in ("precip_gpcc", "precip_cru", "sm_surface_smap", "sm_10_40cm_gldas", "sm_40_100cm_gldas",
                                "sm_100_200cm_gldas", "rootmoist_gldas")}}
V2_UNITS = {"precip_imerg": "mm/month", "sm_0_10cm_gldas": "m3/m3", "tair_gldas": "degC",
            "evap_gldas": "mm/month", "t2m_merra2": "degC", "ndvi_modis": "1", "lst_day_modis": "degC",
            "lst_night_modis": "degC", "pet_gldas": "mm/month",
            "precip_gpcc": "mm/month", "precip_cru": "mm/month", "sm_surface_smap": "m3/m3", "sm_10_40cm_gldas": "m3/m3",
            "sm_40_100cm_gldas": "m3/m3", "sm_100_200cm_gldas": "m3/m3", "rootmoist_gldas": "kg/m2"}


def _v2_path(pipeline_id: str) -> Path | None:
    prod = V2_PRODUCT.get(pipeline_id)
    if not (config.USE_GRID_V2 and prod):
        return None
    p = config.GRID_V2_DIR / f"{prod}.nc"
    return p if p.exists() else None


def cube_path(pipeline_id: str) -> Path:
    return _v2_path(pipeline_id) or papi.CUBE_DIR / f"cube_{pipeline_id}.nc"


def units(pipeline_id: str) -> str:
    """Đơn vị của dữ liệu thực sự đang dùng (bản mới đổi bốc thoát hơi sang mm/month)."""
    p = _v2_path(pipeline_id)
    return V2_UNITS[V2_PRODUCT[pipeline_id]] if p else papi.VARIABLES[pipeline_id][1]


def source_label(pipeline_id: str) -> str:
    p = _v2_path(pipeline_id)
    return f"{p.stem} (0.5° global grid, data-pipeline preprocess/clean.py)" if p else f"cube_{pipeline_id} (1° grid)"


@lru_cache(maxsize=None)
def _load_v2(path: str, _mtime: float):
    with xr.open_dataset(path) as ds:
        name = next(iter(ds.data_vars))
        return ds[name].load()


def is_available(pipeline_id: str) -> bool:
    return cube_path(pipeline_id).exists()


def _time_index(da) -> pd.DatetimeIndex:
    idx = da.indexes["time"]
    return idx.to_datetimeindex() if hasattr(idx, "to_datetimeindex") else pd.DatetimeIndex(idx)


@lru_cache(maxsize=None)
def _meta(path: str, _mtime: float) -> dict:
    """Thông tin cube đọc từ trục toạ độ (không nạp dữ liệu): thời gian, cỡ ô, vùng phủ.
    Cube có thể là lưới 1° toàn cầu (download_grid.py) hoặc lưới gốc theo vùng (backend/scripts/download_region.py)."""
    with xr.open_dataset(path) as ds:
        da = ds[next(iter(ds.data_vars))]
        t = _time_index(da)
        lat, lon = da["lat"].values.astype("float64"), da["lon"].values.astype("float64")
        polar = "cell" in da.dims
    if polar:     # lưới cực băng biển (time, cell): pixel 25 km ≈ 0,25°; vùng phủ = dải vĩ độ của các pixel
        return {"start": t.min().strftime("%Y-%m"), "end": t.max().strftime("%Y-%m"), "cell_size_deg": 0.25,
                "extent": (-180.0, round(float(lat.min()), 4), 180.0, round(float(lat.max()), 4)), "grid": "polar"}
    res = float(np.round(np.median(np.abs(np.diff(lat))), 4)) if len(lat) > 1 else 1.0
    half = res / 2
    return {"start": t.min().strftime("%Y-%m"), "end": t.max().strftime("%Y-%m"), "cell_size_deg": res,
            "extent": (round(lon.min() - half, 4), round(lat.min() - half, 4),
                       round(lon.max() + half, 4), round(lat.max() + half, 4))}


def meta(pipeline_id: str) -> dict | None:
    p = cube_path(pipeline_id)
    return _meta(str(p), p.stat().st_mtime) if p.exists() else None


def polar_info(pipeline_id: str) -> dict:
    """Lưới cực của cube băng biển cho bản đồ web: số hàng/cột mỗi bán cầu + mặt nạ đất/ven bờ (np.packbits theo hàng,
    base64) để vẽ đất đúng từng pixel, không cần chiếu đường bờ biển."""
    a = load_cube(pipeline_id).attrs
    return {h.upper(): {"rows": int(a[f"shape_{h}"][0]), "cols": int(a[f"shape_{h}"][1]),
                        "land_b64": base64.b64encode(np.asarray(a[f"land_{h}"], dtype="uint8").tobytes()).decode("ascii")}
            for h in ("n", "s")}


def coverage(pipeline_id: str) -> tuple[str, str] | None:
    m = meta(pipeline_id)
    return (m["start"], m["end"]) if m else None


def load_cube(pipeline_id: str):
    p = _v2_path(pipeline_id)
    if p:
        return _load_v2(str(p), p.stat().st_mtime)
    try:
        return papi.load_cube(pipeline_id)
    except FileNotFoundError:
        raise ApiError(503, "DATA_NOT_READY", f"Data for '{pipeline_id}' is not available on the server yet.",
                       {"variable": pipeline_id}, retryable=False)


@lru_cache(maxsize=32)
def grid_result(pipeline_id: str, start: str, end: str):
    """Seasonal MK + Sen cho mọi ô + FDR toàn lưới (pipeline.grid.grid_trend). Cache vì tính cả lưới mất vài giây."""
    return grid_trend(load_cube(pipeline_id), start, end, annual=pipeline_id in papi.ANNUAL_SLOPE)
