"""Time-lapse frames for the 2D map: one grid per month, either the monthly value or the anomaly (value minus the
average of the same calendar month over the chosen period). Display only: no test, no trend.

Size control: cells are averaged in k x k blocks (k = 1, 2, 4, ...) until cells x months fits VALUE_BUDGET, then values
are quantised to int16 (about 0.003% of the display range) and sent as base64. A global 0.5 degree map for 300 months
becomes 2 degree cells (16,200 cells per frame, about 5 MB compressed).
"""
from __future__ import annotations

import base64
import re
from functools import lru_cache

import numpy as np

from . import bridge
from .errors import ApiError

VALUE_BUDGET = 5_000_000
FACTORS = (1, 2, 4, 8, 16)
MISSING = -32768


def _coarsen(cube, k: int):
    return cube if k == 1 else cube.coarsen(lat=k, lon=k, boundary="trim").mean()   # NaN cells are skipped by default


@lru_cache(maxsize=8)
def _frames(pipeline_id: str, start: str, end: str, bbox: tuple | None, kind: str, _mtime: float) -> dict:
    cube = bridge.load_cube(pipeline_id).sel(time=slice(start, end))
    if bbox:
        w, s, e, n = bbox
        cube = cube.sel(lat=slice(s, n), lon=slice(w, e))
    nt, nlat, nlon = cube.sizes["time"], cube.sizes["lat"], cube.sizes["lon"]
    if nt == 0 or nlat == 0 or nlon == 0:
        raise ApiError(404, "NO_DATA", "No data for this area and period.")
    k = next((f for f in FACTORS if (nlat // f) * (nlon // f) * nt <= VALUE_BUDGET), FACTORS[-1])
    cube = _coarsen(cube, k)
    if kind == "anomaly":
        clim = cube.groupby("time.month").mean("time", skipna=True)
        cube = cube.groupby("time.month") - clim
    arr = cube.transpose("time", "lat", "lon").values.astype("float64")
    finite = arr[np.isfinite(arr)]
    if finite.size == 0:
        raise ApiError(404, "NO_DATA", "No data for this area and period.")
    if kind == "anomaly":
        r = float(np.percentile(np.abs(finite), 98)) or 1.0
        lo, hi = -r, r
    else:
        lo, hi = float(np.percentile(finite, 2)), float(np.percentile(finite, 98))
        hi = hi if hi > lo else lo + 1.0
    # Quantise the full data range (not only the display range) so no value is clipped.
    qlo, qhi = float(finite.min()), float(finite.max())
    qhi = qhi if qhi > qlo else qlo + 1.0
    offset, scale = (qhi + qlo) / 2, (qhi - qlo) / 65000
    q = np.where(np.isfinite(arr), np.round((arr - offset) / scale), MISSING).clip(-32767, 32767)
    q[~np.isfinite(arr)] = MISSING
    lat, lon = cube["lat"].values.astype("float64"), cube["lon"].values.astype("float64")
    cell = float(np.round(np.median(np.diff(lat)), 4)) if len(lat) > 1 else float(bridge.meta(pipeline_id)["cell_size_deg"] * k)
    if lat[0] > lat[-1]:                                   # always send south-to-north rows
        q, lat = q[:, ::-1, :], lat[::-1]
    times = [str(t)[:7] for t in cube["time"].values]
    return {"times": times, "grid": {"west": float(lon[0] - cell / 2), "south": float(lat[0] - cell / 2), "cell_deg": cell,
                                     "nlon": int(len(lon)), "nlat": int(len(lat))},
            "scale": scale, "offset": offset, "missing": MISSING, "display_range": [lo, hi], "coarsen_factor": k,
            "data_b64": base64.b64encode(np.ascontiguousarray(q, dtype="<i2").tobytes()).decode("ascii")}


def frames(v, start: str, end: str, bbox: tuple | None, kind: str) -> dict:
    if kind not in ("value", "anomaly"):
        raise ApiError(422, "VALIDATION_ERROR", "kind must be 'value' or 'anomaly'.", {"kind": kind})
    for m in (start, end):
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", m):
            raise ApiError(422, "VALIDATION_ERROR", "start and end must be 'YYYY-MM'.", {"value": m})
    if (bridge.meta(v.pipeline_id) or {}).get("grid") == "polar":
        raise ApiError(400, "NOT_SUPPORTED", "The time-lapse is not available for the polar sea-ice grid yet.",
                       {"variable_id": v.id})
    p = bridge.cube_path(v.pipeline_id)
    out = _frames(v.pipeline_id, start, end, bbox, kind, p.stat().st_mtime if p.exists() else 0.0)
    note = ("Anomaly = this month minus the average of the same calendar month over the period shown. "
            if kind == "anomaly" else "Monthly mean values. ")
    if out["coarsen_factor"] > 1:
        note += f"Cells are averaged into {out['grid']['cell_deg']:g} degree blocks to keep the animation light."
    return {"variable_id": v.id, "units": v.display_units, "kind": kind, "start": start, "end": end, **out, "note": note.strip()}
