"""Băng biển trên lưới cực (time, cell): API phải trả hemi/row/col và khối polar để web vẽ bản đồ hai cực."""
import base64

import numpy as np
import xarray as xr

from app import config
from conftest import TIME

PIX = [(1, 1, 1, 80.0, 10.0), (1, 1, 2, 81.0, 40.0), (1, 2, 2, 82.0, 70.0), (-1, 1, 1, -70.0, 0.0)]   # hemi, row, col, lat, lon


def _cube(path):
    t = np.arange(len(TIME))
    seasonal = 10 * np.cos(2 * np.pi * t / 12)
    north = 80 - 0.05 * t + seasonal                    # −6 %/thập kỷ
    vals = np.stack([north, north, north, np.full(len(t), 50.0) + seasonal], axis=1).astype("float32")
    land_n, land_s = np.zeros((4, 5), bool), np.zeros((3, 4), bool)
    land_n[0] = True
    h, r, c, la, lo = map(np.array, zip(*PIX))
    xr.DataArray(vals, dims=("time", "cell"), name="seaice_nsidc", coords={
        "time": TIME, "cell": np.arange(len(PIX)), "lat": ("cell", la.astype("float32")), "lon": ("cell", lo.astype("float32")),
        "hemi": ("cell", h.astype("int8")), "row": ("cell", r.astype("int16")), "col": ("cell", c.astype("int16"))},
    ).assign_attrs(units="%", shape_n=np.array([4, 5], "int16"), shape_s=np.array([3, 4], "int16"),
                   land_n=np.packbits(land_n.ravel()), land_s=np.packbits(land_s.ravel())).to_netcdf(path)


def test_polar_grid_endpoints(client):
    path = config.CUBE_DIR / "cube_seaice_nsidc.nc"
    _cube(path)
    try:
        q = {"variable_id": "nsidc_sea_ice", "start": "2001-01", "end": "2020-12"}
        v = {x["id"]: x for x in client.get("/api/v1/variables").json()["variables"]}["nsidc_sea_ice"]
        assert v["available"] and v["grid"] == "polar"

        for kind in ("trends", "values"):
            g = client.get(f"/api/v1/{kind}/grid", params=q).json()
            assert g["grid"] == "polar" and (g["polar"]["N"]["rows"], g["polar"]["N"]["cols"]) == (4, 5), kind
            assert base64.b64decode(g["polar"]["N"]["land_b64"])[0] == 0b11111000, kind      # hàng 0 (5 pixel) là đất
            assert sorted((c["hemi"], c["row"], c["col"]) for c in g["cells"]) == [("N", 1, 1), ("N", 1, 2), ("N", 2, 2), ("S", 1, 1)]
        north = [c for c in client.get("/api/v1/trends/grid", params=q).json()["cells"] if c["hemi"] == "N"]
        assert all(abs(c["slope_per_decade"] + 6) < 0.1 and c["significant_fdr"] for c in north)

        body = {**{k: q[k] for k in ("variable_id", "start", "end")}, "region": {"type": "bbox", "bbox": [-180, 60, 180, 90]}}
        t = client.post("/api/v1/trends", json=body).json()
        assert abs(t["slope_per_decade"] + 6) < 0.1 and t["significant"]
        body["region"]["bbox"] = [100, 5, 110, 25]
        assert client.post("/api/v1/trends", json=body).json()["error"]["code"] == "NO_DATA"
        # time-lapse: one pole's pixel raster, rows bottom-up (web flips them), land mask at full resolution
        f = client.get("/api/v1/values/frames", params={**q, "kind": "value"}).json()
        g = f["grid"]
        assert (g["nlat"], g["nlon"], g["polar"]["hemi"], g["polar"]["factor"]) == (4, 5, "N", 1) and g["polar"]["land_b64"]
        fr = np.frombuffer(base64.b64decode(f["data_b64"]), "<i2").reshape(len(f["times"]), 4, 5)
        assert np.sum(fr[0] != f["missing"]) == 3 and fr[0, 4 - 1 - 2, 2] != f["missing"]          # pixel row 2, col 2
        assert abs(fr[0, 4 - 1 - 1, 1] * f["scale"] + f["offset"] - 90.0) < 0.01                   # 80 + 10·cos(0) in Jan 2001
        s = client.get("/api/v1/values/frames", params={**q, "hemi": "S"}).json()
        assert (s["grid"]["nlat"], s["grid"]["nlon"], s["grid"]["polar"]["hemi"]) == (3, 4, "S")
        anom = np.frombuffer(base64.b64decode(s["data_b64"]), "<i2")
        assert np.all(np.abs(anom[anom != s["missing"]] * s["scale"] + s["offset"]) < 0.01)          # S pixel = climatology only
        assert client.get("/api/v1/values/frames", params={**q, "hemi": "X"}).status_code == 422

        # a square drawn on the Arctic map: exactly the pixels by row/col, echoed back, its own trend id
        drawn = {"type": "polar", "hemi": "N", "rows": [1, 1], "cols": [1, 2]}
        t = client.post("/api/v1/trends", json={**body, "region": drawn}).json()
        assert abs(t["slope_per_decade"] + 6) < 0.1 and t["significant"], t
        assert (t["region"]["hemi"], t["region"]["rows"], t["region"]["cols"]) == ("N", [1, 1], [1, 2])
        other = client.post("/api/v1/trends", json={**body, "region": {**drawn, "cols": [1, 1]}}).json()
        assert other["trend_id"] != t["trend_id"]
        assert client.post("/api/v1/trends", json={**body, "region": {**drawn, "rows": [3, 2]}}).status_code == 422
        assert client.post("/api/v1/trends", json={**body, "region": {**drawn, "rows": [0, 0]}}).json()["error"]["code"] == "NO_DATA"   # land row
        assert client.post("/api/v1/series", json={**body, "region": drawn}).status_code == 200
        chat = client.post("/api/v1/chat", json={"message": "Analyze the selected trend.", "use_tools": True,
                                                 "context": {**{k: q[k] for k in ("variable_id", "start", "end")}, "region": drawn}}).json()
        assert chat["evidence"] and chat["actions"][0]["params"]["region"]["type"] == "polar", chat

        flat = client.get("/api/v1/trends/grid", params={**q, "variable_id": "imerg_precip"}).json()
        assert flat["grid"] == "latlon" and "polar" not in flat and "hemi" not in flat["cells"][0]
    finally:
        path.unlink()
