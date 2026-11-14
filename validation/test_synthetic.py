"""Synthetic series with known behaviour: production statistics (pipeline.trends.trend_one, pipeline.grid.grid_trend,
pipeline.trends.bh_fdr) against the independent oracle and against analytic expectations.
Nothing is written to the NASA cubes. Run: python -m pytest -q validation/test_synthetic.py"""
import math
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import xarray as xr

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import oracle  # noqa: E402
from pipeline.grid import grid_trend  # noqa: E402
from pipeline.trends import bh_fdr, trend_one  # noqa: E402

IDX = pd.date_range("2001-01-01", periods=300, freq="MS")
RNG = np.random.default_rng(20261115)


def season(n=300):
    return 10 * np.sin(2 * np.pi * np.arange(n) / 12)


def compare(values, idx=IDX):
    s = pd.Series(values, index=idx[:len(values)])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        prod = trend_one(s)
    smk = oracle.seasonal_mk(s.values)
    slope = oracle.seasonal_sen(s.values) * 10
    return s, prod, smk, slope


def assert_matches(prod, smk, slope):
    assert math.isclose(prod["slope_per_decade"], slope, rel_tol=1e-9, abs_tol=1e-12)
    assert math.isclose(prod["z"], smk["z"], rel_tol=1e-9, abs_tol=1e-12)
    assert math.isclose(prod["p_value"], smk["p"], rel_tol=1e-9, abs_tol=1e-14)


def test_SY01_constant_series():
    s, prod, smk, slope = compare(np.full(300, 5.0))
    assert smk["S"] == 0 and smk["var_S"] == 0 and smk["p"] == 1.0 and slope == 0.0
    assert prod["slope_per_decade"] == 0.0 and prod["p_value"] == 1.0          # never significant


def test_SY02_strictly_increasing_known_values():
    s, prod, smk, slope = compare(np.arange(300, dtype=float) * 0.1)
    assert smk["S"] == 12 * 300 and smk["var_S"] == pytest.approx(12 * 25 * 24 * 55 / 18)
    assert smk["z"] == pytest.approx(3599 / math.sqrt(22000))
    assert slope == pytest.approx(1.2 * 10)                                   # 0.1 per month = 1.2 per year
    assert_matches(prod, smk, slope)


def test_SY03_strictly_decreasing_is_symmetric():
    s, prod, smk, slope = compare(-np.arange(300, dtype=float) * 0.1)
    assert smk["S"] == -3600 and slope == pytest.approx(-12.0)
    assert_matches(prod, smk, slope)


def test_SY04_seasonal_no_trend():
    s, prod, smk, slope = compare(season() + RNG.normal(0, 1, 300))
    assert_matches(prod, smk, slope)
    assert abs(slope) < 1.0


def test_SY05_seasonal_with_known_trend():
    true = 0.5                                                               # units per decade
    s, prod, smk, slope = compare(season() + true / 120 * np.arange(300) + RNG.normal(0, 0.3, 300))
    assert_matches(prod, smk, slope)
    assert abs(slope - true) < 0.15 and prod["p_value"] < 0.001


def test_SY06_missing_months():
    v = season() + 0.02 * np.arange(300) + RNG.normal(0, 1, 300)
    v[RNG.random(300) < 0.15] = np.nan
    s, prod, smk, slope = compare(v)
    assert_matches(prod, smk, slope)
    assert prod["n_months"] == int(np.isfinite(v).sum())


def test_SY07_many_ties_use_the_tie_correction():
    v = np.round(season() / 5 + 0.004 * np.arange(300) + RNG.normal(0, 0.6, 300))   # few integer levels
    s, prod, smk, slope = compare(v)
    no_tie = oracle.seasonal_mk(s.values, tie_correction=False)
    assert smk["var_S"] < no_tie["var_S"]                                    # ties really present
    assert_matches(prod, smk, slope)                                         # regional test applies the correction


def test_SY08_uneven_seasonal_coverage():
    v = season() + RNG.normal(0, 1, 300)
    v[:150][np.isin(np.arange(150) % 12, [5, 6, 7])] = np.nan              # wet-season gaps in the first half
    s, prod, smk, slope = compare(v)
    assert_matches(prod, smk, slope)


def test_SY09_short_series_is_insufficient():
    s, prod, smk, slope = compare((season() + RNG.normal(0, 1, 300))[:60])
    assert prod["insufficient_data"] is True and not oracle.sufficient(s)


def test_SY10_high_variance_noise():
    s, prod, smk, slope = compare(season() + 0.01 * np.arange(300) + RNG.normal(0, 25, 300))
    assert_matches(prod, smk, slope)


