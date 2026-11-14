"""Independent test oracle for Terra-scope AI (test-only code; never imported by the application).

Independence statement
- Reads the processed NetCDF cubes directly with xarray and rebuilds regional monthly series from the documented
  rule (cos-latitude weighted mean of the grid cells whose centres lie inside the W, S, E, N box, boundaries
  inclusive, NaN cells skipped) with boolean masks written here, not with the pipeline's `region_series`.
- Re-implements the statistics from their published formulas with numpy and the Python standard library:
  Mann-Kendall S and its tie-corrected variance (Kendall 1975), the seasonal test as the sum over calendar seasons
  (Hirsch et al. 1982), the continuity-corrected Z, a two-sided normal p-value via math.erfc, the seasonal Sen
  slope (Sen 1968; median of within-season pairwise slopes), ordinary least squares on anomalies, the
  Benjamini-Hochberg step-up q-values (1995) and the Hamed-Rao (1998) variance correction.
- Shared dependencies (documented): numpy, xarray/netCDF4 for reading, scipy.stats.t.ppf for the Student-t
  quantile only. pymannkendall and the pipeline package are NOT used.
- Where the production code makes an implementation choice (seasons are positions of a period of 12 starting at
  the first month; Hamed-Rao uses ranks of the Sen-detrended series, lags whose autocorrelation lies outside
  +/-z(1-alpha/2)/sqrt(n), and the biased autocovariance), the oracle follows the published method in the same
  variant and says so; disagreement about the variant itself is reported as a methodology finding, not a defect.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

GRID_DIR = Path(__file__).resolve().parents[1] / "data-pipeline" / "data" / "processed" / "grid"
PRODUCT = {  # API variable id -> processed 0.5 degree NetCDF product (preprocess/clean.py)
    "imerg_precip": "precip_imerg", "gldas_soil_moisture_0_10cm": "sm_0_10cm_gldas",
    "gldas_air_temperature": "tair_gldas", "gldas_evapotranspiration": "evap_gldas",
    "merra2_air_temperature_2m": "t2m_merra2",
}
_CUBES: dict[str, xr.DataArray] = {}


def cube(variable_id: str) -> xr.DataArray:
    if variable_id not in _CUBES:
        path = GRID_DIR / f"{PRODUCT[variable_id]}.nc"
        with xr.open_dataset(path) as ds:
            _CUBES[variable_id] = ds[PRODUCT[variable_id]].load()
    return _CUBES[variable_id]


def norm_sf2(z: float) -> float:
    """Two-sided normal p-value 2*(1 - Phi(|z|)) = erfc(|z|/sqrt 2)."""
    return math.erfc(abs(z) / math.sqrt(2.0))


# ------------------------------------------------------------------------------------------------ region series
@dataclass
class RegionSeries:
    values: pd.Series          # monthly area mean (NaN where no cell has data)
    valid_fraction: pd.Series  # share of in-box cells with data, per month
    n_cells: int


def region_series(variable_id: str, bbox, start: str, end: str) -> RegionSeries:
    w, s, e, n = bbox
    da = cube(variable_id)
    lat, lon = da["lat"].values.astype("float64"), da["lon"].values.astype("float64")
    li = np.where((lat >= s) & (lat <= n))[0]
    lj = np.where((lon >= w) & (lon <= e))[0]
    if len(li) == 0 or len(lj) == 0:
        raise ValueError("no cell centre inside the box")
    t = pd.DatetimeIndex(da["time"].values)
    want = pd.date_range(f"{start}-01", f"{end}-01", freq="MS")
    ti = np.array([t.get_loc(x) if x in t else -1 for x in want])
    block = da.values[:, li[0]:li[-1] + 1, lj[0]:lj[-1] + 1].astype("float64")   # (time, lat, lon), contiguous ranges
    wlat = np.cos(np.deg2rad(lat[li]))[:, None] * np.ones((1, len(lj)))
    vals, frac = [], []
    for k in ti:
        if k < 0:
            vals.append(np.nan); frac.append(0.0); continue
        x = block[k]
        ok = np.isfinite(x)
        frac.append(ok.sum() / ok.size)
        vals.append(float((x[ok] * wlat[ok]).sum() / wlat[ok].sum()) if ok.any() else np.nan)
    return RegionSeries(pd.Series(vals, index=want), pd.Series(frac, index=want), int(len(li) * len(lj)))


def anomaly(s: pd.Series) -> pd.Series:
    clim = {m: s[s.index.month == m].mean() for m in range(1, 13)}
    return pd.Series([v - clim[d.month] for d, v in zip(s.index, s.values)], index=s.index)


# ------------------------------------------------------------------------------------------------ statistics
def mk_s(x: np.ndarray) -> int:
    """Mann-Kendall S over a 1-D array without NaN: sum_{i<j} sign(x_j - x_i)."""
    d = x[None, :] - x[:, None]
    return int(np.sign(d[np.triu_indices(len(x), 1)]).sum())


def mk_var(x: np.ndarray) -> float:
    """Variance of S with the tie correction: [n(n-1)(2n+5) - sum t(t-1)(2t+5)] / 18."""
    n = len(x)
    _, t = np.unique(x, return_counts=True)
    return (n * (n - 1) * (2 * n + 5) - float((t * (t - 1) * (2 * t + 5)).sum())) / 18.0


def z_cc(s: float, var: float) -> float:
    if var <= 0:
        return 0.0
    return (s - 1) / math.sqrt(var) if s > 0 else (s + 1) / math.sqrt(var) if s < 0 else 0.0


def seasonal_mk(values: np.ndarray, period: int = 12, tie_correction: bool = True) -> dict:
    """Seasons = positions modulo `period` from the first value (the series is padded with NaN to whole periods)."""
    v = np.asarray(values, dtype="float64")
    if len(v) % period:
        v = np.concatenate([v, np.full(period - len(v) % period, np.nan)])
    m = v.reshape(-1, period)
    s_tot, var_tot = 0, 0.0
    for k in range(period):
        x = m[:, k][np.isfinite(m[:, k])]
        if len(x) < 2:
            continue
        s_tot += mk_s(x)
        var_tot += mk_var(x) if tie_correction else len(x) * (len(x) - 1) * (2 * len(x) + 5) / 18.0
    z = z_cc(s_tot, var_tot)
    return {"S": s_tot, "var_S": var_tot, "z": z, "p": norm_sf2(z)}


def seasonal_sen(values: np.ndarray, period: int = 12) -> float:
    """Median over all seasons of (x_j - x_i)/(j - i) for year positions i < j with both values present (per year)."""
    v = np.asarray(values, dtype="float64")
    if len(v) % period:
        v = np.concatenate([v, np.full(period - len(v) % period, np.nan)])
    m = v.reshape(-1, period)
    slopes = []
    for k in range(period):
        col = m[:, k]
        idx = np.where(np.isfinite(col))[0]
        for a in range(len(idx)):
            for b in range(a + 1, len(idx)):
                i, j = idx[a], idx[b]
                slopes.append((col[j] - col[i]) / (j - i))
    return float(np.median(slopes)) if slopes else float("nan")


def sen_slope(x: np.ndarray) -> float:
    """Ordinary Sen slope per time step over a 1-D array (NaN pairs ignored)."""
    idx = np.where(np.isfinite(x))[0]
    sl = [(x[j] - x[i]) / (j - i) for a, i in enumerate(idx) for j in idx[a + 1:]]
    return float(np.median(sl)) if sl else float("nan")


def ranks(x: np.ndarray) -> np.ndarray:
    """Average ranks (1-based), ties share the mean rank."""
    order = np.argsort(x, kind="mergesort")
    r = np.empty(len(x))
    xs = x[order]
    i = 0
    while i < len(x):
        j = i
        while j + 1 < len(x) and xs[j + 1] == xs[i]:
            j += 1
        r[order[i:j + 1]] = (i + j) / 2 + 1
        i = j + 1
    return r


def hamed_rao(values: np.ndarray, alpha: float = 0.05) -> dict:
    """Hamed and Rao (1998) MK with autocorrelation-corrected variance on a 1-D series (NaN removed for S)."""
    x_old = np.asarray(values, dtype="float64")
    x = x_old[np.isfinite(x_old)]
    n = len(x)
    s = mk_s(x)
    var = mk_var(x)
    slope = sen_slope(x_old)
    xd = x - np.arange(1, n + 1) * slope
    r = ranks(xd)
    y = r - r.mean()
    acov = np.array([(y[:n - k] * y[k:]).sum() / n for k in range(n)])
    acf = acov / acov[0]
    bound = 1.959963984540054 / math.sqrt(n) if abs(alpha - 0.05) < 1e-12 else _norm_ppf(1 - alpha / 2) / math.sqrt(n)
    sni = sum((n - i) * (n - i - 1) * (n - i - 2) * acf[i] for i in range(1, n) if not (-bound <= acf[i] <= bound))
    n_ns = 1 + (2 / (n * (n - 1) * (n - 2))) * sni
    var_c = var * n_ns
    z = z_cc(s, var_c)
    return {"S": s, "var_S": var_c, "z": z, "p": norm_sf2(z), "slope_per_step": slope}


def _norm_ppf(q: float) -> float:
    lo, hi = -10.0, 10.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if 0.5 * math.erfc(-mid / math.sqrt(2)) < q:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def ols_anomaly(series: pd.Series) -> dict:
    """OLS of monthly anomalies on time in years since the first month (days/365.25); 95% t interval, per decade."""
    from scipy.stats import t as student_t   # documented shared dependency: Student-t quantile only
    a = anomaly(series)
    yrs = np.asarray((series.index - series.index[0]).days / 365.25, dtype="float64")
    ok = np.isfinite(a.values)
    X, Y = yrs[ok], a.values[ok]
    n = len(X)
    xm, ym = X.mean(), Y.mean()
    sxx = ((X - xm) ** 2).sum()
    b = ((X - xm) * (Y - ym)).sum() / sxx
    resid = Y - (ym + b * (X - xm))
    se = math.sqrt((resid ** 2).sum() / (n - 2) / sxx)
    half = student_t.ppf(0.975, n - 2) * se
    return {"slope_per_decade": b * 10, "ci95": ((b - half) * 10, (b + half) * 10), "n": n}


def bh_qvalues(p: np.ndarray) -> np.ndarray:
    """Benjamini-Hochberg q-values over all finite entries (step-up, monotone, capped at 1)."""
    p = np.asarray(p, dtype="float64")
    q = np.full(p.shape, np.nan)
    ok = np.where(np.isfinite(p))[0]
    m = len(ok)
    if m == 0:
        return q
    order = ok[np.argsort(p[ok], kind="mergesort")]
    prev = 1.0
    for rank in range(m, 0, -1):
        i = order[rank - 1]
        prev = min(prev, p[i] * m / rank)
        q[i] = prev
    return q


def sufficient(series: pd.Series) -> bool:
    present = series.dropna()
    return present.index.year.nunique() >= 10 and series.notna().mean() >= 0.7


def regional_expected(variable_id: str, bbox, start: str, end: str, alpha: float = 0.05) -> dict:
    """Everything the API should report for one regional trend, computed independently."""
    rs = region_series(variable_id, bbox, start, end)
    v = rs.values
    out = {"n_months": int(v.notna().sum()), "missing_months": int(v.isna().sum()),
           "coverage_fraction": float(rs.valid_fraction.mean()), "n_cells_in_box": rs.n_cells,
           "first": (v.index[0].strftime("%Y-%m"), None if np.isnan(v.iloc[0]) else float(v.iloc[0])),
           "last": (v.index[-1].strftime("%Y-%m"), None if np.isnan(v.iloc[-1]) else float(v.iloc[-1])),
           "series": v, "valid_fraction": rs.valid_fraction}
    if v.notna().sum() == 0:
        out["no_data"] = True
        return out
    out["sufficient"] = sufficient(v)
    smk = seasonal_mk(v.values)
    out["slope_per_decade"] = seasonal_sen(v.values) * 10
    out["S"], out["var_S"], out["z"] = smk["S"], smk["var_S"], smk["z"]
    out["p_value"] = smk["p"] if out["sufficient"] else None
    out["significant"] = None if out["p_value"] is None else bool(out["p_value"] < alpha)
    if out["sufficient"]:
        hr = hamed_rao(anomaly(v).values)
        out["p_value_hr"] = hr["p"]
        ols = ols_anomaly(v)
        out["ols_slope_per_decade"], out["ols_ci95"] = ols["slope_per_decade"], ols["ci95"]
    return out
