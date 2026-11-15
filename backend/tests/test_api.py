"""Kiểm tra backend theo FRONTEND_BACKEND_CONTRACT v0.2, kể cả đúng các request frontend nhánh UI đang gửi."""
WEST = [100.0, 5.0, 104.0, 10.0]
EAST = [106.0, 5.0, 110.0, 10.0]
PERIOD = {"start": "2001-01", "end": "2020-12"}


def _err(r, status, code):
    assert r.status_code == status, r.text
    assert r.json()["error"]["code"] == code


def test_health(client):
    body = client.get("/api/v1/health").json()
    assert body["status"] == "ok"
    assert set(body["available_variables"]) == {"imerg_precip", "gldas_soil_moisture_0_10cm",
                                                "gldas_evapotranspiration"}


def test_variables(client):
    vs = {v["id"]: v for v in client.get("/api/v1/variables").json()["variables"]}
    p = vs["imerg_precip"]
    assert p["available"] and p["units"] == "mm/month" and p["spatial_resolution_deg"] == 1.0
    assert p["coverage"] == {"start": "2001-01", "end": "2020-12"}
    assert vs["gldas_soil_moisture_0_10cm"]["units"] == "m3/m3"
    # bước chọn biến môi trường → dataset
    assert p["parameter"] == "precipitation" and p["dataset_name"].startswith("GPM IMERG")
    temps = {v["dataset_name"] for v in vs.values() if v["parameter"] == "air_temperature"}
    assert len(temps) == 2                                            # GLDAS (đất liền) và MERRA-2 (đất + biển)
    assert vs["merra2_air_temperature_2m"]["available"] is False and vs["merra2_air_temperature_2m"]["coverage"] is None


def test_regions(client):
    body = client.get("/api/v1/regions").json()
    ids = {r["id"]: r for r in body["regions"]}
    assert ids["global"]["is_demo"] and ids["global"]["bbox"] == [-180.0, -90.0, 180.0, 90.0]
    assert ids["mekong_region"]["bbox"] == [94.0, 8.0, 110.0, 35.0] and not ids["mekong_region"]["is_demo"]
    assert body["limits"]["max_bbox_area_deg2"] == 64800
    assert ids["mekong_delta"]["bbox"] == [104.4, 8.5, 106.9, 11.1] and not ids["mekong_delta"]["is_demo"]
    assert "northern_vietnam" in ids          # id frontend đang dùng
    assert body["limits"]["cell_size_deg"] == 1.0


def test_series_preset(client):
    body = client.post("/api/v1/series", json={"variable_id": "imerg_precip",
                                               "region": {"type": "preset", "id": "mekong_delta"}, **PERIOD}).json()
    assert len(body["points"]) == 240 and len(body["climatology"]) == 12
    assert body["points"][0]["t"] == "2001-01" and body["units"] == "mm/month"
    assert body["quality"]["sufficient"] is True


def test_trend_increasing_west(client):
    body = client.post("/api/v1/trends", json={"variable_id": "imerg_precip",
                                               "region": {"type": "bbox", "bbox": WEST}, **PERIOD}).json()
    assert body["direction"] == "increasing" and body["significant"] is True
    assert 15 < body["slope_per_decade"] < 25                     # thật: +20 / thập kỷ
    lo, hi = body["slope_ci"]
    assert lo < body["slope_per_decade"] < hi
    assert body["trend_id"].startswith("tr_") and "statistically significant" in body["plain_summary"]
    assert len(body["trend_line"]) == 2


def test_trend_insufficient_short_period(client):
    body = client.post("/api/v1/trends", json={"variable_id": "imerg_precip", "region": {"type": "bbox", "bbox": WEST},
                                               "start": "2001-01", "end": "2005-12"}).json()
    assert body["quality"]["sufficient"] is False
    assert body["significant"] is None and body["p_value"] is None and body["direction"] == "no_trend"


def test_frontend_geojson_point_and_polygon(client):
    # Đúng dạng frontend gửi: {type: 'geojson', geometry: geoSelection}
    pt = client.post("/api/v1/trends", json={"variable_id": "imerg_precip", "start": "2001-01", "end": "2020-12",
                                             "region": {"type": "geojson",
                                                        "geometry": {"type": "point", "coordinates": [105.7, 10.2]}}})
    assert pt.status_code == 200, pt.text
    assert pt.json()["region"]["bbox"] == [105.0, 10.0, 106.0, 11.0] and pt.json()["warnings"]
    poly = client.post("/api/v1/series", json={"variable_id": "imerg_precip", **PERIOD, "region": {
        "type": "geojson", "geometry": {"type": "polygon",
                                        "coordinates": [[[104, 9], [107, 9], [107, 12], [104, 12], [104, 9]]]}}})
    assert poly.status_code == 200 and poly.json()["region"]["bbox"] == [104, 9, 107, 12]


