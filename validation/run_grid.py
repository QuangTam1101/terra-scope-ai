"""Full-family grid check: independent Seasonal MK + Sen for EVERY cell, independent Benjamini-Hochberg over the
whole declared family, compared with GET /api/v1/trends/grid (no bbox = every cell with data).
Two oracle variants: (a) the documented production rule (no tie correction in the map variance) for an exact
check; (b) the tie-corrected variance, to measure the impact of that documented simplification.
Writes validation/results/grid_cases.json."""
import json
import math
import os
import sys
import time
from pathlib import Path

import numpy as np
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import oracle  # noqa: E402

API = os.getenv("TERRA_E2E_BASE", "http://127.0.0.1:8000").rstrip("/") + "/api/v1"
OUT = Path(__file__).resolve().parent / "results"
ERFC = np.frompyfunc(math.erfc, 1, 1)
GRID_CASES = [("GR-01", "merra2_air_temperature_2m", "2001-01", "2025-12"), ("GR-02", "imerg_precip", "2001-01", "2024-12")]


def grid_oracle(variable_id, start, end, chunk=1500):
    da = oracle.cube(variable_id)
    t = np.array([str(x)[:7] for x in da["time"].values])
    k0, k1 = int(np.where(t == start)[0][0]), int(np.where(t == end)[0][0])
    vals = da.values[k0:k1 + 1].astype("float64")                       # (time, lat, lon)
    ny = vals.shape[0] // 12
    x = np.moveaxis(vals, 0, -1).reshape(-1, ny, 12)                    # (cell, year, season)
    ncell = x.shape[0]
    S = np.zeros(ncell); V0 = np.zeros(ncell); Vt = np.zeros(ncell); slope = np.full(ncell, np.nan)
    iu = np.triu_indices(ny, 1)
    gap = (iu[1] - iu[0]).astype("float64")
    for a in range(0, ncell, chunk):
        b = x[a:a + chunk]                                              # (c, y, s)
        diff = b[:, None, :, :] - b[:, :, None, :]                      # [c, i, j, s] = x_j - x_i
        up = diff[:, iu[0], iu[1], :]                                   # (c, pairs, s)
        S[a:a + chunk] = np.nansum(np.sign(up), axis=(1, 2))
        valid = np.isfinite(b)
        n = valid.sum(axis=1).astype("float64")                         # (c, s)
        V0[a:a + chunk] = (n * (n - 1) * (2 * n + 5) / 18).sum(axis=1)
        eq = (diff == 0) & valid[:, None, :, :] & valid[:, :, None, :]  # ties within each season
        tsize = eq.sum(axis=2).astype("float64")                        # (c, y, s): size of the tie group of each value
        tie = np.where(valid, (tsize - 1) * (2 * tsize + 5), 0).sum(axis=(1, 2))
        Vt[a:a + chunk] = V0[a:a + chunk] - tie / 18
        r = (up / gap[None, :, None]).reshape(len(b), -1)
        has = np.isfinite(r).any(axis=1)
        if has.any():
            slope[a:a + chunk][has] = np.nanmedian(r[has], axis=1)
    nyears = np.isfinite(x).any(axis=2).sum(axis=1)

    def p_of(var):
        with np.errstate(invalid="ignore", divide="ignore"):
            z = np.where(S > 0, S - 1, np.where(S < 0, S + 1, 0)) / np.sqrt(var)
        p = np.full(ncell, np.nan)
        ok = np.isfinite(z) & (nyears >= 10)
        p[ok] = ERFC(np.abs(z[ok]) / math.sqrt(2)).astype("float64")
        return p
    p0, pt = p_of(V0), p_of(Vt)
    lat = np.repeat(da["lat"].values, da.sizes["lon"]); lon = np.tile(da["lon"].values, da.sizes["lat"])
    return {"lat": lat, "lon": lon, "slope": slope * 10, "p0": p0, "q0": oracle.bh_qvalues(p0), "pt": pt, "qt": oracle.bh_qvalues(pt)}


