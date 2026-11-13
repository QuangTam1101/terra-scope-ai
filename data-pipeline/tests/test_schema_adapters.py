import json

import numpy as np
import pandas as pd
import pytest

from pipeline.appeears_adapter import nc_files_for, normalize_points, write_locations
from pipeline.giovanni_adapter import check_quota, normalize_area_csv, parse_giovanni_area_csv
from pipeline.schema import REQUIRED, FetchRequest, Region, request_id, rows, validate

CFG = {"ndvi": {"unit": "1", "valid_range": (-0.2, 1.0)},
       "precip": {"unit": "mm/month", "valid_range": (0, 3000)}}
CSV = ("Title:,Area-Averaged Time Series\nUser Start Date:,2001-01-01\nUnits:,mm/hr\n,\n"
       "time,mean_GPM_3IMERGM_07_precipitation\n2001-01-01,0.3\n2001-02-01,0.1\n")
MEKONG = Region("mekong", (104.5, 8.5, 106.8, 11.0))


def test_request_id_stable():
    a = FetchRequest("giovanni", "GPM_3IMERGM.07", ("p",), (MEKONG,), "2001-01-01", "2024-12-31")
    b = FetchRequest("giovanni", "GPM_3IMERGM.07", ("p",), (MEKONG,), "2001-01-01", "2024-12-31")
    assert request_id(a) == request_id(b) and len(request_id(a)) == 12
    assert request_id(a) != request_id(FetchRequest("giovanni", "x", ("p",), (MEKONG,), "2001-01-01", "2024-12-31"))


def test_rows_and_validate():
    m = pd.DataFrame({"value": [0.5, 0.6], "n_valid": [10, 2], "valid_frac": [0.9, 0.1]},
                     index=pd.to_datetime(["2001-01-01", "2001-02-01"]))
    df = rows(MEKONG, "ndvi", m, unit="1", source="appeears", dataset="MOD13A3.061",
              source_variable="_1_km_monthly_NDVI", agg="area_mean", qa_policy="modland_good", request_ref="t")
    assert list(df.columns) == REQUIRED and np.isnan(df["value"][1])      # valid_frac < 0.3 → NaN
    validate(df, CFG)
    bad = df.copy()
    bad.loc[0, "value"] = 5.0
    with pytest.raises(AssertionError):
        validate(bad, CFG)
    with pytest.raises(AssertionError):
        validate(pd.concat([df, df]), CFG)                                # trùng (vùng, biến, tháng)


def test_parse_giovanni_csv(tmp_path):
    df, meta = parse_giovanni_area_csv(CSV)
    assert meta["Units"] == "mm/hr" and list(df["value"]) == [0.3, 0.1]
    p = tmp_path / "a.csv"
    p.write_text(CSV)
    df2, _ = parse_giovanni_area_csv(p)
    assert df2.equals(df)


def test_normalize_giovanni(tmp_path):
    p = tmp_path / "a.csv"
    p.write_text(CSV)
    out = normalize_area_csv(p, MEKONG, "GPM_3IMERGM_07_precipitation", "job1", "2001-01-01", "2001-03-31")
    assert len(out) == 3 and out["variable"].eq("precip").all() and out["unit"].eq("mm/month").all()
    assert abs(out["value"][0] - 223.2) < 1e-9 and np.isnan(out["value"][2])   # tháng thiếu = NaN
    validate(out, CFG)


def test_check_quota():
    assert check_quota({"quota": 0.5}) == 0.5
    with pytest.raises(RuntimeError):
        check_quota(0.97)


def test_write_locations(tmp_path):
    pts = (Region("g_10.0_105.0", (105.0, 10.0, 105.0, 10.0), "point"),)
    req = FetchRequest("appeears", "MOD13A3.061", ("_1_km_monthly_NDVI",), pts, "2001-01-01", "2001-12-31")
    assert (write_locations(req, tmp_path).read_text().splitlines()
            == ["id,category,latitude,longitude", "g_10.0_105.0,grid,10.0,105.0"])
    req2 = FetchRequest("appeears", "MOD13A3.061", ("_1_km_monthly_NDVI",), (MEKONG,), "2001-01-01", "2001-12-31")
    g = json.loads(write_locations(req2, tmp_path).read_text())
    assert g["features"][0]["properties"]["id"] == "mekong"
    assert g["features"][0]["geometry"]["coordinates"][0][0] == [104.5, 8.5]


def test_nc_files_for_matches_feature_order(tmp_path):
    # tên file thật của R4 (13/11): id vùng không có trong tên, chỉ có thứ tự feature aid0001, aid0002…
    for name in ["SRTMGL3_NC.003_90m_aid0001.nc", "SRTMGL3_NC.003_90m_aid0002.nc", "SRTMGL3_NUMNC.003_90m_aid0002.nc"]:
        (tmp_path / name).touch()
    assert [p.name for p in nc_files_for(tmp_path, "SRTMGL3_NC.003", 1)] == ["SRTMGL3_NC.003_90m_aid0002.nc"]
    assert [p.name for p in nc_files_for(tmp_path, "SRTMGL3_NC.003", 0)] == ["SRTMGL3_NC.003_90m_aid0001.nc"]


def test_normalize_points(tmp_path):
    """CSV point giả theo dạng ⚠️ {PRODUCT}_{VERSION}_{layer}: số thô, fill, QA xấu."""
    p = tmp_path / "pts.csv"
    pd.DataFrame({"ID": ["g_10.0_105.0"] * 3, "Date": ["2001-01-01", "2001-02-01", "2001-03-01"],
                  "MOD13A3_061__1_km_monthly_NDVI": [5000, -3000, 6000],
                  "MOD13A3_061__1_km_monthly_VI_Quality": [0, 0, 1]}).to_csv(p, index=False)
    pts = (Region("g_10.0_105.0", (105.0, 10.0, 105.0, 10.0), "point"),)
    req = FetchRequest("appeears", "MOD13A3.061", ("_1_km_monthly_NDVI",), pts, "2001-01-01", "2001-03-31")
    out = normalize_points(p, req, "task1")
    assert list(out["agg"].unique()) == ["pixel"] and out["variable"].eq("ndvi").all()
    assert abs(out["value"][0] - 0.5) < 1e-9 and np.isnan(out["value"][1]) and np.isnan(out["value"][2])
    assert list(out["n_valid"]) == [1, 0, 0]
    validate(out, CFG)