def test_geojson_point_out_of_range_is_rejected(client):
    # User typed (lat, lon) instead of (lon, lat): latitude 106.7 must not be clamped into the 89-90° cell.
    for coords in ([10.8, 106.7], [200, 10], [-181, 0], [0, -91]):
        r = client.post("/api/v1/trends", json={"variable_id": "imerg_precip", **PERIOD, "region": {
            "type": "geojson", "geometry": {"type": "Point", "coordinates": coords}}})
        assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR", (coords, r.text)
    edge = client.post("/api/v1/trends", json={"variable_id": "imerg_precip", **PERIOD, "region": {
        "type": "geojson", "geometry": {"type": "Point", "coordinates": [180, 90]}}})
    assert edge.status_code != 422 or "Point coordinates" not in edge.text


def test_global_region_and_area_limit(client, monkeypatch):
    # Cả thế giới là vùng hợp lệ; phần ngoài cube giả chỉ sinh cảnh báo
    r = client.post("/api/v1/series", json={"variable_id": "imerg_precip", **PERIOD,
                                            "region": {"type": "preset", "id": "global"}})
    assert r.status_code == 200 and any("outside the data area" in w for w in r.json()["warnings"])
    from app import config
    monkeypatch.setattr(config, "MAX_BBOX_AREA_DEG2", 2500.0)       # giới hạn vẫn hoạt động khi được đặt
    _err(client.post("/api/v1/trends", json={"variable_id": "imerg_precip", **PERIOD,
                                             "region": {"type": "bbox", "bbox": [-100, -40, 0, 40]}}),
         400, "REGION_TOO_LARGE")


def test_value_heatmap(client):
    body = client.get("/api/v1/values/grid", params={"variable_id": "imerg_precip", **PERIOD,
                                                     "bbox": "100,5,104,10"}).json()
    assert body["stat"] == "mean" and len(body["cells"]) == 4 * 5 and body["units"] == "mm/month"
    assert body["value_range"]["p02"] <= body["value_range"]["p98"]
    july = client.get("/api/v1/values/grid", params={"variable_id": "imerg_precip", **PERIOD,
                                                     "bbox": "100,5,104,10", "month": 7}).json()
    jan = client.get("/api/v1/values/grid", params={"variable_id": "imerg_precip", **PERIOD,
                                                    "bbox": "100,5,104,10", "month": 1}).json()
    assert july["cells"][0]["value"] > jan["cells"][0]["value"]          # mùa mưa của cube giả ở tháng 7
    land = client.get("/api/v1/values/grid", params={"variable_id": "gldas_soil_moisture_0_10cm", **PERIOD,
                                                     "bbox": "107,5,110,6"}).json()
    by_lon = {c["lon"]: c for c in land["cells"]}
    assert by_lon[108.5]["value"] is None and by_lon[108.5]["valid_fraction"] == 0


def test_errors(client):
    base = {"variable_id": "imerg_precip", **PERIOD}
    _err(client.post("/api/v1/trends", json={**base, "region": {"type": "bbox", "bbox": [104.6, 8.6, 104.9, 8.9]}}),
         400, "REGION_TOO_SMALL")
    _err(client.post("/api/v1/trends", json={**base, "region": {"type": "preset", "id": "atlantis"}}), 404, "NOT_FOUND")
    _err(client.post("/api/v1/trends", json={**base, "variable_id": "nope", "region": {"type": "bbox", "bbox": WEST}}),
         404, "NOT_FOUND")
    _err(client.post("/api/v1/trends", json={**base, "variable_id": "merra2_air_temperature_2m",
                                             "region": {"type": "bbox", "bbox": WEST}}), 503, "DATA_NOT_READY")
    _err(client.post("/api/v1/trends", json={**base, "start": "1990-01", "region": {"type": "bbox", "bbox": WEST}}),
         400, "INVALID_TIME_RANGE")
    _err(client.post("/api/v1/trends", json={**base, "start": "2001-13", "region": {"type": "bbox", "bbox": WEST}}),
         422, "VALIDATION_ERROR")
    _err(client.post("/api/v1/series", json={**base, "variable_id": "gldas_soil_moisture_0_10cm",
                                             "region": {"type": "bbox", "bbox": [108.0, 5.0, 110.0, 10.0]}}),
         404, "NO_DATA")
    _err(client.get("/api/v1/does-not-exist"), 404, "NOT_FOUND")


def test_grid(client):
    body = client.get("/api/v1/trends/grid", params={"variable_id": "imerg_precip", **PERIOD,
                                                     "bbox": "100,5,104,10"}).json()
    assert body["cell_size_deg"] == 1.0 and body["fdr_method"] == "benjamini_hochberg"
    assert len(body["cells"]) == 4 * 5
    assert all(c["valid"] and c["significant_fdr"] and c["slope_per_decade"] > 0 for c in body["cells"])
    assert body["value_range"]["min_slope"] <= body["value_range"]["max_slope"]


