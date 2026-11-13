import numpy as np
import pandas as pd
import pytest
import xarray as xr

from pipeline.aggregate import composite_days, composites_to_monthly, raster_to_series, series_to_monthly, zonal_mean

STARTS = [pd.Timestamp(2010, 1, 1) + pd.Timedelta(days=d - 1) for d in (177, 185, 193, 201, 209)]


def test_zonal_mean():
    v = np.array([[0.5, np.nan], [0.7, 0.9]])
    r = zonal_mean(v, np.array([[True, True], [True, False]]))
    assert r["n_valid"] == 2 and abs(r["valid_frac"] - 2 / 3) < 1e-9 and abs(r["value"] - 0.6) < 1e-9
    r = zonal_mean(np.array([[1.0, 3.0]]).T, np.array([[True], [True]]), lat=[0.0, 60.0])
    assert abs(r["value"] - (1 * 1 + 3 * 0.5) / 1.5) < 1e-9
    assert np.isnan(zonal_mean(np.array([[1.0, np.nan, np.nan, np.nan]]), np.ones((1, 4), bool))["value"])
    with pytest.raises(ValueError):
        zonal_mean(np.ones((1, 1)), np.zeros((1, 1), bool))


def test_composites_sum_et():
    mon = composites_to_monthly(pd.Series([24.0, 25, 26, 25, 24], index=STARTS), "sum")
    assert abs(mon[pd.Timestamp("2010-07-01")] - 97.0) < 1e-9
    assert np.isnan(mon[pd.Timestamp("2010-06-01")])           # tháng 6 thiếu ngày → NaN


def test_composite_days_year_end():
    assert composite_days(pd.Timestamp(2010, 1, 1) + pd.Timedelta(days=360)) == 5
    assert composite_days(pd.Timestamp(2012, 1, 1) + pd.Timedelta(days=360)) == 6


def test_full_year_sums_to_365():
    idx = [pd.Timestamp(2010, 1, 1) + pd.Timedelta(days=8 * k) for k in range(46)]
    ym = composites_to_monthly(pd.Series([float(composite_days(t)) for t in idx], index=idx), "sum")
    assert abs(ym.sum() - 365) < 1e-9 and abs(ym.iloc[0] - 31) < 1e-9 and abs(ym.iloc[1] - 28) < 1e-9


def test_composites_mean_lst():
    lm = composites_to_monthly(pd.Series([300.0, 302.0, np.nan, 304.0], index=STARTS[:4]), "mean")
    assert abs(lm[pd.Timestamp("2010-07-01")] - (300 * 3 + 302 * 8 + 304 * 8) / 19) < 1e-9


def test_raster_to_series_appeears_native_layout():
    """Cấu trúc file thật AppEEARS native (R4, 13/11): CRS trong biến `crs`, chiều xdim/ydim (mét), lịch julian."""
    pytest.importorskip("rioxarray")
    cftime = pytest.importorskip("cftime")
    from pyproj import CRS
    wkt = CRS.from_proj4("+proj=sinu +R=6371007.181 +units=m +no_defs").to_wkt()
    gm = {"grid_mapping": "crs"}
    ds = xr.Dataset({"_1_km_monthly_NDVI": (("time", "ydim", "xdim"), np.full((2, 2, 2), 5000, dtype="int16"), gm),
                     "_1_km_monthly_VI_Quality": (("time", "ydim", "xdim"), np.zeros((2, 2, 2), dtype="uint16"), gm),
                     "crs": ((), np.int8(0), {"grid_mapping_name": "sinusoidal", "spatial_ref": wkt})},
                    coords={"time": [cftime.DatetimeJulian(2010, 1, 1), cftime.DatetimeJulian(2010, 2, 1)],
                            "ydim": ("ydim", [1500.0, 500.0], {"axis": "Y", "standard_name": "projection_y_coordinate"}),
                            "xdim": ("xdim", [500.0, 1500.0], {"axis": "X", "standard_name": "projection_x_coordinate"})})
    s = raster_to_series(ds, "_1_km_monthly_NDVI", (0, 0, 1, 1))  # bbox 1° quanh gốc toạ độ chứa cả 4 pixel
    assert list(s["n_valid"]) == [4, 4] and np.allclose(s["value"], 0.5)
    assert list(s.index) == list(pd.to_datetime(["2010-01-01", "2010-02-01"]))


def test_raster_to_series_synthetic():
    """NDVI int16 thô + VI_Quality trên lưới EPSG:4326 4×4, y giảm dần; vùng = 2×2 ô góc trên trái."""
    pytest.importorskip("rioxarray")
    x = np.array([0.5, 1.5, 2.5, 3.5])
    y = np.array([3.5, 2.5, 1.5, 0.5])
    t = pd.to_datetime(["2010-01-01", "2010-02-01"])
    ndvi = np.full((2, 4, 4), 5000, dtype="int16")
    ndvi[0, 0, 0] = 9000                                       # trong vùng, tháng 1
    ndvi[1, 0, 1] = -3000                                      # fill trong vùng, tháng 2
    q = np.zeros((2, 4, 4), dtype="uint16")
    q[0, 1, 1] = 1                                             # MODLAND 01 → loại
    ds = xr.Dataset({"_1_km_monthly_NDVI": (("time", "y", "x"), ndvi),
                     "_1_km_monthly_VI_Quality": (("time", "y", "x"), q)},
                    coords={"time": t, "y": y, "x": x}).rio.write_crs("EPSG:4326")
    s = raster_to_series(ds, "_1_km_monthly_NDVI", (0, 2, 2, 4))
    assert list(s["n_valid"]) == [3, 3] and np.allclose(s["valid_frac"], 0.75)
    w = np.cos(np.deg2rad([3.5, 3.5, 2.5]))
    assert abs(s["value"].iloc[0] - (0.9 * w[0] + 0.5 * w[1] + 0.5 * w[2]) / w.sum()) < 1e-9
    assert abs(s["value"].iloc[1] - 0.5) < 1e-9
    m = series_to_monthly(s, "_1_km_monthly_NDVI")
    assert list(m.index) == list(t)
