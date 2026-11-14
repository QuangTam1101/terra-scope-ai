"""Time-lapse frames (/values/frames): exact decoding, anomaly definition, block averaging, validation. Fake cubes."""
import base64

import numpy as np

from app import bridge, timelapse

Q = {"variable_id": "imerg_precip", "start": "2001-01", "end": "2002-12"}


def decode(body):
    g = body["grid"]
    q = np.frombuffer(base64.b64decode(body["data_b64"]), dtype="<i2").reshape(len(body["times"]), g["nlat"], g["nlon"])
    return np.where(q == body["missing"], np.nan, q * body["scale"] + body["offset"])


def test_value_frames_decode_to_the_cube(client):
    body = client.get("/api/v1/values/frames", params={**Q, "kind": "value"}).json()
    assert body["times"][0] == "2001-01" and len(body["times"]) == 24 and body["coarsen_factor"] == 1
    cube = bridge.load_cube("precip").sel(time=slice("2001-01", "2002-12"))
    got = decode(body)
    assert got.shape == cube.shape
    assert np.allclose(got, cube.values, atol=body["scale"], equal_nan=True)
    lo, hi = body["display_range"]
    assert lo < hi and body["grid"]["cell_deg"] == 1.0 and body["grid"]["south"] == float(cube.lat.min()) - 0.5


def test_anomaly_frames_remove_each_calendar_month(client):
    body = client.get("/api/v1/values/frames", params=Q).json()
    assert body["kind"] == "anomaly" and body["display_range"][0] == -body["display_range"][1]
    a = decode(body)
    for m in range(12):                                   # each calendar month averages to zero in every cell
        assert np.nanmax(np.abs(np.nanmean(a[m::12], axis=0))) < 3 * body["scale"]


def test_blocks_are_averaged_when_over_budget(client, monkeypatch):
    monkeypatch.setattr(timelapse, "VALUE_BUDGET", 2000)
    timelapse._frames.cache_clear()
    body = client.get("/api/v1/values/frames", params={**Q, "kind": "value"}).json()
    timelapse._frames.cache_clear()
    assert body["coarsen_factor"] > 1 and body["grid"]["cell_deg"] == float(body["coarsen_factor"])
    assert body["grid"]["nlat"] * body["grid"]["nlon"] * len(body["times"]) <= 2000
    assert "averaged" in body["note"]


def test_bbox_and_validation(client):
    body = client.get("/api/v1/values/frames", params={**Q, "bbox": "100,5,104,10", "kind": "value"}).json()
    assert body["grid"]["nlon"] == 4 and body["grid"]["nlat"] == 5
    assert client.get("/api/v1/values/frames", params={**Q, "kind": "other"}).status_code == 422
    assert client.get("/api/v1/values/frames", params={**Q, "start": "1990-01"}).status_code == 400
    assert client.get("/api/v1/values/frames", params={**Q, "variable_id": "nope"}).status_code == 404
