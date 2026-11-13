import numpy as np
import pandas as pd

from pipeline.contradictions import (anomaly_events_type_b, monthly_z, permute_years, scan_type_a,
                                     sen_slope_per_year, twins_type_c)


def test_monthly_z():
    idx = pd.date_range("2001-01-01", "2010-12-01", freq="MS")
    base = pd.Series(np.where(idx.month == 7, np.tile([1.0, 2.0], 5)[idx.year - 2001], 5.0), index=idx)
    base[pd.Timestamp("2010-07-01")] = 10.0
    z = monthly_z(base)
    assert z[pd.Timestamp("2010-07-01")] > 2.5
    assert np.isnan(z[pd.Timestamp("2005-01-01")])             # std 0 → NaN, không phải inf


def test_permutation_and_sen():
    cube = np.arange(2 * 24 * 12, dtype=float).reshape(2, 24, 12)
    pc = permute_years(cube, np.random.default_rng(0))
    assert np.array_equal(pc[0, :, 0] - cube[0, 0, 0], pc[1, :, 0] - cube[1, 0, 0])   # cùng hoán vị
    assert sorted(pc[0, :, 0]) == sorted(cube[0, :, 0])
    ann = np.vstack([np.arange(24) * 0.03, -np.arange(24) * 0.02])
    assert np.allclose(sen_slope_per_year(ann), [0.03, -0.02])


TRENDS = pd.DataFrame({"region_id": ["u1", "u2", "d1", "d2", "n1"], "variable": "ndvi",
                       "z": [5.0, 3.0, -4.0, -2.5, 6.0], "p_value_fdr": [0.001, 0.01, 0.001, 0.02, 0.5]})


def test_type_a():
    a = scan_type_a(TRENDS, "ndvi", top_n=2)
    assert list(zip(a["region_id_up"], a["region_id_down"])) == [("u1", "d1"), ("u2", "d1")]
    assert list(a["score"]) == [4.0, 3.0]                      # min(|z_i|, |z_j|); n1 không qua FDR


def test_type_c_same_landcover_only():
    f = pd.DataFrame({"elev": [100, 110, 105, 2000, 101], "ndvi_mean": [0.5, 0.52, 0.51, 0.2, 0.5],
                      "LC_Type1": [10, 10, 12, 10, 12]}, index=["u1", "d1", "u2", "d2", "n1"])
    c = twins_type_c(f, TRENDS, "ndvi", k=2)
    pairs = set(zip(c["region_a"], c["region_b"]))
    assert ("d1", "u1") in pairs                               # giống nhau, cùng lớp 10, ngược dấu
    assert ("d1", "u2") not in pairs and ("d2", "u2") not in pairs   # khác lớp phủ
    assert (c["similarity"] <= 1).all() and c["score"].is_monotonic_decreasing


def test_type_b_clusters():
    rng = np.random.default_rng(0)
    pos = pd.DataFrame({"lat": 55 + rng.normal(0, 0.5, 6), "lon": 37 + rng.normal(0, 0.5, 6), "z": 3.0})
    neg = pd.DataFrame({"lat": -35 + rng.normal(0, 0.5, 5), "lon": 149 + rng.normal(0, 0.5, 5), "z": -2.5})
    noise = pd.DataFrame({"lat": [0.0, 10.0], "lon": [0.0, 50.0], "z": [3.0, 0.1]})
    z = pd.concat([pos, neg, noise], ignore_index=True)
    z["region_id"] = [f"g{i}" for i in range(len(z))]
    ev = anomaly_events_type_b(z)
    assert len(ev) == 1 and ev["n_points_pos"][0] == 6 and ev["n_points_neg"][0] == 5
    assert abs(ev["score"][0] - 5.5) < 1e-9


def _synthetic_obs(seed=1):
    """24 năm tháng: mùa + tín hiệu chung (kiểu ENSO, có ở MỌI nơi) + nhiễu riêng + xu hướng theo nơi."""
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2001-01-01", "2024-12-01", freq="MS")
    t = np.arange(len(idx)) / 120                             # thập kỷ
    season = 50 * np.sin(2 * np.pi * idx.month / 12)
    common = np.convolve(rng.normal(0, 8, len(idx)), np.ones(6) / 6, mode="same")
    trend = {"up1": 12, "up2": 9, "down1": -10, "down2": -8, "noise1": 0, "noise2": 0}   # mm/tháng/thập kỷ
    rows = []
    for r, k in trend.items():
        v = 120 + season + common + k * t + rng.normal(0, 6, len(idx))
        rows.append(pd.DataFrame({"region_id": r, "variable": "precip", "time": idx, "value": v, "unit": "mm/month"}))
    return pd.concat(rows, ignore_index=True)


def test_find_opposite_trends_rain_up_vs_down():
    from pipeline.contradictions import find_opposite_trends
    from pipeline.trends import trends_table
    obs = _synthetic_obs()
    res = find_opposite_trends(obs, trends_table(obs), "precip", n_boot=200)
    reliable = res[res["reliable"]]
    found = {(a, b) for a, b in zip(reliable["region_up"], reliable["region_down"])}
    assert found == {("up1", "down1"), ("up1", "down2"), ("up2", "down1"), ("up2", "down2")}
    assert not res["region_up"].str.startswith("noise").any() and not res["region_down"].str.startswith("noise").any()
    best = reliable.iloc[0]                                   # up1 − down1: hiệu thật ≈ 12 − (−10) = 22
    assert best["region_up"] == "up1" and best["region_down"] == "down1"
    assert best["ci95_low"] < 22 < best["ci95_high"]


def test_pair_difference_same_trend_not_reliable():
    from pipeline.contradictions import pair_difference_test
    obs = _synthetic_obs(seed=2)
    w = obs.pivot_table(index="time", columns="region_id", values="value").asfreq("MS")
    same = pair_difference_test(w["up1"], w["up1"] + np.random.default_rng(3).normal(0, 6, len(w)), n_boot=200)
    assert same["p_diff"] > 0.05 and same["ci95_low"] < 0 < same["ci95_high"] and not same["stable_halves"]