def run(case):
    gid, var, start, end = case
    t0 = time.time()
    ora = grid_oracle(var, start, end)
    t1 = time.time()
    r = requests.get(API + "/trends/grid", params={"variable_id": var, "start": start, "end": end}, timeout=900)
    r.raise_for_status()
    api = r.json()
    t2 = time.time()
    key = {(round(a, 4), round(o, 4)): i for i, (a, o) in enumerate(zip(ora["lat"], ora["lon"]))}
    rows = [(key[(round(c["lat"], 4), round(c["lon"], 4))], c) for c in api["cells"]]
    idx = np.array([i for i, _ in rows])
    valid = np.array([c["valid"] for _, c in rows])
    a_slope = np.array([np.nan if c["slope_per_decade"] is None else c["slope_per_decade"] for _, c in rows])
    a_p = np.array([np.nan if c["p_value"] is None else c["p_value"] for _, c in rows])
    a_q = np.array([np.nan if c["q_value"] is None else c["q_value"] for _, c in rows])
    a_sig = np.array([c["significant_fdr"] for _, c in rows], dtype=object)
    o_slope, o_p, o_q = ora["slope"][idx], ora["p0"][idx], ora["q0"][idx]
    alpha = api["alpha"]
    o_family = int(np.isfinite(ora["p0"]).sum())
    d_slope = np.nanmax(np.abs(a_slope[valid] - o_slope[valid]))
    d_p = np.nanmax(np.abs(a_p[valid] - o_p[valid]))
    d_q = np.nanmax(np.abs(a_q[valid] - o_q[valid]))
    o_sig = o_q < alpha
    near = np.abs(o_q - alpha) < 1e-6                                   # q within API rounding of alpha
    sig_mismatch = int(((a_sig[valid] == True) != o_sig[valid])[~near[valid]].sum())  # noqa: E712
    tie_changes = int(((ora["qt"] < alpha) != (ora["q0"] < alpha))[np.isfinite(ora["q0"])].sum())
    tie_p_shift = float(np.nanmax(ora["p0"] - ora["pt"]))
    checks = [
        {"check": "cells returned = cells with data (finite oracle slope)", "pass": len(rows) == int(np.isfinite(ora["slope"]).sum()), "expected": int(np.isfinite(ora["slope"]).sum()), "actual": len(rows)},
        {"check": "FDR family size (cells with a valid p)", "pass": int(valid.sum()) == o_family, "expected": o_family, "actual": int(valid.sum())},
        {"check": "max |slope| delta (API 6 dp)", "pass": d_slope <= 6e-7, "delta": float(d_slope)},
        {"check": "max |p| delta (API 6 dp)", "pass": d_p <= 6e-7, "delta": float(d_p)},
        {"check": "max |q| delta, full-family BH (API 6 dp)", "pass": d_q <= 6e-7, "delta": float(d_q)},
        {"check": "significance flags (q < alpha), excluding cells within rounding of alpha", "pass": sig_mismatch == 0, "expected": 0, "actual": sig_mismatch, "cells_near_alpha": int(near[valid].sum())},
    ]
    return {"id": gid, "variable_id": var, "start": start, "end": end, "cells": len(rows), "significant_cells_api": int((a_sig == True).sum()),  # noqa: E712
            "oracle_seconds": round(t1 - t0, 1), "api_seconds": round(t2 - t1, 1), "checks": checks,
            "methodology_tie_correction": {"cells_whose_fdr_verdict_changes_with_tie_correction": tie_changes,
                                           "max_p_reduction_from_tie_correction": tie_p_shift},
            "status": "PASS" if all(c["pass"] for c in checks) else "FAIL"}


def main():
    OUT.mkdir(exist_ok=True)
    res = []
    for c in GRID_CASES:
        r = run(c)
        res.append(r)
        print(r["id"], r["status"], json.dumps(r["checks"], default=lambda o: o.item() if hasattr(o, "item") else str(o)), r["methodology_tie_correction"], r["cells"], r["significant_cells_api"])
    (OUT / "grid_cases.json").write_text(json.dumps(res, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")


if __name__ == "__main__":
    main()