def test_grid_partial_years_and_no_data_cells(client):
    body = client.get("/api/v1/trends/grid", params={"variable_id": "gldas_soil_moisture_0_10cm",
                                                     "start": "2001-03", "end": "2020-12", "bbox": "107,5,110,6"}).json()
    assert body["start"] == "2002-01" and body["warnings"]
    by_lon = {c["lon"]: c for c in body["cells"] if c["lat"] == 5.5}
    assert by_lon[107.5]["valid"] and not by_lon[108.5]["valid"] and by_lon[108.5]["significant_fdr"] is None


def test_compare_contradiction(client):
    body = client.post("/api/v1/compare", json={"variable_id": "imerg_precip", **PERIOD,
                                                "region_a": {"type": "bbox", "bbox": WEST},
                                                "region_b": {"type": "bbox", "bbox": EAST}}).json()
    assert body["verdict"] == "opposite_significant" and body["is_contradiction"] is True
    assert body["difference"]["significant"] and body["difference"]["slope_diff_per_decade"] > 0
    assert body["a"]["direction"] == "increasing" and body["b"]["direction"] == "decreasing"


def test_explain_uses_trend_ids(client):
    tr = client.post("/api/v1/trends", json={"variable_id": "imerg_precip",
                                             "region": {"type": "preset", "id": "mekong_delta"}, **PERIOD}).json()
    body = client.post("/api/v1/explain", json={"question": "Is it getting wetter?",
                                                "context": {"trend_ids": [tr["trend_id"]]}}).json()
    assert body["cited_numbers"] and body["disclaimer"]
    assert "gemini" not in body["model"].lower()                      # R14
    assert body["actions"][0]["params"]["variable_id"] == "gldas_soil_moisture_0_10cm"


def test_explain_frontend_context(client):
    # Đúng dạng frontend gửi: context {variable_id, period: "2005-2018"}, không có region
    body = client.post("/api/v1/explain", json={"question": "What is the trend?",
                                                "context": {"variable_id": "imerg_precip", "period": "2005-2018"}})
    assert body.status_code == 200, body.text
    assert body.json()["cited_numbers"] and any("demo region" in w for w in body.json()["warnings"])


def test_fine_resolution_regional_cube(client):
    v = {x["id"]: x for x in client.get("/api/v1/variables").json()["variables"]}["gldas_evapotranspiration"]
    assert v["spatial_resolution_deg"] == 0.25 and v["extent"] == [104.0, 8.0, 107.0, 12.0]
    tr = client.post("/api/v1/trends", json={"variable_id": "gldas_evapotranspiration", **PERIOD,
                                             "region": {"type": "preset", "id": "mekong_delta"}})
    assert tr.status_code == 200, tr.text
    assert tr.json()["direction"] == "increasing" and not tr.json()["warnings"][:-1]   # chỉ còn ghi chú mô hình
    grid = client.get("/api/v1/trends/grid", params={"variable_id": "gldas_evapotranspiration", **PERIOD,
                                                     "bbox": "104.4,8.5,106.9,11.1"}).json()
    assert grid["cell_size_deg"] == 0.25 and len(grid["cells"]) == 10 * 10
    assert grid["cells"][0]["lat"] == 8.625                                          # toạ độ đã làm tròn
    # Vùng nằm ngoài cube → NO_DATA; vùng chỉ lấn một phần → vẫn chạy nhưng có cảnh báo
    _err(client.post("/api/v1/trends", json={"variable_id": "gldas_evapotranspiration", **PERIOD,
                                             "region": {"type": "preset", "id": "northern_vietnam"}}), 404, "NO_DATA")
    part = client.post("/api/v1/series", json={"variable_id": "gldas_evapotranspiration", **PERIOD,
                                               "region": {"type": "bbox", "bbox": [106.0, 11.0, 108.0, 13.0]}}).json()
    assert any("outside the data area" in w for w in part["warnings"])
    # Ô 0,25°: khung 0,3° vẫn chứa tâm ô → hợp lệ (với lưới 1° thì REGION_TOO_SMALL)
    ok = client.post("/api/v1/series", json={"variable_id": "gldas_evapotranspiration", **PERIOD,
                                             "region": {"type": "bbox", "bbox": [104.6, 8.6, 104.9, 8.9]}})
    assert ok.status_code == 200


def test_cors_for_vite_dev_server(client):
    r = client.options("/api/v1/variables", headers={"Origin": "http://localhost:5173",
                                                     "Access-Control-Request-Method": "GET"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"
