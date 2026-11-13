"""Cầu nối duy nhất giữa backend và `data-pipeline/pipeline`. Backend KHÔNG tự tính thống kê:
mọi xu hướng / kiểm định đều gọi hàm của pipeline (Long, Đăng)."""
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

from . import config  # phải import trước: thêm data-pipeline vào sys.path
from .errors import ApiError

from pipeline import api as papi  # noqa: E402
from pipeline.contradictions import pair_difference_test  # noqa: E402,F401  (re-export)
from pipeline.grid import grid_trend, region_series  # noqa: E402,F401
from pipeline.trends import anomaly, trend_one  # noqa: E402,F401

papi.CUBE_DIR = config.CUBE_DIR


def set_cube_dir(path) -> None:
    """Đổi thư mục cube (dùng cho test hoặc khi Long bàn giao dữ liệu ở chỗ khác) và xoá cache."""
    config.CUBE_DIR = papi.CUBE_DIR = Path(path)
    papi.load_cube.cache_clear()
    _meta.cache_clear()
    grid_result.cache_clear()


def cube_path(pipeline_id: str) -> Path:
    return papi.CUBE_DIR / f"cube_{pipeline_id}.nc"


def is_available(pipeline_id: str) -> bool:
    return cube_path(pipeline_id).exists()


def _time_index(da) -> pd.DatetimeIndex:
    idx = da.indexes["time"]
    return idx.to_datetimeindex() if hasattr(idx, "to_datetimeindex") else pd.DatetimeIndex(idx)


@lru_cache(maxsize=None)
def _meta(path: str, _mtime: float) -> dict:
    """Thông tin cube đọc từ trục toạ độ (không nạp dữ liệu): thời gian, cỡ ô, vùng phủ.
    Cube có thể là lưới 1° toàn cầu (download_grid.py) hoặc lưới gốc theo vùng (backend/scripts/download_region.py)."""
    with xr.open_dataarray(path) as da:
        t = _time_index(da)
        lat, lon = da["lat"].values.astype("float64"), da["lon"].values.astype("float64")
    res = float(np.round(np.median(np.abs(np.diff(lat))), 4)) if len(lat) > 1 else 1.0
    half = res / 2
    return {"start": t.min().strftime("%Y-%m"), "end": t.max().strftime("%Y-%m"), "cell_size_deg": res,
            "extent": (round(lon.min() - half, 4), round(lat.min() - half, 4),
                       round(lon.max() + half, 4), round(lat.max() + half, 4))}


def meta(pipeline_id: str) -> dict | None:
    p = cube_path(pipeline_id)
    return _meta(str(p), p.stat().st_mtime) if p.exists() else None


def coverage(pipeline_id: str) -> tuple[str, str] | None:
    m = meta(pipeline_id)
    return (m["start"], m["end"]) if m else None


def load_cube(pipeline_id: str):
    try:
        return papi.load_cube(pipeline_id)
    except FileNotFoundError:
        raise ApiError(503, "DATA_NOT_READY", f"Data for '{pipeline_id}' is not available on the server yet.",
                       {"variable": pipeline_id}, retryable=False)


@lru_cache(maxsize=32)
def grid_result(pipeline_id: str, start: str, end: str):
    """Seasonal MK + Sen cho mọi ô + FDR toàn lưới (pipeline.grid.grid_trend). Cache vì tính cả lưới mất vài giây."""
    return grid_trend(load_cube(pipeline_id), start, end)
