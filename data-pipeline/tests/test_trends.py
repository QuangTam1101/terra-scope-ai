import numpy as np
import pandas as pd

from pipeline.checks import cross_check_et, cross_check_temp, sanity_report, trend_ready
from pipeline.trends import anomaly, bh_fdr, trend_one, trends_table

FULL = pd.date_range("2001-01-01", "2024-12-01", freq="MS")


def _series(slope_per_year=0.1, seed=0):
    rng = np.random.default_rng(seed)
    years = (FULL - FULL[0]).days / 365.25
    return pd.Series(10 + 3 * np.sin(2 * np.pi * FULL.month / 12) + slope_per_year * years
                     + rng.normal(0, 0.05, len(FULL)), index=FULL)


def test_known_slope_per_decade():
    r = trend_one(_series(0.1))
    assert r["trend"] == "increasing" and not r["insufficient_data"]
    for k in ("slope_per_decade", "hr_slope_per_decade", "ols_slope_per_decade"):
        assert abs(r[k] - 1.0) < 0.05, (k, r[k])
    assert r["ols_ci95_per_decade"] > 0


def test_insufficient_data():
    s = _series().copy()
    s.iloc[: 15 * 12] = np.nan                                 # còn 9 năm
    assert trend_one(s)["insufficient_data"]


def test_anomaly_removes_season():
    a = anomaly(pd.Series(np.tile(np.arange(12.0), 3), index=FULL[:36]))
    assert np.allclose(a, 0)


def test_bh_fdr():
    q = bh_fdr([0.01, 0.04, 0.03, 0.005, np.nan])
    assert np.allclose(q[:4], [0.02, 0.04, 0.04, 0.02]) and np.isnan(q[4])


def test_trends_table():
    obs = pd.concat([pd.DataFrame({"region_id": r, "variable": "ndvi", "unit": "1", "time": FULL,
                                   "value": _series(sl, seed).to_numpy()})
                     for r, sl, seed in (("a", 0.1, 1), ("b", -0.1, 2), ("c", 0.0, 3))])
    t = trends_table(obs).set_index("region_id")
    assert t.loc["a", "significant"] and t.loc["b", "significant"] and t.loc["b", "z"] < 0
    assert "p_value_fdr" in t


def test_sanity_report():
    rep = sanity_report(pd.DataFrame({"variable": ["ndvi", "ndvi", "lst_day"], "value": [0.5, 5000, 300.0]}))
    assert rep["ndvi"] == 1 and rep["lst_day"] == 1


def test_cross_checks():
    t = pd.date_range("2001-01-01", periods=48, freq="MS")
    season = np.sin(2 * np.pi * np.arange(48) / 12)
    cc = cross_check_temp(pd.Series(32 + 8 * season, index=t), pd.Series(25 + 5 * season, index=t))
    assert cc["r"] > 0.99 and cc["frac_lst_gt_air"] == 1.0
    gl = pd.Series(3 + season, index=t)
    ce = cross_check_et(gl * t.days_in_month * 0.9, gl)
    assert ce["r"] > 0.99 and abs(ce["ratio_median"] - 0.9) < 1e-9


def test_trend_ready():
    s = pd.Series(1.0, index=FULL)
    s.iloc[10:22] = np.nan
    tr = trend_ready(s)
    assert tr["ready"] and tr["longest_gap_months"] == 12
    s2 = s.copy()
    s2[s2.index.month == 7] = np.nan
    assert not trend_ready(s2)["every_month_ok"]
