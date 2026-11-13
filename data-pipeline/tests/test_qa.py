import numpy as np
import pytest
import xarray as xr

from pipeline.qa import (bits, ensure_scaled, et_main_algorithm, lst_ok, lst_valid, mask_fill, ndvi_good,
                         ndvi_land, scale_et, to_nan_outside)


def test_ensure_scaled():
    raw = xr.DataArray(np.array([2000, 5000, 8000, 9000], dtype="int16"))
    assert np.allclose(ensure_scaled(raw, -0.2, 1.0, 0.0001), [0.2, 0.5, 0.8, 0.9])
    real = xr.DataArray(np.array([0.2, 0.5, 0.8]))
    assert ensure_scaled(real, -0.2, 1.0, 0.0001) is real
    lst = xr.DataArray(np.array([15000, 14500, 15500], dtype="uint16"))
    assert abs(float(ensure_scaled(lst, 150, 1310.7, 0.02)[0]) - 300.0) < 1e-9
    with pytest.raises(ValueError):
        ensure_scaled(xr.DataArray(np.array([-5e6, 5e6])), -0.2, 1.0, 0.0001)


def test_scale_et_by_dtype():
    assert np.allclose(scale_et(xr.DataArray(np.array([250, 30], dtype="int16"))), [25.0, 3.0])
    f = xr.DataArray(np.array([25.0]))
    f.encoding["scale_factor"] = 0.1
    assert scale_et(f) is f
    with pytest.raises(ValueError):
        scale_et(xr.DataArray(np.array([25.0])))


def test_mask_fill():
    m = mask_fill(xr.DataArray(np.array([250, 32767, 32763, 32700], dtype="int16")), "ET_500m")
    assert np.isnan(m[1]) and np.isnan(m[2]) and float(m[3]) == 32700 and float(m[0]) == 250
    m2 = mask_fill(xr.DataArray(np.array([-3000, 5000], dtype="int16")), "_1_km_monthly_NDVI")
    assert np.isnan(m2[0]) and float(m2[1]) == 5000


def test_qa_bits():
    # 2116 = 0b100001000100 → MODLAND 00, usefulness 0001, aerosol 01, land/water 001
    assert bits(2116, 0, 2) == 0 and bits(2116, 2, 4) == 1 and bits(2116, 6, 2) == 1 and bits(2116, 11, 3) == 1
    assert ndvi_good(2116) and ndvi_land(2116)
    assert lst_ok(0) and lst_ok(0b01000001) and not lst_ok(0b10000001) and not lst_ok(0b10)
    assert et_main_algorithm(0) and not et_main_algorithm(1)


def test_qc_fill_trap():
    assert list(lst_valid([0, 15000, 15000], [0, 0, 2])) == [False, True, False]   # QC = 0 là tốt nhất


def test_valid_range():
    assert np.isnan(to_nan_outside([1.2], -0.2, 1.0)[0]) and to_nan_outside([0.5], -0.2, 1.0)[0] == 0.5
