"""Phase 6B shadow benchmark. EXPERIMENTAL ONLY: nothing in production imports this file.

Reproducible, bounded Monte Carlo study of the five Phase 6 candidates (C1..C5 in
PHASE_6_CORRECTION_PROPOSAL.md). "Current" methods call the production functions read-only
(pipeline.trends.trend_one, pipeline.grid.grid_trend, pipeline.trends.bh_fdr); "shadow" methods come
from backend/shadow/methods.py or are defined here. No production statistic, threshold, cube or API
output is changed. A bounded read-only shadow on real NASA 1-degree cells is included for C1/C5.

Run from the repository root:
    .venv/Scripts/python.exe backend/shadow/benchmark_phase6.py --out backend/shadow/results/phase6_benchmark.json
"""
import argparse
import json
import math
import platform
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import scipy
import xarray as xr
from scipy import ndimage
from scipy.stats import norm

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "data-pipeline"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pymannkendall as mk  # noqa: E402
from pipeline.grid import grid_trend  # noqa: E402  (production, read-only)
from pipeline.trends import bh_fdr, trend_one  # noqa: E402  (production, read-only)
import methods as sh  # noqa: E402  (existing shadow helpers)

YEARS, ALPHA = 24, 0.05
INDEX = pd.date_range("2001-01-01", periods=YEARS * 12, freq="MS")
T_YEARS = np.arange(YEARS * 12) / 12.0
SEASON = 3.0 * np.sin(2 * np.pi * np.arange(YEARS * 12) / 12)
warnings.filterwarnings("ignore", category=RuntimeWarning)


# ---------------------------------------------------------------- noise models (unit-ish marginal variance)
def noise(rng, kind, n=YEARS * 12):
    if kind == "iid":
        return rng.standard_normal(n)
    if kind.startswith("ar1_"):
        phi = float(kind.split("_")[1])
        e = rng.standard_normal(n) * math.sqrt(1 - phi ** 2)
        x = np.empty(n)
        x[0] = rng.standard_normal()
        for k in range(1, n):
            x[k] = phi * x[k - 1] + e[k]
        return x
    if kind == "year_effect":
        # Shared interannual anomaly (rho 0.5, marginal sd 0.6) added to every month of a year: violates the
        # Seasonal MK assumption that the 12 seasonal sub-series are independent.
        rho, sd = 0.5, 0.6
        u = np.empty(YEARS)
        u[0] = rng.standard_normal() * sd
        for y in range(1, YEARS):
            u[y] = rho * u[y - 1] + rng.standard_normal() * sd * math.sqrt(1 - rho ** 2)
        return rng.standard_normal(n) + np.repeat(u, 12)
    raise ValueError(kind)


def series(rng, kind, beta_per_decade):
    return SEASON + beta_per_decade / 10 * T_YEARS + noise(rng, kind)


def mc(k, n):
    """Proportion with Monte Carlo standard error."""
    p = k / n if n else float("nan")
    return {"rate": round(p, 4), "mcse": round(math.sqrt(p * (1 - p) / n), 4) if n else None, "n": int(n)}


def hac_ols_ci(values):
    """Newey-West (Bartlett) HAC interval for the OLS slope of monthly anomalies, per decade.
    Bandwidth L = floor(4 (n/100)^(2/9)), the Newey-West (1994) rule of thumb. Targets the OLS slope, not Sen."""
    s = pd.Series(values, index=INDEX)
    a = (s - s.groupby(s.index.month).transform("mean")).to_numpy()
    ok = np.isfinite(a)
    y, t = a[ok], T_YEARS[ok]
    X = np.column_stack([np.ones_like(t), t])
    xtx_inv = np.linalg.inv(X.T @ X)
    b = xtx_inv @ X.T @ y
    e = y - X @ b
    n = len(y)
    L = int(math.floor(4 * (n / 100) ** (2 / 9)))
    u = X * e[:, None]
    S = u.T @ u
    for lag in range(1, L + 1):
        w = 1 - lag / (L + 1)
        G = u[lag:].T @ u[:-lag]
        S += w * (G + G.T)
    se = math.sqrt((xtx_inv @ S @ xtx_inv)[1, 1])
    return (b[1] - 1.96 * se) * 10, (b[1] + 1.96 * se) * 10, L


