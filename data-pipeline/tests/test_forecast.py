"""Test dự báo trên cube GIẢ (AR(1) + mùa có thể dự đoán được), không cần dữ liệu NASA thật, không gọi mạng."""
import numpy as np
import pandas as pd
import pytest
import xarray as xr

from pipeline import forecast as F

LAT, LON = np.arange(5.5, 15, 1.0), np.arange(100.5, 110, 1.0)
TIME = pd.date_range("2001-01-01", "2020-12-01", freq="MS")


def _cube(phi=0.85, seed=0):
    rng = np.random.default_rng(seed)
    T, N = len(TIME), len(LAT) * len(LON)
    e = rng.normal(size=(T, N))
    x = np.zeros((T, N))
    for t in range(1, T):
        x[t] = phi * x[t - 1] + np.sqrt(1 - phi ** 2) * e[t]
    season = 10 * np.sin(2 * np.pi * (TIME.month.to_numpy() - 3) / 12)[:, None]
    data = (100 + season + 5 * x).reshape(T, len(LAT), len(LON))
    return xr.DataArray(data, coords={"time": TIME, "lat": LAT, "lon": LON}, dims=("time", "lat", "lon"))


@pytest.fixture(scope="module")
def fitted():
    cube = _cube()
    model, metrics = F.fit("precip", {"precip": cube, "t2m": cube}, "2012-12-01", "2015-12-01", n_train=40_000, n_cal=20_000,
                           n_test_cells=40, iters=60, clf_iters=40, verbose=False)
    return cube, model, metrics


def test_climatology_uses_only_train_period():
    cube = _cube()
    X, _, _ = F._flat(cube)
    mu_a, _ = F.climatology(X, F._times(cube), pd.Timestamp("2012-12-01"), 0.1)
    X2 = X.copy()
    X2[F._times(cube) > pd.Timestamp("2012-12-01")] += 1000        # đổi dữ liệu SAU mốc train
    mu_b, _ = F.climatology(X2, F._times(cube), pd.Timestamp("2012-12-01"), 0.1)
    assert np.allclose(mu_a, mu_b)


def test_features_shape_and_no_lookahead():
    cube = _cube()
    X, la, lo = F._flat(cube)
    times = F._times(cube)
    mu, sd = F.climatology(X, times, pd.Timestamp("2012-12-01"), 0.1)
    Z = F.to_z(X, times, mu, sd)
    up = pd.Timestamp("2012-12-01")
    params = {"clim": {"precip": (mu, sd)}, "tz": F.tercile_z(X, times, up, mu, sd), "ctxdf": F.climate_context(cube, up)}
    o, c, h = np.array([50, 80]), np.array([3, 7]), np.array([1, 6])
    f1 = F.features(F.build_state("precip", {"precip": cube}, params), o, c, h)
    assert f1.shape == (2, len(F.FEATURES))
    cube2 = cube.copy()
    cube2[100:] = 9999                                              # phá tương lai của origin 50 và 80 (origin + h < 100 chỉ với h ≤ 6, đã chọn)
    S2 = F.build_state("precip", {"precip": cube2}, params)
    assert np.allclose(f1[:, [F.FEATURES.index(f"lag{k}") for k in range(12)]],
                       F.features(S2, o, c, h)[:, [F.FEATURES.index(f"lag{k}") for k in range(12)]])


def test_model_beats_climatology_on_predictable_series(fitted):
    _, _, m = fitted
    assert m["by_horizon"][1]["model"]["skill_vs_clim"] > 0.3
    assert m["by_horizon"][1]["model"]["skill_vs_clim"] >= m["by_horizon"][12]["model"]["skill_vs_clim"]


def test_probabilities_are_better_than_climatology(fitted):
    _, _, m = fitted
    assert m["by_horizon"][1]["model"]["rpss"] > 0.1
    assert m["by_horizon"][1]["model"]["tercile_accuracy"] > 0.45


