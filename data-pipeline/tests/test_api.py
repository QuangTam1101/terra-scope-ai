import json

import numpy as np
import pandas as pd
import pytest
import xarray as xr

from pipeline import api
from pipeline.grid import points_to_cube, write_grid_points
from pipeline.report import evidence_report

TIME = pd.date_range("2001-01-01", "2024-12-01", freq="MS")


@pytest.fixture
def cube_dir(tmp_path, monkeypatch):
    """Cube mưa giả 12×20 ô: khối tây nam tăng, khối đông bắc giảm, còn lại nhiễu."""
    rng = np.random.default_rng(1)
    lat, lon = np.arange(0.5, 12), np.arange(100.5, 120)
    yrs = ((TIME - TIME[0]).days / 365.25).to_numpy()[:, None, None]
    la, lo = np.meshgrid(lat, lon, indexing="ij")
    trend = np.where((la < 5) & (lo < 106), 3.0, 0) + np.where((la > 6) & (lo > 113), -3.0, 0)
    v = 100 + trend * yrs + 30 * np.sin(2 * np.pi * TIME.month.to_numpy() / 12)[:, None, None] \
        + rng.normal(0, 3, (len(TIME), len(lat), len(lon)))
    xr.DataArray(v, coords={"time": TIME, "lat": lat, "lon": lon}, dims=("time", "lat", "lon"),
                 name="precip").to_netcdf(tmp_path / "cube_precip.nc")
    monkeypatch.setattr(api, "CUBE_DIR", tmp_path)
    api.load_cube.cache_clear()
    yield tmp_path
    api.load_cube.cache_clear()


def test_list_variables_marks_available(cube_dir):
    av = {v["variable"]: v["available"] for v in api.list_variables()}
    assert av["precip"] and not av["ndvi"]


def test_trend_map_json_and_window(cube_dir):
    m = api.trend_map("precip", "2005-01-01", "2024-12-01")
    json.dumps(m)                                               # NaN → null, không lỗi
    assert m["start"] == "2005-01-01" and len(m["cells"]) == 12 * 20
    cell = {(c[0], c[1]): c for c in m["cells"]}[(0.5, 100.5)]
    assert cell[2] > 20 and cell[3] < 0.05                      # ~30 mm/tháng/thập kỷ, significant


def test_analyze_region_and_report(cube_dir):
    r = api.analyze_region("precip", (100, 0, 106, 5))
    json.dumps(r)
    assert r["trend"]["trend"] == "increasing" and abs(r["trend"]["slope_per_decade"] - 30) < 3
    assert r["quality"]["months_with_data"] == 288 and "GPM IMERG" in r["source"]
    md = evidence_report(r)
    assert "Nguồn dữ liệu NASA" in md and "Giới hạn" in md and "mm/month/thập kỷ" in md


def test_compare_regions_opposite_is_reliable(cube_dir):
    r = api.compare_regions("precip", (100, 0, 106, 5), (113, 6, 120, 12))
    assert r["reliable"] and r["difference"]["ci95_low"] > 40   # +30 − (−30) = 60
    assert "Khác biệt A − B" in evidence_report(r)


def test_find_contradictions_returns_hotspots_and_pair(cube_dir):
    r = api.find_contradictions("precip")
    json.dumps(r)
    assert {h["direction"] for h in r["hotspots"]} == {"up", "down"} and r["pairs"][0]["reliable"]


def test_missing_cube_and_unknown_variable(cube_dir):
    with pytest.raises(FileNotFoundError):
        api.analyze_region("ndvi", (100, 0, 106, 5))
    with pytest.raises(ValueError):
        api.load_cube("chlorophyll")


def test_points_roundtrip(tmp_path):
    land = xr.DataArray([[True, False], [False, True]], coords={"lat": [10.5, 11.5], "lon": [105.5, 106.5]},
                        dims=("lat", "lon"))
    paths = write_grid_points(land, tmp_path / "pts.csv", batch_size=1)
    assert len(paths) == 2 and pd.read_csv(paths[0]).columns.tolist() == ["id", "latitude", "longitude"]
    obs = pd.DataFrame({"region_id": ["g_10.5_105.5", "g_11.5_106.5"], "variable": "ndvi",
                        "time": pd.to_datetime(["2001-01-01"] * 2), "value": [0.5, 0.7]})
    c = points_to_cube(obs, "ndvi")
    assert c.shape == (1, 180, 360) and c.sel(lat=11.5, lon=106.5).item() == 0.7
    assert np.isnan(c.sel(lat=10.5, lon=106.5).item())


@pytest.mark.parametrize("var", ["soil_moisture", "sm_10_40cm_gldas"])
def test_soil_moisture_masks_ice_cells(cube_dir, var):
    """K22: ô băng GLDAS (1,0 cố định) và ô ven băng (có lúc > 0,6) bị che cả chuỗi ở mọi biến m³/m³; ô thường giữ nguyên."""
    v = np.full((len(TIME), 1, 3), 0.3)
    v[:, 0, 1] = 1.0                       # băng
    v[::12, 0, 2] = 0.77                   # ven băng, trộn
    xr.DataArray(v, coords={"time": TIME, "lat": [70.5], "lon": [-40.5, -39.5, -38.5]}, dims=("time", "lat", "lon"),
                 name=var).to_netcdf(cube_dir / f"cube_{var}.nc")
    sm = api.load_cube(var)
    assert np.allclose(sm[:, 0, 0], 0.3) and sm[:, 0, 1:].isnull().all()
