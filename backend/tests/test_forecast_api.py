"""Endpoint /forecast*: mô hình nhỏ huấn luyện ngay trong test trên cube giả (không cần mô hình thật, không gọi mạng ngoài file chỉ số có sẵn)."""
import json

import pytest

from app import forecast_service as fs

BBOX = [100, 5, 106, 12]


@pytest.fixture(scope="module")
def trained(client, tmp_path_factory):
    d = tmp_path_factory.mktemp("models")
    cubes = fs._fc_cubes("precip")
    for variant, kw in (("full", dict(train="2012-12-01", cal="2015-12-01")), ("outlook", dict(train="2012-12-01", cal="2015-12-01"))):
        model, metrics = fs.pforecast.fit("precip", cubes, kw["train"], kw["cal"], variant=variant, n_train=30_000, n_cal=15_000,
                                              n_test_cells=30, iters=40, clf_iters=30, verbose=False)
        fs.pforecast.save_model(model, fs.pforecast.model_path("precip", variant, d))
        (d / ("metrics.json" if variant == "full" else "metrics_outlook.json")).write_text(json.dumps({"precip": metrics}))
    (d / "reality_check.json").write_text(json.dumps({"source": "test", "origin": "2024-12", "generated": "2026-11-14", "regions": {"global": {"outlook": {
        "months": ["2025-01"], "actual": [0.1], "forecast": [0.2], "lower": [-0.2], "upper": [0.5], "persistence": 0.3, "baseline_period": "2001-2022",
        "mae_model": 0.1, "mae_climatology": 0.1, "mae_persistence": 0.2, "coverage_80": 1.0, "n_months": 1}}}}))
    old, old_today = fs.pforecast.MODEL_DIR, fs._today_month
    fs.pforecast.MODEL_DIR = d
    fs._today_month = lambda: "2026-11"
    fs.pforecast.load_model.cache_clear()
    yield
    fs.pforecast.MODEL_DIR, fs._today_month = old, old_today
    fs.pforecast.load_model.cache_clear()


def _post(client, **kw):
    body = {"variable_id": "imerg_precip", "region": {"type": "bbox", "bbox": BBOX}, **kw}
    return client.post("/api/v1/forecast", json=body)


def test_outlook_forecast_from_now(client, trained):
    r = _post(client, months=13)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["mode"] == "outlook" and j["points"][0]["t"] == "2026-11" and j["points"][-1]["t"] == "2027-11"
    assert j["origin"] == "2026-06" and j["points"][0]["lead_months"] == 5 and len(j["points"]) == 13
    assert all(p["lower"] <= p["forecast"] <= p["upper"] for p in j["points"])
    p0 = j["points"][0]
    assert abs(p0["p_below"] + p0["p_near"] + p0["p_above"] - 1) < 0.01 and p0["confidence"] in ("high", "moderate", "low", "none")
    ds = j["data_status"]
    assert ds["today"] == "2026-11" and ds["satellite_data_end"] == "2020-12" and "nino34" in ds["indices_end"]
    ex = j["explanation"]
    assert ex["simple"] and ex["conditions"] and ex["scientific"]["model"]["mode"] == "outlook"
    assert {c["group"] for c in ex["contributions"]} <= {"ENSO and Pacific (Niño, SOI, PDO)", "Indian & Atlantic oceans, QBO (IOD, NAO, QBO)", "Long-term warming"}
    assert {b["lead_months"] for b in j["backtest"]} == {3, 6, 12, 18}


def test_satellite_forecast_and_limits(client, trained):
    j = _post(client, mode="satellite", months=6).json()
    assert j["mode"] == "satellite" and j["points"][0]["t"] == "2021-01" and j["origin"] == "2020-12"
    assert {c["group"] for c in j["explanation"]["contributions"]} >= {"Recent local anomalies", "Neighbouring areas"}
    assert len(j["analogs"]) == 5 and j["backtest"][0]["lead_months"] == 1
    r = _post(client, mode="satellite", start="2023-01")
    assert r.status_code == 400 and r.json()["error"]["code"] == "INVALID_PARAMETER"


def test_map_status_and_reality(client, trained):
    r = client.get("/api/v1/forecast/map", params={"variable_id": "imerg_precip", "month": "2027-02"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["t"] == "2027-02" and j["lead_months"] == 8 and j["cells"] and all(0 <= c["p_above"] <= 1 for c in j["cells"])
    assert client.get("/api/v1/forecast/map", params={"variable_id": "imerg_precip", "month": "2031-02"}).status_code == 400
    satellite = client.get("/api/v1/forecast/map", params={"variable_id": "imerg_precip", "mode": "satellite"})
    assert satellite.status_code == 200, satellite.text
    assert satellite.json()["t"] == "2021-03" and satellite.json()["lead_months"] == 3
    s = client.get("/api/v1/forecast/status", params={"variable_id": "imerg_precip"}).json()
    assert s["origin"] == "2026-06" and s["mode"] == "outlook"
    rc = client.get("/api/v1/forecast/reality-check").json()
    assert rc["regions"]["global"]["outlook"]["n_months"] == 1


def test_forecast_errors(client, trained):
    assert _post(client, variable_id="nope").status_code == 404
    assert _post(client, months=99).status_code in (400, 422)
    r = client.post("/api/v1/forecast", json={"variable_id": "gldas_soil_moisture_0_10cm", "region": {"type": "bbox", "bbox": BBOX}})
    assert r.status_code == 503 and r.json()["error"]["code"] == "MODEL_NOT_READY"


def test_fc_cubes_cut_to_shared_months(monkeypatch, tmp_path):
    """GLDAS cubes run to 2025-12, IMERG to 2024-12: cross-variable features need one time axis (forecast._same_grid)."""
    import numpy as np, pandas as pd, xarray as xr
    def cube(end):
        t = pd.date_range("2001-01-01", end, freq="MS")
        return xr.DataArray(np.zeros((len(t), 2, 2)), coords={"time": t, "lat": [0.5, 1.5], "lon": [0.5, 1.5]}, dims=("time", "lat", "lon"))
    (tmp_path / "cube_precip.nc").touch()
    monkeypatch.setattr(fs.papi, "CUBE_DIR", tmp_path)
    monkeypatch.setattr(fs.papi, "load_cube", lambda v: cube("2025-12-01" if v == "soil_moisture" else "2024-12-01"))
    cubes = fs._fc_cubes("soil_moisture")
    assert sorted(cubes) == ["precip", "soil_moisture"]
    assert {c.sizes["time"] for c in cubes.values()} == {288} and str(cubes["soil_moisture"].time.values[-1])[:7] == "2024-12"
