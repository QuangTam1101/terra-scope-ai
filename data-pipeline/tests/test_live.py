"""Dự báo từ quan sát MỚI (NASA POWER): test KHÔNG gọi mạng (HTTP và GISTEMP đều được thay bằng dữ liệu giả)."""
import json

import numpy as np
import pandas as pd
import pytest

from pipeline import forecast as F
from pipeline import live
from tests.test_forecast import LAT, LON, TIME, _cube

MONTHS = pd.date_range("2001-01-01", "2026-09-01", freq="MS")


def _raw(valid_until="2026-09"):
    par = {k: {} for k in ("T2M", "PRECTOTCORR", "GWETTOP", "EVLAND")}
    for t in pd.date_range("2001-01-01", "2026-12-01", freq="MS"):
        key = t.strftime("%Y%m")
        ok = t.strftime("%Y-%m") <= valid_until
        par["T2M"][key] = 20 + t.month if ok else -999.0
        par["PRECTOTCORR"][key] = 3.0 if ok else -999.0
        par["GWETTOP"][key] = 0.5 if ok else -999.0
        par["EVLAND"][key] = 2.0 if ok else -999.0
    for k in par:
        par[k]["202613"] = 9.9                                # cột 'cả năm' phải bị bỏ qua
    return {"properties": {"parameter": par}}


def _frame(seed=0, phi=0.8):
    """Chuỗi POWER giả có tính nhớ (AR1) để mô hình có thể dự báo được."""
    rng = np.random.default_rng(seed)
    out = {}
    for c, (m, s) in {"t2m": (25, 2), "precip": (150, 40), "soil": (0.4, 0.05), "evap": (3, 0.5)}.items():
        x = np.zeros(len(MONTHS))
        e = rng.normal(size=len(MONTHS))
        for i in range(1, len(x)):
            x[i] = phi * x[i - 1] + np.sqrt(1 - phi ** 2) * e[i]
        out[c] = m + s * x + 4 * np.sin(2 * np.pi * MONTHS.month.to_numpy() / 12) * (s / 2)
    return pd.DataFrame(out, index=MONTHS)


def test_cell_center_rounds_to_the_1_degree_square():
    assert live.cell_center(21.03, 105.85) == (21.5, 105.5)
    assert live.cell_center(-0.2, -179.9) == (-0.5, -179.5)
    assert live.cell_center(95, 190)[0] < 90 and -180 <= live.cell_center(95, 190)[1] <= 180


def test_parse_power_handles_missing_and_converts_units():
    df = live.parse_power(_raw("2026-09"))
    assert df.index[0] == pd.Timestamp("2001-01-01") and df.index[-1] == pd.Timestamp("2026-12-01")
    assert df.loc["2026-09-01", "precip"] == pytest.approx(3.0 * 30)            # mm/ngày × số ngày
    assert df.loc["2026-10-01"].isna().all() and not df.isna().loc["2026-09-01"].any()
    assert 9.9 not in df.to_numpy()                                              # không lẫn cột 'cả năm'


def test_power_z_uses_only_the_base_period_and_flags_the_last_complete_month():
    df = _frame()
    z = live.power_z(df, 2020)
    base = z.loc[:"2020-12-31"]
    assert abs(base["t2m"].mean()) < 0.05 and abs(base["t2m"].std() - 1) < 0.1
    z2 = live.power_z(df.assign(t2m=df["t2m"].where(df.index <= "2020-12-01", df["t2m"] + 50)), 2020)
    assert np.allclose(z.loc[:"2020-12-31", "t2m"], z2.loc[:"2020-12-31", "t2m"])  # đổi dữ liệu SAU giai đoạn nền không đổi z trong nền
    dfm = df.copy(); dfm.loc["2026-09-01", "soil"] = np.nan
    assert live.last_complete(live.power_z(dfm, 2020)) == pd.Timestamp("2026-08-01")


@pytest.fixture(scope="module")
def tiny_model():
    cube = _cube(phi=0.85)
    cubes = {"precip": cube, "t2m": cube}
    model, _ = F.fit("precip", cubes, "2012-12-01", "2015-12-01", n_train=30_000, n_cal=20_000, n_test_cells=40, iters=40, clf_iters=30, verbose=False)
    return model


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    monkeypatch.setattr(live, "gistemp_global", lambda *a, **k: pd.Series(0.5, index=MONTHS))


def test_forecast_live_from_fresh_observations(tiny_model):
    la, lo = float(LAT[3]), float(LON[2])
    f = F.forecast_live("precip", la, lo, power=_frame(), model=tiny_model)
    assert f["origin"] == "2026-09-01" and f["time"][0] == "2026-10" and len(f["time"]) == 12 and f["cell"] == {"lat": la, "lon": lo}
    assert all(abs(a + b + c - 1) < 1e-6 for a, b, c in zip(f["p_below"], f["p_near"], f["p_above"]))
    assert all(lo_ <= x <= hi for lo_, x, hi in zip(f["lower"], f["forecast"], f["upper"]))
    assert len(f["observed"]) == 12 and f["observed"][-1]["t"] == "2026-09" and f["contributions"] and f["analogs"]


def test_forecast_live_explains_only_the_requested_months(tiny_model):
    la, lo = float(LAT[3]), float(LON[2])
    f = F.forecast_live("precip", la, lo, power=_frame(), model=tiny_model, not_before=pd.Timestamp("2026-12-01"), not_after=pd.Timestamp("2027-02-01"))
    assert f["time"][f["headline_index"]] in ("2026-12", "2027-01", "2027-02")


def test_forecast_live_rejects_cells_outside_the_model_grid(tiny_model):
    with pytest.raises(ValueError):
        F.forecast_live("precip", 60.0, 10.0, power=_frame(), model=tiny_model)


def test_live_backtest_scores_real_months_after_the_training_period(tiny_model):
    frames = {(float(LAT[i]), float(LON[j])): _frame(seed=10 * i + j) for i in range(2) for j in range(4)}
    m = F.live_backtest("precip", frames, eval_h=(1, 3), model=tiny_model)
    assert m["test_period"][0] == "2025-01" and m["test_period"][1] == "2026-09" and m["n_cells"] == 8
    r = m["by_horizon"][1]["model"]
    assert r["skill_vs_clim"] > 0.1 and r["rpss"] > 0 and "persistence" in m["by_horizon"][1]       # chuỗi AR(1) nên dự báo được
    assert m["by_horizon"][1]["model"]["skill_vs_clim"] >= m["by_horizon"][3]["model"]["skill_vs_clim"] - 0.05