def test_shrinkage_forces_no_skill_to_climatology():
    cube = _cube(phi=0.0)                                           # nhiễu trắng: không dự báo được
    model, m = F.fit("precip", {"precip": cube, "t2m": cube}, "2012-12-01", "2015-12-01", n_train=30_000, n_cal=20_000,
                     n_test_cells=40, iters=40, clf_iters=30, verbose=False)
    assert m["by_horizon"][6]["model"]["skill_vs_clim"] > -0.03     # co về khí hậu nên không tệ hơn khí hậu
    assert m["by_horizon"][6]["model"]["rpss"] > -0.02


def test_conformal_interval_is_calibrated(fitted):
    _, _, m = fitted
    for h in F.EVAL_H:
        assert 0.65 <= m["by_horizon"][h]["model"]["coverage_conformal"] <= 0.95


def test_forecast_region_and_map(fitted):
    cube, model, _ = fitted
    cubes = {"precip": cube, "t2m": cube}
    f = F.forecast_region("precip", cubes, (100, 5, 105, 10), range(1, 7), model=model)
    assert f["horizons"] == [1, 2, 3, 4, 5, 6] and len(f["forecast"]) == 6
    assert all(lo <= x <= hi for lo, x, hi in zip(f["lower"], f["forecast"], f["upper"]))
    assert f["time"][0] == "2021-01" and set(f["signal"]) <= {"above", "below", "none"}
    assert all(abs(a + b + c - 1) < 1e-6 for a, b, c in zip(f["p_below"], f["p_near"], f["p_above"]))
    assert len(f["analogs"]) == 5 and all(a["origin"][5:] == f["origin"][5:7] for a in f["analogs"])
    mp = F.forecast_map("precip", cubes, 3, model=model)
    assert len(mp["cells"]) == len(LAT) * len(LON) and mp["time"] == "2021-03"


def test_region_without_cells_raises(fitted):
    cube, model, _ = fitted
    with pytest.raises(ValueError):
        F.forecast_region("precip", {"precip": cube, "t2m": cube}, (0, 0, 5, 5), model=model)


def test_outlook_variant_forecasts_from_climate_indices_only():
    cube = _cube(phi=0.85)
    cubes = {"precip": cube, "t2m": cube}
    model, m = F.fit("precip", cubes, "2012-12-01", "2015-12-01", variant="outlook", n_train=30_000, n_cal=20_000,
                     n_test_cells=40, iters=40, clf_iters=30, verbose=False)
    assert model["hmax"] == 18 and set(m["by_horizon"]) == {3, 6, 12, 18}
    assert "damped_persistence" not in m["by_horizon"][6]               # baseline dùng quan sát tại origin → không có ở Outlook
    assert m["by_horizon"][12]["model"]["skill_vs_clim"] > -0.05        # không tệ hơn khí hậu nhờ co về khí hậu
    f = F.forecast_region("precip", cubes, (100, 5, 105, 10), model=model, targets=["2026-11", "2027-11"], variant="outlook")
    assert f["horizons"] == [F._months_between(pd.Timestamp(f["origin"]), pd.Timestamp("2026-11-01")),
                             F._months_between(pd.Timestamp(f["origin"]), pd.Timestamp("2027-11-01"))]
    assert f["time"] == ["2026-11", "2027-11"] and f["origin"] == str(F.latest_origin().date())
    assert {c["group"] for c in f["contributions"]} <= F.OUTLOOK_ACTIVE
    assert any(c["key"] == "nino34" for c in f["conditions"])
    with pytest.raises(ValueError):
        F.forecast_region("precip", cubes, (100, 5, 105, 10), model=model, targets=["2030-01"], variant="outlook")


def test_contributions_explain_the_forecast(fitted):
    cube, model, _ = fitted
    f = F.forecast_region("precip", {"precip": cube, "t2m": cube}, (100, 5, 105, 10), range(1, 4), model=model)
    assert {c["group"] for c in f["contributions"]} >= {"Recent local anomalies", "Neighbouring areas"}
    assert all(abs(c["effect_p_above"]) <= 1 for c in f["contributions"])
