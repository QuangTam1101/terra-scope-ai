"""Test chạy trên cube GIẢ (sinh ngẫu nhiên có xu hướng biết trước), không cần dữ liệu NASA thật, không gọi mạng."""
import os
import sys
from pathlib import Path

os.environ.setdefault("WARM_UP", "0")        # test không cần tính sẵn bản đồ

import numpy as np
import pandas as pd
import pytest
import xarray as xr

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import bridge  # noqa: E402
from app.main import app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

LAT = np.arange(5.5, 25, 1.0)        # 5.5 … 24.5
LON = np.arange(100.5, 110, 1.0)     # 100.5 … 109.5
TIME = pd.date_range("2001-01-01", "2020-12-01", freq="MS")


def _cube(name, base, amp, trend_west, trend_east, noise, land_only=False, seed=0):
    rng = np.random.default_rng(seed)
    years = (np.arange(len(TIME)) / 12.0)[:, None, None]
    season = amp * np.sin(2 * np.pi * (TIME.month.to_numpy() - 4) / 12)[:, None, None]
    trend = np.where(LON[None, None, :] < 105, trend_west, trend_east) * years
    data = base + season + trend + rng.normal(0, noise, (len(TIME), len(LAT), len(LON)))
    data = np.broadcast_to(data, (len(TIME), len(LAT), len(LON))).copy()
    if land_only:
        data[:, :, LON >= 108] = np.nan            # "biển" ở phía đông
    return xr.DataArray(data, coords={"time": TIME, "lat": LAT, "lon": LON}, dims=("time", "lat", "lon"), name=name)


@pytest.fixture(scope="session")
def client(tmp_path_factory):
    d = tmp_path_factory.mktemp("grid")
    # Mưa: phía tây tăng 2 mm/tháng mỗi năm (= +20 / thập kỷ), phía đông giảm 2 mm/tháng mỗi năm.
    _cube("precip", 150, 80, 2.0, -2.0, 5.0).to_netcdf(d / "cube_precip.nc")
    _cube("soil_moisture", 0.30, 0.05, 0.002, 0.002, 0.005, land_only=True, seed=1).to_netcdf(d / "cube_soil_moisture.nc")
    # Cube lưới mịn 0,25° chỉ phủ ĐBSCL (giống cube do scripts/download_region.py tạo), float32 như file thật.
    lat, lon = np.arange(8.125, 12, 0.25), np.arange(104.125, 107, 0.25)
    rng = np.random.default_rng(2)
    fine = (3 + 0.01 * (np.arange(len(TIME)) / 12)[:, None, None]
            + rng.normal(0, 0.05, (len(TIME), len(lat), len(lon)))).astype("float32")
    xr.DataArray(fine, coords={"time": TIME, "lat": lat.astype("float32"), "lon": lon.astype("float32")},
                 dims=("time", "lat", "lon"), name="evap_gldas").to_netcdf(d / "cube_evap_gldas.nc")
    bridge.set_cube_dir(d)
    return TestClient(app)
