"""Minimal NASA AppEEARS client: submit a task JSON, wait, download the bundle.

Usage:
  python appeears.py products [FILTER]        # list products (no login)
  python appeears.py layers PRODUCT           # list layers of a product (no login)
  python appeears.py run TASK.json OUT_DIR    # submit, wait, download (needs login)
  python appeears.py point POINTS.csv|.geojson LAYERS START END OUT_DIR    # values at points -> CSV
  python appeears.py area POLYGONS.geojson LAYERS START END OUT_DIR [FORMAT] [PROJECTION]
                                              # polygons -> geotiff|netcdf4, geographic|native (default geotiff geographic)
  python appeears.py fetch TASK_ID OUT_DIR    # resume waiting/downloading a submitted task (id in OUT_DIR/task_id.txt)

  LAYERS = PRODUCT:LAYER, comma-separated, e.g. MOD13Q1.061:_250m_16_days_NDVI,VNP14A1.002:FireMask
  START/END = MM-DD-YYYY.  POINTS.csv needs columns: id, latitude, longitude (category optional)

Login: export EARTHDATA_USER=... EARTHDATA_PASS=...  (free account: urs.earthdata.nasa.gov)
"""
import csv
import json
import os
import sys
import time
from pathlib import Path

import requests

API = "https://appeears.earthdatacloud.nasa.gov/api"


def load_env(path=Path(__file__).with_name(".env")):
    """Put KEY=value lines from the project's .env into os.environ (real env vars win)."""
    if path.exists():
        for line in path.read_text().splitlines():
            key, sep, value = line.partition("=")
            if sep and not key.strip().startswith("#"):
                os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def login():
    load_env()
    user, password = os.environ.get("EARTHDATA_USER"), os.environ.get("EARTHDATA_PASS")
    if not (user and password) or user == "ten_dang_nhap":
        sys.exit("Fill in EARTHDATA_USER and EARTHDATA_PASS in .env (or export them in this terminal).")
    r = requests.post(f"{API}/login", auth=(user, password))
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def read_features(path):
    """Return a list of GeoJSON Features from a FeatureCollection, Feature, or bare geometry file."""
    g = json.loads(Path(path).read_text())
    if g["type"] == "FeatureCollection":
        return g["features"]
    if g["type"] == "Feature":
        return [g]
    return [{"type": "Feature", "properties": {}, "geometry": g}]


def read_points(path):
    """Points from a CSV (id, latitude, longitude[, category]) or GeoJSON Point features."""
    if Path(path).suffix.lower() == ".csv":
        with open(path, newline="") as f:
            rows = list(csv.DictReader(f))
        return [{"id": r.get("id") or str(i), "category": r.get("category") or "points",
                 "latitude": float(r["latitude"]), "longitude": float(r["longitude"])}
                for i, r in enumerate(rows, 1)]
    return [{"id": str(f.get("properties", {}).get("id", i)), "category": "points",
             "latitude": f["geometry"]["coordinates"][1], "longitude": f["geometry"]["coordinates"][0]}
            for i, f in enumerate(read_features(path), 1) if f["geometry"]["type"] == "Point"]


def build_task(kind, src, layer_spec, start, end, fmt="geotiff", proj="geographic"):
    """Build an AppEEARS point or area task from a locations file."""
    layers = [dict(zip(("product", "layer"), s.strip().split(":", 1))) for s in layer_spec.split(",")]
    if any("layer" not in l for l in layers):
        sys.exit("LAYERS must look like PRODUCT:LAYER, e.g. MOD13Q1.061:_250m_16_days_NDVI")
    params = {"dates": [{"startDate": start, "endDate": end}], "layers": layers}
    if kind == "point":
        params["coordinates"] = read_points(src)
        found = len(params["coordinates"])
    else:
        polygons = [f for f in read_features(src) if f["geometry"]["type"] in ("Polygon", "MultiPolygon")]
        params["geo"] = {"type": "FeatureCollection", "features": polygons}
        params["output"] = {"format": {"type": fmt}, "projection": proj}
        found = len(polygons)
    if not found:
        sys.exit(f"No {'points' if kind == 'point' else 'polygons'} found in {src}")
    print(f"{found} {'points' if kind == 'point' else 'polygons'} read from {src}")
    return {"task_type": kind, "task_name": f"{kind}_{Path(src).stem}", "params": params}


def run(task, out_dir):
    auth = login()
    r = requests.post(f"{API}/task", json=task, headers=auth)
    if not r.ok:
        sys.exit(f"Task rejected ({r.status_code}): {r.text}")
    task_id = r.json()["task_id"]
    print("task", task_id)
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    (Path(out_dir) / "task_id.txt").write_text(task_id)  # resume later with: fetch TASK_ID OUT_DIR
    fetch(task_id, out_dir, auth)


def task_status(task_id, auth):
    """Status, tolerating transient blips (empty/HTML reply, dropped connection) during hours-long polls."""
    try:
        return requests.get(f"{API}/task/{task_id}", headers=auth, timeout=60).json()["status"]
    except (requests.RequestException, ValueError, KeyError) as e:
        return f"unknown ({type(e).__name__}, retrying)"


def fetch(task_id, out_dir, auth):
    # ponytail: fixed 30 s poll; area tasks can take minutes to hours
    while (status := task_status(task_id, auth)) != "done":
        if status == "error":
            sys.exit(f"Task {task_id} failed; check it at https://appeears.earthdatacloud.nasa.gov/explore")
        print("status:", status)
        time.sleep(30)

    out = Path(out_dir).resolve()
    for f in requests.get(f"{API}/bundle/{task_id}", headers=auth).json()["files"]:
        dest = (out / f["file_name"]).resolve()
        if not dest.is_relative_to(out):  # don't trust server-supplied paths
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        with requests.get(f"{API}/bundle/{task_id}/{f['file_id']}", headers=auth, stream=True) as d:
            d.raise_for_status()
            with open(dest, "wb") as fh:
                for chunk in d.iter_content(1 << 20):
                    fh.write(chunk)
        print("saved", dest)


if __name__ == "__main__":
    cmd, *args = sys.argv[1:] or ["help"]
    if cmd == "products":
        for p in requests.get(f"{API}/product").json():
            line = f"{p['ProductAndVersion']:24} {p['Description']} ({p.get('Resolution', '')})"
            if not args or args[0].lower() in line.lower():
                print(line)
    elif cmd == "layers":
        for name, meta in requests.get(f"{API}/product/{args[0]}").json().items():
            print(f"{name:40} {meta.get('Description', '')}")
    elif cmd == "run":
        run(json.loads(Path(args[0]).read_text()), args[1])
    elif cmd == "fetch":
        fetch(args[0], args[1], login())
    elif cmd in ("point", "area"):
        src, layers, start, end, out_dir, *output = args
        task = build_task(cmd, src, layers, start, end, *output)
        Path(out_dir).mkdir(parents=True, exist_ok=True)
        (Path(out_dir) / "task.json").write_text(json.dumps(task, indent=2))  # keep a copy to rerun/inspect
        run(task, out_dir)
    else:
        print(__doc__)