# ---------------------------------------------------------------- C2: regional verdict calibration
def exp_c2(rng, reps, boot_reps, boot_draws):
    out = {}
    for kind in ["iid", "ar1_0.3", "ar1_0.6", "year_effect"]:
        for beta in [0.0, 0.3, 0.6]:
            raw = hr = 0
            for _ in range(reps):
                r = trend_one(pd.Series(series(rng, kind, beta), index=INDEX))
                raw += r["p_value"] < ALPHA
                hr += r["hr_p_value"] < ALPHA
            boot = 0
            t0 = time.perf_counter()
            for _ in range(boot_reps):
                x = sh.calendar_matrix(pd.Series(series(rng, kind, beta), index=INDEX))
                b = sh.block_bootstrap(x, block_years=2, draws=boot_draws, seed=int(rng.integers(1 << 31)))
                boot += float(b["p"][0]) < ALPHA
            out[f"{kind}|beta={beta}"] = {
                "current_raw_seasonal_mk": mc(raw, reps),
                "hr_anomaly_diagnostic": mc(hr, reps),
                "shadow_year_block_bootstrap": mc(boot, boot_reps),
                "bootstrap_seconds_per_series": round((time.perf_counter() - t0) / max(boot_reps, 1), 4),
            }
    return out


# ---------------------------------------------------------------- C1: tie correction
def tied_precip(rng):
    """Precipitation-like null series: integer mm, Jan-Apr dry season with 70% exact zeros."""
    v = np.round(rng.gamma(0.8, 60.0, YEARS * 12))
    dry = np.isin(np.arange(YEARS * 12) % 12, [0, 1, 2, 3])
    v[dry & (rng.random(YEARS * 12) < 0.7)] = 0.0
    return v


