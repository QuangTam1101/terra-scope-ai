import pandas as pd
import pytest

from pipeline.units import convert_units, giovanni_unit, kelvin_to_c

P = "GPM_3IMERGM_07_precipitation"


def test_precip_mm_hr_to_month():
    v, u = convert_units(P, pd.Series([0.3, 0.1]), pd.to_datetime(["2001-01-01", "2001-02-01"]), "mm/hr")
    assert u == "mm/month" and abs(v[0] - 223.2) < 1e-9 and abs(v[1] - 0.1 * 24 * 28) < 1e-9


def test_wrong_unit_stops():
    with pytest.raises(AssertionError):
        convert_units(P, pd.Series([0.3]), pd.to_datetime(["2001-01-01"]), "mm/month")


def test_index_alignment():
    v, _ = convert_units(P, pd.Series([0.3], index=[7]), pd.to_datetime(["2001-01-01"]), "mm/hr")
    assert abs(v[7] - 223.2) < 1e-9


def test_gldas_and_merra():
    t = pd.to_datetime(["2001-01-01"])
    assert abs(convert_units("GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst", pd.Series([32.0]), t, "kg/m^2")[0][0] - 0.32) < 1e-12
    ev = convert_units("GLDAS_NOAH025_M_2_1_Evap_tavg", pd.Series([3e-5]), t, "kg/m^2/s")[0][0]
    assert abs(ev - 2.592) < 1e-9
    assert abs(convert_units("M2IMNXASM_5_12_4_T2M", pd.Series([300.0]), t, "K")[0][0] - 26.85) < 1e-9
    assert abs(kelvin_to_c(300.0) - 26.85) < 1e-9


def test_giovanni_unit_key():
    assert giovanni_unit({"Title": "x", "Units": "mm/hr"}) == "mm/hr"
    with pytest.raises(ValueError):
        giovanni_unit({"Title": "x"})
