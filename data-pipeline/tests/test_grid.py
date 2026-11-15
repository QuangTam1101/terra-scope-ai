import numpy as np
import pandas as pd
import pymannkendall as mk
import xarray as xr

from pipeline.contradictions import hunt_global
from pipeline.giovanni_adapter import build_cube, convert_cube
from pipeline.grid import bin_to_grid, grid_trend, hotspot_regions, region_series, shape_mask

TIME = pd.date_range("2001-01-01", "2024-12-01", freq="MS")


def _cube(lat, lon, f, seed=0):
    """f(years, lat2d, lon2d) → giá trị; thêm mùa + nhiễu."""
    rng = np.random.default_rng(seed)
    yrs = ((TIME - TIME[0]).days / 365.25).to_numpy()[:, None, None]
    la, lo = np.meshgrid(lat, lon, indexing="ij")
    v = f(yrs, la, lo) + 2 * np.sin(2 * np.pi * TIME.month.to_numpy() / 12)[:, None, None] \
        + rng.normal(0, 0.3, (len(TIME), len(lat), len(lon)))
    return xr.DataArray(v, coords={"time": TIME, "lat": lat, "lon": lon}, dims=("time", "lat", "lon"))


def test_bin_to_grid_block_mean_skips_nan():
    lat = np.arange(10.125, 12, 0.25)                         # 0.25° → 2 ô 1° theo vĩ độ
    lon = np.arange(100.125, 102, 0.25)
    da = xr.DataArray(np.arange(len(lat) * len(lon), dtype=float).reshape(len(lat), len(lon)),
                      coords={"lat": lat, "lon": lon}, dims=("lat", "lon"))
    da[0, 0] = np.nan                                          # ô biển GLDAS
    g = bin_to_grid(da)
    assert list(g.lat.values) == [10.5, 11.5] and list(g.lon.values) == [100.5, 101.5]
    block = da.sel(lat=slice(10, 11), lon=slice(100, 101)).values
    assert np.isclose(g.sel(lat=10.5, lon=100.5), np.nanmean(block))


def test_grid_trend_matches_pymannkendall():
    cube = _cube(np.array([0.5, 1.5]), np.array([0.5, 1.5, 2.5]), lambda y, la, lo: 0.05 * y * (lo - 1.5))
    tr = grid_trend(cube)
    for la in (0.5, 1.5):
        for lo in (0.5, 1.5, 2.5):
            ref = mk.seasonal_test(cube.sel(lat=la, lon=lo).values, period=12)
            got = tr.sel(lat=la, lon=lo)
            assert np.isclose(got.z, ref.z) and np.isclose(got.p_value, ref.p)
            assert np.isclose(got.slope_per_decade, ref.slope * 10)


def test_grid_trend_custom_window_and_insufficient():
    cube = _cube(np.array([0.5]), np.array([0.5]), lambda y, la, lo: 0.1 * y)
    assert grid_trend(cube, "2013-01-01", "2024-12-01").attrs["start"] == "2013-01-01"
    assert np.isnan(grid_trend(cube, "2016-01-01", "2024-12-01")["p_value"].item())   # 9 năm < 10


def test_region_series_weighted_and_quality():
    cube = _cube(np.array([0.5, 60.5]), np.array([0.5]), lambda y, la, lo: np.where(la > 30, 10.0, 0.0))
    cube[:, 1, 0] = cube[:, 1, 0].where(cube.time.dt.month != 1)   # tháng 1 thiếu ở ô vĩ độ cao
    v, frac = region_series(cube, (0, 0, 1, 61))
    w = np.cos(np.deg2rad([0.5, 60.5]))
    jul = cube.sel(time="2010-07-01").values[:, 0]
    assert np.isclose(v["2010-07-01"], (jul * w).sum() / w.sum())
    assert frac["2010-01-01"] == 0.5 and frac["2010-07-01"] == 1.0



