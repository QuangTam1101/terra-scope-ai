"""Phase 8.5: grid cache status (8.5A) and contradiction discovery (8.5C). Fake cubes only, no network."""
PERIOD = {"start": "2001-01", "end": "2020-12"}


def test_grid_status_reports_cache_without_computing(client):
    q = {"kind": "trend", "variable_id": "imerg_precip", "start": "2002-01", "end": "2019-12"}
    before = client.get("/api/v1/grids/status", params=q).json()
    assert before["available"] is True and before["cached"] is False and before["cell_size_deg"] == 1.0
    client.get("/api/v1/trends/grid", params={"variable_id": "imerg_precip", "start": "2002-01", "end": "2019-12"})
    after = client.get("/api/v1/grids/status", params=q).json()
    assert after["cached"] is True


def test_grid_status_unknown_variable_and_bad_kind(client):
    body = client.get("/api/v1/grids/status", params={"kind": "trend", "variable_id": "nope", **PERIOD}).json()
    assert body == {"kind": "trend", "cached": False, "available": False, "cell_size_deg": None}
    assert client.get("/api/v1/grids/status", params={"kind": "other", "variable_id": "imerg_precip", **PERIOD}).status_code == 422


# ---------------------------------------------------------------- 8.5C Contradiction Hunter 2.0
from app import hunt  # noqa: E402

BODY = {"variable_id": "imerg_precip", "start": "2001-01", "end": "2020-12", "extent": [100, 5, 110, 25], "tile_deg": 5}


def _cells(spec):
    """spec: list of (lon, lat, slope, significant, valid)."""
    return [{"lon": lo, "lat": la, "slope_per_decade": s, "significant_fdr": g, "valid": v} for lo, la, s, g, v in spec]


def test_discover_regions_finds_opposite_sign_pair_and_retests_it(client):
    r = client.post("/api/v1/hunt/discover", json=BODY)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "regions" and body["tiles_scanned"] > 0 and body["candidates"]
    c = body["candidates"][0]
    assert c["a"]["bbox"][2] <= 105 and c["b"]["bbox"][0] >= 105          # west increases, east decreases (fake cube)
    assert c["a"]["share_up"] >= hunt.DOMINANT_SHARE and c["b"]["share_down"] >= hunt.DOMINANT_SHARE
    assert c["test"]["verdict"] == "opposite_significant" and c["classification"] == "statistical_evidence"
    assert c["regional"]["a"]["slope_per_decade"] > 0 > c["regional"]["b"]["slope_per_decade"]
    assert "%" not in "".join(k for k in c["metrics"])                    # no confidence percentage field
    again = client.post("/api/v1/hunt/discover", json=BODY).json()
    assert [x["a"]["bbox"] + x["b"]["bbox"] for x in again["candidates"]] == [x["a"]["bbox"] + x["b"]["bbox"] for x in body["candidates"]]


def test_discover_same_sign_everywhere_gives_no_region_candidates(client):
    body = client.post("/api/v1/hunt/discover", json={**BODY, "variable_id": "gldas_soil_moisture_0_10cm"}).json()
    assert body["candidates"] == []                                      # soil moisture rises everywhere in the fake cube


def test_discover_rejects_incompatible_datasets_and_oversized_scans(client):
    r = client.post("/api/v1/hunt/discover", json={**BODY, "variable_id_b": "gldas_soil_moisture_0_10cm"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "INCOMPATIBLE_DATASETS"
    r = client.post("/api/v1/hunt/discover", json={**BODY, "extent": [-180, -90, 180, 90], "tile_deg": 1})
    assert r.status_code == 400 and r.json()["error"]["code"] == "RESOURCE_LIMIT"
    assert client.post("/api/v1/hunt/discover", json={**BODY, "max_candidates": 99}).status_code == 422


def test_dataset_candidates_rules_missing_data_and_ordering():
    ext, tile = (0, 0, 10, 5), 5
    a = _cells([(x + .5, y + .5, 1.0, True, True) for x in range(10) for y in range(5)])
    b = _cells([(x + .5, y + .5, -1.0 if x < 5 else 1.0, x < 5, True) for x in range(10) for y in range(5)])
    rows, n = hunt.dataset_candidates(a, b, ext, tile, 5)
    assert n == 2 and len(rows) == 2
    assert rows[0]["a"]["bbox"] == [0, 0, 5, 5] and "opposite_direction" in rows[0]["reasons"]   # opposite signs rank first
    assert rows[1]["a"]["bbox"] == [5, 0, 10, 5] and rows[1]["reasons"] == ["different_significance_picture"]
    # agreement gives nothing
    assert hunt.dataset_candidates(a, a, ext, tile, 5)[0] == []
    # missing observations: tiles with too few valid cells are ignored
    sparse = _cells([(0.5, 0.5, -1.0, True, True), (1.5, 0.5, -1.0, True, False)])
    assert hunt.dataset_candidates(a, sparse, ext, tile, 5) == ([], 0)


def test_region_candidates_deterministic_and_distinct_tiles():
    ext, tile = (0, 0, 20, 5), 5
    spec = []
    for x in range(20):
        for y in range(5):
            s = 1.0 if x < 10 else -1.0
            spec.append((x + .5, y + .5, s * (1 + x / 10), True, True))
    rows, _ = hunt.region_candidates(_cells(spec), ext, tile, 8)
    keys = [tuple(r["a"]["bbox"]) for r in rows] + [tuple(r["b"]["bbox"]) for r in rows]
    assert len(keys) == len(set(keys)) == 4                              # 2 up tiles, 2 down tiles, each used once
    assert rows == hunt.region_candidates(list(reversed(_cells(spec))), ext, tile, 8)[0]


def test_compatibility_table_only_same_quantity():
    assert hunt.compatibility("gldas_air_temperature", "merra2_air_temperature_2m")
    assert hunt.compatibility("imerg_precip", "gldas_soil_moisture_0_10cm") is None


def test_agent_region_budget_follows_half_degree_grid(client, monkeypatch):
    """Regression (Phase 8.5 E2E): Detective rejected the Sahel box on the 0.5° grid (1504 cells > old 1000-cell cap)
    although Hunt accepts it. The cell budget now follows the 1000 deg² area cap."""
    from app import bridge as br, catalog, tools
    from app.errors import ApiError
    from app.schemas import BBoxRegion
    import pytest as _pt
    v = catalog.VARIABLES["imerg_precip"]
    real = br.meta
    monkeypatch.setattr(tools.bridge, "meta", lambda pid: {**real(pid), "cell_size_deg": 0.5})
    tools._region(BBoxRegion(type="bbox", bbox=(-17, 10, 30, 18)), v)            # 376 deg², 1504 cells: allowed
    with _pt.raises(ApiError) as e:
        tools._region(BBoxRegion(type="bbox", bbox=(0, 0, 40, 40)), v)            # 1600 deg²: still refused
    assert e.value.code == "RESOURCE_LIMIT"