def test_SY11_hamed_rao_and_ols_match_the_oracle():
    v = season() + 0.01 * np.arange(300) + RNG.normal(0, 1, 300)
    s = pd.Series(v, index=IDX)
    prod = trend_one(s)
    a = oracle.anomaly(s).values
    assert math.isclose(prod["hr_p_value"], oracle.hamed_rao(a)["p"], rel_tol=1e-7, abs_tol=1e-12)
    ols = oracle.ols_anomaly(s)
    assert math.isclose(prod["ols_slope_per_decade"], ols["slope_per_decade"], rel_tol=1e-9)
    assert math.isclose(prod["ols_ci95_per_decade"], (ols["ci95"][1] - ols["ci95"][0]) / 2, rel_tol=1e-8)


def test_SY12_strong_autocorrelation_type_I_error_is_reported():
    """Methodology check (not a pass/fail on the code): AR(1) phi = 0.8 monthly noise without trend.
    The raw Seasonal MK assumes independent years; we measure its false-positive rate at alpha = 0.05."""
    rej_raw = rej_hr = 0
    n_sim = 200
    for k in range(n_sim):
        e = np.zeros(300)
        z = np.random.default_rng(k).normal(0, 1, 300)
        for t in range(1, 300):
            e[t] = 0.8 * e[t - 1] + z[t]
        s = pd.Series(season() + e, index=IDX)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            r = trend_one(s)
        rej_raw += r["p_value"] < 0.05
        rej_hr += r["hr_p_value"] < 0.05
    SY12_RESULT.update(raw=rej_raw / n_sim, hamed_rao=rej_hr / n_sim, n_sim=n_sim)
    assert 0 <= rej_raw / n_sim <= 1                                          # recorded, judged in the report


SY12_RESULT: dict = {}


def _cube(values):                                                           # (time, lat, lon) synthetic cube
    nt, nlat, nlon = values.shape
    return xr.DataArray(values, dims=("time", "lat", "lon"),
                        coords={"time": IDX[:nt], "lat": np.arange(nlat) + 0.5, "lon": np.arange(nlon) + 0.5})


def test_SY13_grid_matches_oracle_and_controls_fdr():
    """Multiple-comparison grid: 900 null cells and 100 cells with a real trend."""
    nlat, nlon = 25, 40
    v = season()[:, None, None] + RNG.normal(0, 1, (300, nlat, nlon))
    truth = np.zeros((nlat, nlon), bool)
    truth[:5, :20] = True                                                    # 100 trend cells
    v[:, truth] += (0.02 * np.arange(300))[:, None]
    g = grid_trend(_cube(v), "2001-01", "2025-12")
    x = np.moveaxis(v, 0, -1).reshape(-1, 300)
    ora_p = np.array([oracle.seasonal_mk(c, tie_correction=False)["p"] for c in x])
    ora_slope = np.array([oracle.seasonal_sen(c) * 10 for c in x])
    assert np.allclose(g["p_value"].values.ravel(), ora_p, rtol=1e-9, atol=1e-14)
    assert np.allclose(g["slope_per_decade"].values.ravel(), ora_slope, rtol=1e-9, atol=1e-12)
    ora_q = oracle.bh_qvalues(ora_p)
    assert np.allclose(g["p_value_fdr"].values.ravel(), ora_q, rtol=1e-9, atol=1e-14)
    sig = g["p_value_fdr"].values < 0.05
    false_disc = (sig & ~truth).sum() / max(1, sig.sum())
    assert truth[sig].mean() > 0.9 and false_disc <= 0.1                     # BH keeps false discoveries low here


def test_SY14_bh_matches_oracle_with_nans_and_ties():
    p = np.array([0.01, np.nan, 0.04, 0.04, 0.2, 0.0001, np.nan, 0.03, 1.0])
    assert np.allclose(bh_fdr(p), oracle.bh_qvalues(p), equal_nan=True)


def test_SY15_grid_without_tie_correction_is_conservative():
    """Documented production choice: the map variance ignores ties. With heavy ties the map p is larger (never
    smaller) than the tie-corrected p, so map significance can only be understated, not overstated."""
    v = np.round(season()[:, None, None] / 5 + RNG.normal(0, 0.5, (300, 4, 4)) + 0.003 * np.arange(300)[:, None, None])
    g = grid_trend(_cube(v), "2001-01", "2025-12")
    x = np.moveaxis(v, 0, -1).reshape(-1, 300)
    p_tie = np.array([oracle.seasonal_mk(c)["p"] for c in x])
    assert (g["p_value"].values.ravel() >= p_tie - 1e-15).all()