def test_shape_mask_hole_and_island():
    """Chẵn-lẻ: lỗ (nước nằm trong nước khác, vd. Lesotho) bị loại, mảnh rời (đảo) được tính."""
    lat = lon = np.arange(0.5, 10)
    outer = [(0, 0), (6, 0), (6, 6), (0, 6), (0, 0)]
    hole = [(2, 2), (4, 2), (4, 4), (2, 4), (2, 2)]
    island = [(8, 8), (10, 8), (10, 10), (8, 10), (8, 8)]
    m = shape_mask(lat, lon, [outer, hole, island])
    assert m.sum() == 36 - 4 + 4
    assert m[0, 0] and not m[2, 2] and m[8, 8] and not m[7, 7] and not m[0, 7]


def test_region_series_with_border_ignores_cells_outside():
    cube = _cube(np.array([0.5, 1.5]), np.array([0.5, 1.5]), lambda y, la, lo: np.where(lo > 1, 10.0, 0.0))
    ring = [(0, 0), (1, 0), (1, 2), (0, 2), (0, 0)]           # chỉ cột lon 0.5 nằm trong đường viền
    v, frac = region_series(cube, (0, 0, 2, 2), [ring])
    w = np.cos(np.deg2rad([0.5, 1.5]))
    jul = cube.sel(time="2010-07-01", lon=0.5).values
    assert np.isclose(v["2010-07-01"], (jul * w).sum() / w.sum())
    assert (frac == 1.0).all()

def test_hunt_global_finds_opposite_hotspots():
    lat, lon = np.arange(0.5, 12), np.arange(0.5, 20)
    def f(y, la, lo):
        up = (la < 5) & (lo < 6)                               # khối A mưa tăng
        down = (la > 6) & (lo > 13)                            # khối B mưa giảm
        return np.where(up, 0.3 * y, 0) + np.where(down, -0.3 * y, 0)
    pairs, spots = hunt_global(_cube(lat, lon, f), "precip", "mm/month", n_boot=200)
    assert set(spots["direction"]) == {"up", "down"}
    assert len(pairs) >= 1 and pairs["reliable"].iloc[0]
    labels, _ = hotspot_regions(grid_trend(_cube(lat, lon, lambda y, la, lo: 0 * y)))
    assert labels.max() == 0                                   # nhiễu thuần → không tự bịa điểm nóng


def test_build_cube_real_imerg_layout(tmp_path):
    """Cấu trúc file HOSS IMERG thật (13/11): nhóm Grid, chiều (time, lon, lat), mm/hr, lịch julian."""
    cftime = __import__("pytest").importorskip("cftime")
    da = xr.DataArray(np.ones((1, 2, 2)), dims=("time", "lon", "lat"), name="precipitation", attrs={"units": "mm/hr"},
                      coords={"time": [cftime.DatetimeJulian(2010, 7, 1)], "lon": [0.05, 0.15], "lat": [0.05, 0.15]})
    path = tmp_path / "imerg.nc4"
    da.to_dataset().to_netcdf(path, group="Grid")
    cube = build_cube([path], "GPM_3IMERGM_07_precipitation")
    assert cube.name == "precip" and cube.attrs["units"] == "mm/month" and dict(cube.sizes) == {"time": 1, "lat": 180, "lon": 360}
    assert list(cube["time"].values) == [np.datetime64("2010-07-01")] and cube.sel(lat=0.5, lon=0.5).item() == 24 * 31


def test_convert_cube_imerg_mm_per_month():
    da = xr.DataArray(np.ones((2, 1, 1)), coords={"time": pd.to_datetime(["2024-01-01", "2024-02-01"]),
                                                   "lat": [0.5], "lon": [0.5]}, dims=("time", "lat", "lon"))
    out, unit = convert_cube("GPM_3IMERGM_07_precipitation", da, "mm/hr")
    assert unit == "mm/month" and list(out.values.ravel()) == [24 * 31, 24 * 29]