def exp_c1(rng, reps):
    cur = cor = lib = 0
    ratios = []
    for _ in range(reps):
        v = tied_precip(rng)
        x = v.reshape(YEARS, 12)
        a = sh.seasonal_test(x, ties=False)   # current grid variance (no tie term)
        b = sh.seasonal_test(x, ties=True)    # C1 proposal
        c = mk.seasonal_test(v, period=12).p  # regional production library (tie-corrected)
        cur += a["p"] < ALPHA
        cor += b["p"] < ALPHA
        lib += c < ALPHA
        ratios.append(b["variance"] / a["variance"])
    # Equivalence check: the production grid_trend equals the no-tie shadow formula.
    cube = np.stack([tied_precip(rng) for _ in range(9)]).T.reshape(YEARS * 12, 3, 3)
    da = xr.DataArray(cube, dims=("time", "lat", "lon"), coords={"time": INDEX, "lat": [0.5, 1.5, 2.5], "lon": [0.5, 1.5, 2.5]})
    g = grid_trend(da)["p_value"].values.ravel()
    s = np.array([sh.seasonal_test(cube[:, k // 3, k % 3].reshape(YEARS, 12), ties=False)["p"] for k in range(9)])
    return {"type1_current_grid_no_ties": mc(cur, reps), "type1_c1_tie_corrected": mc(cor, reps),
            "type1_regional_pymannkendall": mc(lib, reps),
            "variance_ratio_corrected_over_current": {"median": round(float(np.median(ratios)), 4),
                                                       "min": round(float(np.min(ratios)), 4)},
            "grid_trend_vs_shadow_no_tie_max_abs_p_diff": float(np.max(np.abs(g - s)))}


# ---------------------------------------------------------------- C3: completeness policy
def exp_c3(rng, reps):
    patterns = {
        "mcar_20pct": lambda: rng.random(YEARS * 12) < 0.20,
        "mcar_50pct": lambda: rng.random(YEARS * 12) < 0.50,
        "only_jan_mar_observed": lambda: ~np.isin(np.arange(YEARS * 12) % 12, [0, 1, 2]),
        "first_half_years_missing_in_wet_season": lambda: (np.arange(YEARS * 12) < 144) & np.isin(np.arange(YEARS * 12) % 12, [5, 6, 7, 8, 9]),
    }
    out = {}
    for name, miss in patterns.items():
        elig = {"current_grid": 0, "current_regional": 0, "shadow_per_season": 0}
        rej = {"current_grid": 0, "current_regional": 0, "shadow_per_season": 0}
        slope_err = []
        for _ in range(reps):
            v = series(rng, "iid", 0.0)
            v[miss()] = np.nan
            x = v.reshape(YEARS, 12)
            c = sh.completeness(x)
            regional_ok = c["current_grid_eligible"] and c["valid_fraction"] >= 0.7
            p = sh.seasonal_test(x, ties=True)["p"]
            for key, ok in [("current_grid", c["current_grid_eligible"]), ("current_regional", regional_ok),
                            ("shadow_per_season", c["shadow_eligible"])]:
                if ok:
                    elig[key] += 1
                    rej[key] += p < ALPHA
            slope_err.append(sh.seasonal_test(x)["slope_per_year"] * 10)
        out[name] = {k: {"eligible": mc(elig[k], reps), "type1_among_eligible": mc(rej[k], elig[k])} for k in elig}
        out[name]["null_slope_per_decade_sd"] = round(float(np.nanstd(slope_err)), 4)
    return out


# ---------------------------------------------------------------- C4: interval coverage
def exp_c4(rng, reps, boot_reps, boot_draws):
    out = {}
    beta = 0.5
    for kind in ["iid", "ar1_0.6", "year_effect"]:
        cov = {"current_ols_anomaly": 0, "hac_newey_west_ols": 0}
        width = {"current_ols_anomaly": [], "hac_newey_west_ols": []}
        sen_in_ols = 0
        for _ in range(reps):
            v = series(rng, kind, beta)
            r = trend_one(pd.Series(v, index=INDEX))
            lo, hi = r["ols_slope_per_decade"] - r["ols_ci95_per_decade"], r["ols_slope_per_decade"] + r["ols_ci95_per_decade"]
            cov["current_ols_anomaly"] += lo <= beta <= hi
            width["current_ols_anomaly"].append(hi - lo)
            sen_in_ols += lo <= r["slope_per_decade"] <= hi
            hlo, hhi, L = hac_ols_ci(v)
            cov["hac_newey_west_ols"] += hlo <= beta <= hhi
            width["hac_newey_west_ols"].append(hhi - hlo)
        bcov, bw = 0, []
        t0 = time.perf_counter()
        for _ in range(boot_reps):
            x = sh.calendar_matrix(pd.Series(series(rng, kind, beta), index=INDEX))
            b = sh.block_bootstrap(x, block_years=2, draws=boot_draws, seed=int(rng.integers(1 << 31)))
            lo, hi = float(b["lo_per_year"][0]) * 10, float(b["hi_per_year"][0]) * 10
            bcov += lo <= beta <= hi
            bw.append(hi - lo)
        out[kind] = {
            "true_slope_per_decade": beta,
            "current_ols_anomaly": {"coverage": mc(cov["current_ols_anomaly"], reps), "mean_width": round(float(np.mean(width["current_ols_anomaly"])), 4)},
            "hac_newey_west_ols": {"coverage": mc(cov["hac_newey_west_ols"], reps), "mean_width": round(float(np.mean(width["hac_newey_west_ols"])), 4), "bandwidth_lags": L},
            "shadow_year_block_bootstrap_sen": {"coverage": mc(bcov, boot_reps), "mean_width": round(float(np.mean(bw)), 4),
                                                 "seconds_per_series": round((time.perf_counter() - t0) / boot_reps, 4)},
            "sen_point_inside_ols_interval": mc(sen_in_ols, reps),
        }
    return out


# ---------------------------------------------------------------- C5: FDR over a spatial grid
def exp_c5(rng, reps, side=15, smooth=1.5, signal_frac=0.1, beta=0.6):
    out = {}
    cells = side * side
    truth = np.zeros((side, side), bool)
    k = int(round(math.sqrt(signal_frac * cells)))
    truth[:k, :k] = True
    for temporal in ["iid", "year_effect"]:
        res = {m: {"fdp": [], "power": [], "any_false": 0} for m in ["bh_current", "by_shadow", "uncorrected"]}
        for _ in range(reps):
            field = rng.standard_normal((YEARS * 12, side, side))
            field = ndimage.gaussian_filter(field, sigma=(0, smooth, smooth), mode="wrap")
            field /= field.std(axis=(1, 2), keepdims=True)
            if temporal == "year_effect":
                u = ndimage.gaussian_filter(rng.standard_normal((YEARS, side, side)), sigma=(0, smooth, smooth), mode="wrap")
                u = u / u.std() * 0.6
                for y in range(1, YEARS):
                    u[y] = 0.5 * u[y - 1] + math.sqrt(1 - 0.25) * u[y]
                field = field + np.repeat(u, 12, axis=0)
            data = field + SEASON[:, None, None] + (beta / 10 * T_YEARS)[:, None, None] * truth[None]
            p = np.array([sh.seasonal_test(data[:, a, b].reshape(YEARS, 12))["p"] for a in range(side) for b in range(side)])
            tv = truth.ravel()
            for m, rejected in [("bh_current", bh_fdr(p) < ALPHA), ("by_shadow", sh.adjust(p, "by") < ALPHA),
                                ("uncorrected", p < ALPHA)]:
                fd = int(np.sum(rejected & ~tv))
                res[m]["fdp"].append(fd / max(int(rejected.sum()), 1))
                res[m]["power"].append(float(np.sum(rejected & tv) / tv.sum()))
                res[m]["any_false"] += fd > 0
        out[temporal] = {m: {"empirical_fdr": round(float(np.mean(v["fdp"])), 4),
                             "fdr_mcse": round(float(np.std(v["fdp"]) / math.sqrt(reps)), 4),
                             "power": round(float(np.mean(v["power"])), 4),
                             "familywise_any_false": mc(v["any_false"], reps)} for m, v in res.items()}
    out["design"] = {"cells": cells, "true_trend_cells": int(truth.sum()), "spatial_gaussian_sigma_cells": smooth,
                     "trend_per_decade_sd_units": beta, "reps": reps}
    return out


# ---------------------------------------------------------------- bounded real NASA shadow (read-only)
def nasa_shadow():
    path = ROOT / "data-pipeline" / "processed_data" / "grid" / "cube_precip.nc"
    if not path.exists():
        return {"skipped": f"{path} not found"}
    stat = path.stat()
    with xr.open_dataarray(path) as da:
        sub = da.sel(lat=slice(8, 35), lon=slice(94, 110), time=slice("2001-01", "2024-12")).load()
    g = grid_trend(sub)
    x = sub.transpose("lat", "lon", "time").values.reshape(-1, YEARS, 12).astype(float)
    cur = g["p_value"].values.ravel()
    tie = np.array([sh.seasonal_test(c, ties=True)["p"] if np.isfinite(cur[i]) else np.nan for i, c in enumerate(x)])
    finite = np.isfinite(cur)
    after = path.stat()
    return {"scope": "IMERG 1-degree cube, Mekong box 94-110E 8-35N, 2001-01..2024-12, read-only",
            "cells_tested": int(finite.sum()),
            "max_abs_p_change_c1": float(np.nanmax(np.abs(tie - cur))),
            "raw_p_significance_changes_c1": int(np.sum((tie < ALPHA) != (cur < ALPHA))),
            "subset_bh_significant_current": int(np.sum(bh_fdr(cur) < ALPHA)),
            "subset_by_significant_shadow": int(np.sum(sh.adjust(cur, "by") < ALPHA)),
            "note": "BH/BY here use only this subset as the family; production BH uses the full global grid.",
            "cube_unchanged": stat.st_size == after.st_size and stat.st_mtime == after.st_mtime}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=20261114)
    ap.add_argument("--quick", action="store_true", help="tiny budget for a smoke run")
    a = ap.parse_args()
    q = a.quick
    budget = dict(c2_reps=40 if q else 1000, c2_boot=10 if q else 300, draws=99 if q else 199,
                  c1_reps=100 if q else 4000, c3_reps=50 if q else 1000, c4_reps=40 if q else 1000,
                  c4_boot=10 if q else 300, c5_reps=5 if q else 200)
    rng = np.random.default_rng(a.seed)
    t0 = time.perf_counter()
    result = {"status": "SHADOW RESEARCH ONLY - not production results",
              "seed": a.seed, "budget": budget, "alpha": ALPHA, "years": YEARS,
              "versions": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__,
                           "pandas": pd.__version__, "xarray": xr.__version__, "pymannkendall": mk.__version__}}
    timings = {}
    for name, fn in [("C1_tie_correction", lambda: exp_c1(rng, budget["c1_reps"])),
                     ("C2_regional_verdict", lambda: exp_c2(rng, budget["c2_reps"], budget["c2_boot"], budget["draws"])),
                     ("C3_completeness", lambda: exp_c3(rng, budget["c3_reps"])),
                     ("C4_intervals", lambda: exp_c4(rng, budget["c4_reps"], budget["c4_boot"], budget["draws"])),
                     ("C5_fdr", lambda: exp_c5(rng, budget["c5_reps"])),
                     ("NASA_bounded_shadow", nasa_shadow)]:
        s = time.perf_counter()
        result[name] = fn()
        timings[name] = round(time.perf_counter() - s, 1)
        print(name, timings[name], "s", flush=True)
    result["seconds"] = timings
    result["total_seconds"] = round(time.perf_counter() - t0, 1)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2, default=lambda o: o.item() if hasattr(o, "item") else str(o)))
    print("wrote", out, result["total_seconds"], "s")


if __name__ == "__main__":
    main()
