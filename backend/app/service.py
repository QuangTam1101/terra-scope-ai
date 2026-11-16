"""Lớp chuyển đổi: kiểm tra request → gọi pipeline (qua bridge) → đổi kết quả sang schema contract v0.2.

Không có phép kiểm định nào được viết ở đây; các con số đều lấy từ `trend_one`, `grid_trend`,
`pair_difference_test` của pipeline. Phần này chỉ: chọn vùng, cắt thời gian, đặt tên trường, viết câu tóm tắt.
"""
import hashlib
import json
import math
import re

import numpy as np
import pandas as pd

from . import bridge, catalog, config
from .errors import ApiError
from .schemas import CompareRequest, ExplainRequest, SeriesRequest, TrendRequest

# Kết quả /trends và /compare giữ trong bộ nhớ để /explain (và sau này /reports) dùng lại qua trend_id.
# Mất khi khởi động lại server: chấp nhận được cho bản demo.
_STORE: dict[str, dict] = {}


# ---------------------------------------------------------------- tiện ích
def _num(x, nd: int | None = None):
    """numpy/NaN → float/None để JSON sạch (contract: số thiếu = null)."""
    if x is None:
        return None
    x = float(x)
    if not math.isfinite(x):
        return None
    return round(x, nd) if nd is not None else x


def _make_id(prefix: str, payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str)
    return f"{prefix}_{hashlib.sha1(raw.encode()).hexdigest()[:10]}"


def _fmt_p(p: float) -> str:
    return "p < 0.001" if p < 0.001 else f"p = {p:.3f}"


def _fmt(x: float) -> str:
    return f"{x:.3g}" if abs(x) < 1000 else f"{x:,.0f}"


def get_variable(variable_id: str) -> catalog.Variable:
    v = catalog.VARIABLES.get(variable_id)
    if v is None:
        raise ApiError(404, "NOT_FOUND", f"Unknown variable_id '{variable_id}'.",
                       {"variable_id": variable_id, "known": list(catalog.VARIABLES)})
    return v


# ---------------------------------------------------------------- vùng
def _flatten_positions(coords, out):
    if isinstance(coords, (list, tuple)):
        if len(coords) >= 2 and all(isinstance(c, (int, float)) for c in coords[:2]):
            out.append((float(coords[0]), float(coords[1])))
        else:
            for c in coords:
                _flatten_positions(c, out)
    return out


def _geometry_to_bbox(geom: dict) -> tuple[tuple, str]:
    gtype = str(geom.get("type", "")).lower()
    if gtype == "feature":
        return _geometry_to_bbox(geom.get("geometry") or {})
    if gtype == "featurecollection":
        pts = []
        for f in geom.get("features", []):
            _flatten_positions((f.get("geometry") or {}).get("coordinates"), pts)
    elif gtype == "point":
        pts = _flatten_positions(geom.get("coordinates"), [])
        if not pts:
            raise ApiError(422, "VALIDATION_ERROR", "Point geometry has no coordinates.")
        lon, lat = pts[0]
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            # Checked before snapping to a cell: clamping would silently turn lat 106.7 into the 89-90° cell.
            raise ApiError(422, "VALIDATION_ERROR",
                           "Point coordinates must be [longitude, latitude] with longitude in ±180 and latitude in ±90.",
                           {"coordinates": [lon, lat]})
        w = min(math.floor(lon), 179)
        s = min(math.floor(lat), 89)
        return (float(w), float(s), float(w + 1), float(s + 1)), \
            "A single point was converted to the grid cell that contains it."
    elif gtype in {"polygon", "multipolygon", "linestring", "multilinestring", "multipoint", "bbox"}:
        pts = _flatten_positions(geom.get("coordinates") or geom.get("bounds"), [])
    else:
        raise ApiError(422, "VALIDATION_ERROR", f"Unsupported geometry type '{geom.get('type')}'.",
                       {"supported": ["Point", "Polygon", "MultiPolygon"]})
    if not pts:
        raise ApiError(422, "VALIDATION_ERROR", "Geometry has no coordinates.")
    lons, lats = [p[0] for p in pts], [p[1] for p in pts]
    return (min(lons), min(lats), max(lons), max(lats)), \
        "The drawn shape is analysed using its bounding box (exact polygons are not supported yet)."


def _check_bbox(bbox: tuple) -> None:
    w, s, e, n = bbox
    if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
        raise ApiError(422, "VALIDATION_ERROR",
                       "bbox must be [west, south, east, north] with west < east, south < north, inside ±180/±90.",
                       {"bbox": list(bbox)})
    area = (e - w) * (n - s)
    if area > config.MAX_BBOX_AREA_DEG2:
        raise ApiError(400, "REGION_TOO_LARGE",
                       f"Region area is {area:.0f} deg²; the limit is {config.MAX_BBOX_AREA_DEG2:.0f} deg².",
                       {"area_deg2": area, "max_bbox_area_deg2": config.MAX_BBOX_AREA_DEG2})


def resolve_region(ref) -> tuple[dict, tuple, list[str]]:
    """RegionRef → (region trả về cho frontend, bbox, warnings)."""
    warnings: list[str] = []
    if ref.type == "preset":
        r = catalog.REGIONS.get(ref.id)
        if r is None:
            raise ApiError(404, "NOT_FOUND", f"Unknown region id '{ref.id}'.",
                           {"region_id": ref.id, "known": list(catalog.REGIONS)})
        bbox, out = r.bbox, {"type": "preset", "id": r.id, "name": r.name}
    elif ref.type == "bbox":
        bbox, out = tuple(ref.bbox), {"type": "bbox", "name": ref.name}
    elif ref.type == "country":
        c = catalog.COUNTRIES.get(ref.id)
        if c is None:
            raise ApiError(404, "NOT_FOUND", f"Unknown country '{ref.id}'.", {"country": ref.id})
        bbox, out = c.bbox, {"type": "country", "id": c.name, "name": c.name}
    else:
        bbox, w = _geometry_to_bbox(ref.geometry)
        warnings.append(w)
        out = {"type": "geojson", "name": ref.name or ref.geometry.get("label")}
    _check_bbox(bbox)
    out["bbox"] = list(bbox)
    return out, bbox, warnings


def _region_label(region: dict) -> str:
    if region.get("name"):
        return region["name"]
    w, s, e, n = region["bbox"]
    return f"the area {s:.1f}–{n:.1f}°N, {w:.1f}–{e:.1f}°E"


# ---------------------------------------------------------------- thời gian & dữ liệu
def _check_time(v: catalog.Variable, start: str, end: str) -> None:
    if start > end:
        raise ApiError(400, "INVALID_TIME_RANGE", "start must not be after end.", {"start": start, "end": end})
    cov = bridge.coverage(v.pipeline_id)
    if cov is None:
        raise ApiError(503, "DATA_NOT_READY", f"Data for '{v.id}' is not available on the server yet.",
                       {"variable_id": v.id})
    if start < cov[0] or end > cov[1]:
        raise ApiError(400, "INVALID_TIME_RANGE",
                       f"Requested {start}…{end} is outside the available data {cov[0]}…{cov[1]}.",
                       {"coverage": {"start": cov[0], "end": cov[1]}})


def _country_of(region: dict) -> str | None:
    return region.get("id") if region.get("type") == "country" else None


def _region_values(v: catalog.Variable, bbox: tuple, start: str, end: str,
                   country: str | None = None) -> tuple[pd.Series, pd.Series, list]:
    """Chuỗi tháng của vùng. `country`: chỉ các ô có tâm trong đường viền quốc gia (catalog.COUNTRIES)."""
    cube = bridge.load_cube(v.pipeline_id)
    m = bridge.meta(v.pipeline_id)
    w, s, e, n = bbox
    ew, es, ee, en = m["extent"]
    if e <= ew or w >= ee or n <= es or s >= en:
        raise ApiError(404, "NO_DATA", f"This region is outside the area covered by the {v.name.lower()} data.",
                       {"bbox": list(bbox), "data_extent": list(m["extent"])})
    lat, lon = cube["lat"].values, cube["lon"].values
    extra, rings = [], None
    if country:
        c = catalog.COUNTRIES[country]
        lat_in, lon_in = lat[(lat >= s) & (lat <= n)], lon[(lon >= w) & (lon <= e)]
        if len(lat_in) and len(lon_in) and bridge.shape_mask(lat_in, lon_in, c.rings).any():
            rings = c.rings
        else:                         # nước nhỏ hơn một ô: dùng ô gần tâm khung bao nhất, và nói rõ
            cs = m["cell_size_deg"]
            la, lo = lat[np.abs(lat - (s + n) / 2).argmin()], lon[np.abs(lon - (w + e) / 2).argmin()]
            bbox = w, s, e, n = (lo - cs / 2, la - cs / 2, lo + cs / 2, la + cs / 2)
            extra.append(f"{c.name} is smaller than one {cs:g}° data square, so the square nearest its centre is used.")
    if not (((lat >= s) & (lat <= n)).any() and ((lon >= w) & (lon <= e)).any()):
        raise ApiError(400, "REGION_TOO_SMALL",
                       f"Region does not contain the centre of any {m['cell_size_deg']:g}° grid cell. "
                       "Draw a larger area.", {"bbox": list(bbox), "cell_size_deg": m["cell_size_deg"]})
    if w < ew or s < es or e > ee or n > en:
        extra.append("Part of this region is outside the data area; only the covered part is analysed.")
    try:
        value, frac = bridge.region_series(cube, bbox, rings)
    except AssertionError:
        raise ApiError(404, "NO_DATA", "The data grid has no cells inside this region.", {"bbox": list(bbox)})
    idx = pd.date_range(f"{start}-01", f"{end}-01", freq="MS")
    value, frac = value.reindex(idx), frac.reindex(idx).fillna(0.0)
    if value.notna().sum() == 0:
        raise ApiError(404, "NO_DATA",
                       f"No {v.name.lower()} data in this region for the chosen period "
                       "(for example, an ocean area with a land-only variable).", {"bbox": list(bbox)})
    return value, frac, extra


def _quality(value: pd.Series, frac: pd.Series, insufficient: bool) -> dict:
    n = int(value.notna().sum())
    return {"n_months": n, "missing_months": int(len(value) - n),
            "coverage_fraction": round(float(frac.mean()), 3), "sufficient": not insufficient}


def _annual(v: catalog.Variable) -> bool:
    """Chuỗi đếm sự kiện theo mùa: độ dốc Sen trên trung bình năm (pipeline.api.ANNUAL_SLOPE)."""
    return v.pipeline_id in bridge.papi.ANNUAL_SLOPE


def _insufficient(value: pd.Series) -> bool:
    """Cùng ngưỡng với pipeline.trends.trend_one (min_years=10, min_frac=0.7)."""
    return value.dropna().index.year.nunique() < 10 or value.notna().mean() < 0.7


def _quality_warnings(v: catalog.Variable, q: dict) -> list[str]:
    w = []
    if not q["sufficient"]:
        w.append("Not enough data to test significance: at least 10 years and 70% of months with data are needed.")
    if q["coverage_fraction"] < 0.5:
        w.append(f"On average only {q['coverage_fraction']:.0%} of the grid cells in this region have data "
                 "(for example, ocean cells for a land variable).")
    if v.note:
        w.append(v.note)
    return w


# ---------------------------------------------------------------- /series
def series(req: SeriesRequest) -> dict:
    v = get_variable(req.variable_id)
    region, bbox, warnings = resolve_region(req.region)
    _check_time(v, req.start, req.end)
    value, frac, extra = _region_values(v, bbox, req.start, req.end, _country_of(region))
    warnings = warnings + extra
    anom = bridge.anomaly(value)
    clim = value.groupby(value.index.month).mean().reindex(range(1, 13))
    q = _quality(value, frac, _insufficient(value))
    return {
        "variable_id": v.id, "region": region, "units": v.units,
        "points": [{"t": t.strftime("%Y-%m"), "value": _num(val, 6), "anomaly": _num(a, 6),
                    "valid_fraction": round(float(f), 3)}
                   for t, val, a, f in zip(value.index, value.values, anom.values, frac.values)],
        "climatology": [_num(c, 6) for c in clim.values],
        "quality": q, "source": v.source, "warnings": warnings + _quality_warnings(v, q),
    }


# ---------------------------------------------------------------- /trends
def _rate_units(u: str) -> tuple[int, str]:
    """Đếm sự kiện / tháng → tốc độ đổi theo năm (×12, đúng vì độ dốc tính trên TB năm); khớp web/src/units.ts PER_YEAR."""
    return (12, u.replace("/month", " a year")) if u in ("storms/month", "fires/month") else (1, u)


def _trend_summary(v, region, start, end, slope, p, significant, sufficient) -> str:
    where, period = _region_label(region), f"{start[:4]}–{end[:4]}"
    if slope is None:
        return f"No trend could be estimated for {v.name.lower()} in {where} ({period})."
    change = "increased" if slope > 0 else "decreased" if slope < 0 else "did not change"
    k, u = _rate_units(v.display_units)
    s1 = f"{v.name} in {where} {change} by about {_fmt(abs(slope) * k)} {u} per decade ({period})."
    if not sufficient or p is None:
        return s1 + " There is not enough data to test whether this trend is statistically significant."
    if significant:
        return s1 + f" This trend is statistically significant ({_fmt_p(p)})."
    return s1 + (f" This trend is not statistically significant ({_fmt_p(p)}): it may be natural variability, "
                 "and a longer record could help.")


def _compute_trend(v, region, bbox, start, end, alpha, warnings) -> tuple[dict, pd.Series]:
    value, frac, extra = _region_values(v, bbox, start, end, _country_of(region))
    warnings = warnings + extra
    try:
        tr = bridge.trend_one(value, annual=_annual(v))
    except Exception:                       # chuỗi quá ngắn để pymannkendall chạy
        tr = None
    insufficient = tr is None or bool(tr["insufficient_data"]) or _insufficient(value)
    q = _quality(value, frac, insufficient)
    slope = _num(tr["slope_per_decade"]) if tr else None
    p = None if insufficient else _num(tr["p_value"])
    significant = None if p is None else bool(p < alpha)
    direction = ("increasing" if slope > 0 else "decreasing") if significant and slope else "no_trend"

    slope_ci = None
    if not insufficient and tr:
        ols, half = _num(tr["ols_slope_per_decade"]), _num(tr["ols_ci95_per_decade"])
        if ols is not None and half is not None:
            slope_ci = (ols - half, ols + half)

    trend_line = []
    if slope is not None:
        k = np.arange(len(value))
        per_month = slope / 120
        ok = value.notna().to_numpy()
        b = float(np.nanmedian(value.to_numpy()[ok] - per_month * k[ok]))
        trend_line = [{"t": value.index[0].strftime("%Y-%m"), "value": b},
                      {"t": value.index[-1].strftime("%Y-%m"), "value": b + per_month * (len(value) - 1)}]

    key = {"v": v.id, "bbox": bbox, "start": start, "end": end, "alpha": alpha}
    if _country_of(region):                 # cùng khung bao nhưng khác vùng: id phải khác
        key["country"] = _country_of(region)
    trend_id = _make_id("tr", key)
    res = {
        "trend_id": trend_id, "variable_id": v.id, "region": region, "start": start, "end": end,
        "units": v.units, "method": "seasonal_mk", "slope_method": "sen_annual" if _annual(v) else "sen_seasonal",
        "slope_per_decade": slope, "slope_ci": slope_ci, "ci_method": "ols_anomaly", "ci_level": 0.95,
        "p_value": p, "p_value_autocorr_adjusted": None if insufficient else _num(tr["hr_p_value"]),
        "z": _num(tr["z"]) if tr else None, "tau": None, "alpha": alpha,
        "significant": significant, "direction": direction, "n": q["n_months"],
        "autocorrelation_adjusted": False, "trend_line": trend_line, "quality": q,
        "plain_summary": _trend_summary(v, region, start, end, slope, p, significant, not insufficient),
        "source": v.source, "warnings": warnings + _quality_warnings(v, q),
    }
    _STORE[trend_id] = res
    return res, value


def trends(req: TrendRequest) -> dict:
    v = get_variable(req.variable_id)
    region, bbox, warnings = resolve_region(req.region)
    _check_time(v, req.start, req.end)
    return _compute_trend(v, region, bbox, req.start, req.end, req.alpha, warnings)[0]


def stored_trend(trend_id: str) -> dict | None:
    """Read an existing analysis for chat; never create an ID without a computed result."""
    result = _STORE.get(trend_id)
    return result if result is not None and "slope_per_decade" in result else None


# ---------------------------------------------------------------- /trends/grid
def _parse_bbox(text: str | None) -> tuple | None:
    if not text:
        return None
    try:
        parts = tuple(float(x) for x in text.split(","))
    except ValueError:
        parts = ()
    if len(parts) != 4:
        raise ApiError(422, "VALIDATION_ERROR", "bbox must be 'west,south,east,north'.", {"bbox": text})
    w, s, e, n = parts
    if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
        raise ApiError(422, "VALIDATION_ERROR", "bbox must have west < east and south < north.", {"bbox": text})
    return parts


def trend_grid(variable_id: str, start: str, end: str, bbox_text: str | None, alpha: float) -> dict:
    v = get_variable(variable_id)
    for m in (start, end):
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", m):
            raise ApiError(422, "VALIDATION_ERROR", "start and end must be 'YYYY-MM'.", {"value": m})
    bbox = _parse_bbox(bbox_text)
    warnings = []
    # grid_trend của pipeline cần trọn năm (tháng 1 → tháng 12): thu khoảng thời gian vào trong.
    s2 = start if start.endswith("-01") else f"{int(start[:4]) + 1}-01"
    e2 = end if end.endswith("-12") else f"{int(end[:4]) - 1}-12"
    if (s2, e2) != (start, end):
        warnings.append(f"The map uses whole calendar years: {s2} to {e2}.")
    _check_time(v, s2, e2)
    ds = bridge.grid_result(v.pipeline_id, s2, e2)
    if bbox:
        w, s, e, n = bbox
        ds = ds.sel(lat=slice(s, n), lon=slice(w, e))
    df = ds[["slope_per_decade", "p_value", "p_value_fdr"]].to_dataframe().reset_index()
    if not bbox:
        df = df[np.isfinite(df["slope_per_decade"])]
        warnings.append("No bbox given: returning every grid cell that has data (cells with no data are omitted).")

    cells, valid_slopes = [], []
    for lat, lon, slope, p, q in df[["lat", "lon", "slope_per_decade", "p_value", "p_value_fdr"]].itertuples(index=False):
        valid = bool(np.isfinite(p) and np.isfinite(slope))
        if valid:
            valid_slopes.append(slope)
        cells.append({"lon": round(float(lon), 4), "lat": round(float(lat), 4),
                      "slope_per_decade": _num(slope, 6) if valid else None,
                      "p_value": _num(p, 6) if valid else None, "q_value": _num(q, 6) if valid else None,
                      "significant_fdr": bool(q < alpha) if valid and np.isfinite(q) else None,
                      "valid": valid})
    if v.note:
        warnings.append(v.note)
    return {
        "variable_id": v.id, "units": v.units, "start": s2, "end": e2,
        "cell_size_deg": bridge.meta(v.pipeline_id)["cell_size_deg"], "fdr_method": "benjamini_hochberg",
        "alpha": alpha,
        "value_range": {"min_slope": float(min(valid_slopes, default=0.0)),
                        "max_slope": float(max(valid_slopes, default=0.0))},
        "cells": cells, "precomputed": True, "warnings": warnings,
    }


# ---------------------------------------------------------------- /values/grid (heatmap giá trị)
def value_grid(variable_id: str, start: str, end: str, bbox_text: str | None, month: int | None) -> dict:
    """Heatmap giá trị: trung bình mỗi ô trong khoảng thời gian (tuỳ chọn chỉ một tháng trong năm).
    Chỉ là phép lấy trung bình để vẽ bản đồ, không phải kiểm định."""
    v = get_variable(variable_id)
    for mth in (start, end):
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", mth):
            raise ApiError(422, "VALIDATION_ERROR", "start and end must be 'YYYY-MM'.", {"value": mth})
    if month is not None and not 1 <= month <= 12:
        raise ApiError(422, "VALIDATION_ERROR", "month must be 1–12.", {"month": month})
    bbox = _parse_bbox(bbox_text)
    _check_time(v, start, end)
    cube = bridge.load_cube(v.pipeline_id).sel(time=slice(start, end))
    if month is not None:
        cube = cube.where(cube["time"].dt.month == month, drop=True)
    if bbox:
        w, s, e, n = bbox
        cube = cube.sel(lat=slice(s, n), lon=slice(w, e))
    mean = cube.mean("time", skipna=True)
    frac = cube.notnull().mean("time")
    df = pd.DataFrame({"value": mean.values.ravel(), "frac": frac.values.ravel()},
                      index=pd.MultiIndex.from_product([mean["lat"].values, mean["lon"].values], names=["lat", "lon"])
                      ).reset_index()
    warnings = []
    if not bbox:
        df = df[np.isfinite(df["value"])]
        warnings.append("No bbox given: returning every grid cell that has data (cells with no data are omitted).")
    vals = df["value"].to_numpy()
    ok = vals[np.isfinite(vals)]
    if v.note:
        warnings.append(v.note)
    return {
        "variable_id": v.id, "units": v.units, "start": start, "end": end, "stat": "mean", "month": month,
        "cell_size_deg": bridge.meta(v.pipeline_id)["cell_size_deg"],
        "value_range": {"min": float(ok.min()) if ok.size else 0.0, "max": float(ok.max()) if ok.size else 0.0,
                        "p02": float(np.percentile(ok, 2)) if ok.size else 0.0,
                        "p98": float(np.percentile(ok, 98)) if ok.size else 0.0},
        "cells": [{"lon": round(float(lo), 4), "lat": round(float(la), 4), "value": _num(val, 6),
                   "valid_fraction": round(float(fr), 3)}
                  for la, lo, val, fr in df[["lat", "lon", "value", "frac"]].itertuples(index=False)],
        "warnings": warnings,
    }


# ---------------------------------------------------------------- /compare
def compare(req: CompareRequest) -> dict:
    v = get_variable(req.variable_id)
    ra, ba, wa = resolve_region(req.region_a)
    rb, bb, wb = resolve_region(req.region_b)
    _check_time(v, req.start, req.end)
    a, va = _compute_trend(v, ra, ba, req.start, req.end, req.alpha, wa)
    b, vb = _compute_trend(v, rb, bb, req.start, req.end, req.alpha, wb)
    test = "mk_sen_on_anomaly_difference_block_bootstrap_ci"

    if not (a["quality"]["sufficient"] and b["quality"]["sufficient"]):
        diff = {"slope_diff_per_decade": None, "ci": None, "p_value": None, "significant": False,
                "stable_halves": None, "test": test}
        verdict = "insufficient_data"
    else:
        d = bridge.pair_difference_test(va, vb)
        lo, hi, p = _num(d["ci95_low"]), _num(d["ci95_high"]), _num(d["p_diff"])
        sig = p is not None and lo is not None and hi is not None and p < req.alpha and (lo > 0 or hi < 0)
        diff = {"slope_diff_per_decade": _num(d["slope_diff_per_decade"]),
                "ci": (lo, hi) if lo is not None and hi is not None else None,
                "p_value": p, "significant": bool(sig), "stable_halves": bool(d["stable_halves"]), "test": test}
        sa, sb = a["slope_per_decade"] or 0.0, b["slope_per_decade"] or 0.0
        opposite = sa * sb < 0
        verdict = ("opposite_significant" if opposite and sig else
                   "opposite_not_significant" if opposite else "same_direction")

    na, nb, name = _region_label(ra), _region_label(rb), v.name.lower()
    summary = {
        "opposite_significant": f"{v.name} is changing in opposite directions in {na} and {nb}, "
                                "and the difference between the two trends is statistically significant.",
        "opposite_not_significant": f"The {name} trends in {na} and {nb} point in opposite directions, "
                                    "but the difference is not statistically significant.",
        "same_direction": f"{v.name} is changing in the same direction in {na} and {nb}"
                          + (" and the two rates differ significantly." if diff["significant"] else "."),
        "insufficient_data": f"There is not enough data in at least one region to compare the {name} trends.",
    }[verdict]
    compare_id = _make_id("cp", {"a": a["trend_id"], "b": b["trend_id"]})
    res = {"compare_id": compare_id, "a": a, "b": b, "difference": diff,
           "is_contradiction": verdict == "opposite_significant", "verdict": verdict,
           "plain_summary": summary, "warnings": sorted(set(a["warnings"] + b["warnings"]))}
    _STORE[compare_id] = res
    return res


# ---------------------------------------------------------------- /explain (bản template, chưa có LLM)
EXPLAIN_MODEL = "template-v1 (no language model)"
EXPLAIN_DISCLAIMER = ("Generated automatically from the statistics above by a fixed template, not by a language "
                      "model. Trends describe what changed, not why it changed.")


def _parse_period(period: str | None) -> tuple[str, str] | None:
    if not period:
        return None
    m = re.fullmatch(r"(\d{4}-\d{2})/(\d{4}-\d{2})", period.strip())
    if m:
        return m.group(1), m.group(2)
    m = re.fullmatch(r"(\d{4})\s*[-–/]\s*(\d{4})", period.strip())
    if m:
        return f"{m.group(1)}-01", f"{m.group(2)}-12"
    raise ApiError(422, "VALIDATION_ERROR", "context.period must be 'YYYY-MM/YYYY-MM' or 'YYYY-YYYY'.",
                   {"period": period})


def explain(req: ExplainRequest) -> dict:
    ctx, warnings = req.context, []
    found = []
    for tid in ctx.trend_ids:
        if tid in _STORE and "slope_per_decade" in _STORE[tid]:
            found.append(_STORE[tid])
        else:
            warnings.append(f"trend_id '{tid}' is unknown or expired; run the analysis again.")

    if not found and ctx.variable_id:
        v = get_variable(ctx.variable_id)
        if ctx.region is not None:
            region, bbox, w = resolve_region(ctx.region)
        else:
            demo = catalog.REGIONS[catalog.DEMO_REGION_ID]
            region, bbox, w = {"type": "preset", "id": demo.id, "name": demo.name, "bbox": list(demo.bbox)}, \
                demo.bbox, [f"No region was given, so the demo region ({demo.name}) was used."]
        period = _parse_period(ctx.period) or bridge.coverage(v.pipeline_id)
        if period is None:
            raise ApiError(503, "DATA_NOT_READY", f"Data for '{v.id}' is not available on the server yet.")
        _check_time(v, *period)
        found.append(_compute_trend(v, region, bbox, period[0], period[1], config.DEFAULT_ALPHA, w)[0])

    if not found:
        return {"answer": "Pick a variable and a region (or run an analysis first), then ask again: "
                          "answers are built only from statistics computed on NASA data.",
                "cited_numbers": [], "actions": [], "disclaimer": EXPLAIN_DISCLAIMER,
                "model": EXPLAIN_MODEL, "warnings": warnings}

    parts, cited, actions = ["Here is what the NASA data shows:"], [], []
    for t in found:
        v = catalog.VARIABLES[t["variable_id"]]
        parts.append(t["plain_summary"])
        label = f"{v.name} trend, {_region_label(t['region'])}"
        if t["slope_per_decade"] is not None:
            cited.append({"label": label, "value": t["slope_per_decade"],
                          "units": f"{v.display_units} per decade",
                          "source_field": f"trends.{t['trend_id']}.slope_per_decade"})
        if t["p_value"] is not None:
            cited.append({"label": f"{label}: p-value", "value": t["p_value"], "units": "probability",
                          "source_field": f"trends.{t['trend_id']}.p_value"})
        other = {"imerg_precip": "gldas_soil_moisture_0_10cm",
                 "gldas_soil_moisture_0_10cm": "imerg_precip"}.get(v.id)
        if other and bridge.is_available(catalog.VARIABLES[other].pipeline_id):
            region_ref = ({"type": "preset", "id": t["region"]["id"]} if t["region"].get("id")
                          else {"type": "bbox", "bbox": t["region"]["bbox"]})
            actions.append({"type": "run_trend", "params": {"variable_id": other, "region": region_ref,
                                                           "start": t["start"], "end": t["end"]}})
        warnings += t["warnings"]
    parts.append("Method: Seasonal Mann-Kendall test with Sen's slope on monthly area averages over the global grid cells. "
                 "A trend is called significant when p < 0.05 and there are at least 10 years of data.")
    return {"answer": " ".join(parts), "cited_numbers": cited, "actions": actions[:3],
            "disclaimer": EXPLAIN_DISCLAIMER, "model": EXPLAIN_MODEL, "warnings": sorted(set(warnings))}


# ---------------------------------------------------------------- /variables, /regions, /health
def variables() -> dict:
    out = []
    for v in catalog.VARIABLES.values():
        m = bridge.meta(v.pipeline_id)
        param, dataset_name = catalog.VARIABLE_PARAMETER[v.id]
        out.append({"id": v.id, "parameter": param, "parameter_name": catalog.PARAMETERS[param],
                    "dataset_name": dataset_name, "name": v.name, "category": v.category,
                    "description_simple": v.description_simple, "description_technical": v.description_technical,
                    "units": v.units, "display_units": v.display_units, "temporal_resolution": "monthly",
                    "spatial_resolution_deg": m["cell_size_deg"] if m else config.CELL_SIZE_DEG,
                    "native_resolution_deg": v.native_resolution_deg,
                    "coverage": {"start": m["start"], "end": m["end"]} if m else None,
                    "extent": list(m["extent"]) if m else None,
                    "available": m is not None, "source": v.source})
    return {"variables": out}


def regions() -> dict:
    sizes = [m["cell_size_deg"] for v in catalog.VARIABLES.values() if (m := bridge.meta(v.pipeline_id))]
    return {"regions": [{"id": r.id, "name": r.name, "bbox": list(r.bbox), "is_demo": r.is_demo}
                        for r in catalog.REGIONS.values()],
            "limits": {"max_bbox_area_deg2": config.MAX_BBOX_AREA_DEG2, "min_cells": config.MIN_CELLS,
                       "cell_size_deg": max(sizes, default=config.CELL_SIZE_DEG)}}


def available_variables() -> list[str]:
    return [v.id for v in catalog.VARIABLES.values() if bridge.is_available(v.pipeline_id)]


# ---------------------------------------------------------------- /trends/sensitivity ("Would more years help?")
def _years_needed(value: pd.Series, significant: bool | None, alpha: float) -> dict:
    """Ước lượng số năm cần thêm để xu hướng hiện tại thành có ý nghĩa (ước lượng thô, không phải kiểm định)."""
    from scipy import stats
    caveat = ("A rough estimate, not a promise: it assumes the current rate and year-to-year noise stay the same, "
              "and the real test (Seasonal Mann-Kendall) may need more or fewer years.")
    if significant:
        return {"estimate": None, "basis": "The trend is already statistically significant.", "caveat": caveat}
    a = bridge.anomaly(value)
    ok = a.notna().to_numpy()
    if ok.sum() < 24:
        return {"estimate": None, "basis": "Too few months with data to estimate.", "caveat": caveat}
    k = np.arange(len(a))[ok]                       # tháng
    lr = stats.linregress(k, a.to_numpy()[ok])
    resid = pd.Series(np.nan, index=a.index)
    resid[ok] = a.to_numpy()[ok] - (lr.intercept + lr.slope * k)
    sd = float(np.std(resid.dropna(), ddof=2))
    r1 = min(max(float(resid.autocorr(1)), 0.0), 0.99)  # âm → 0 (thận trọng); ≈1 → giới hạn để không chia 0
    if not (math.isfinite(lr.slope) and lr.slope != 0 and math.isfinite(sd) and math.isfinite(r1)):
        return {"estimate": None, "basis": "Not estimable: the current rate is zero or the data do not vary.",
                "caveat": caveat}
    zc = float(stats.norm.ppf(1 - alpha / 2))
    # se(b) = sd·√(12 / (N³ − N))·√((1 + r1)/(1 − r1)) cho N tháng cách đều; giải |b|/se = zc.
    # ponytail: N³ − N ≈ N³ (sai < 0,01 % khi N ≥ 120); bỏ qua tháng thiếu, đủ cho chuỗi trung bình vùng.
    n_needed = (12 * (zc * sd / lr.slope) ** 2 * (1 + r1) / (1 - r1)) ** (1 / 3)
    n_needed = max(n_needed, 120.0)                 # luật của backend: cần ít nhất 10 năm mới kiểm định
    record = len(value) / 12
    if n_needed <= len(value):                      # độ dốc OLS bảo đã đủ dài nhưng Mann-Kendall chưa qua: không đoán
        return {"estimate": None, "caveat": caveat,
                "basis": "The simple slope estimate says this record is already long enough, yet the trend test does "
                         "not pass, so a number of years would mean nothing here."}
    extra = round((n_needed - len(value)) / 12)
    if extra > record:                              # ngoại suy quá độ dài cả chuỗi hiện có: không đưa số
        return {"estimate": None, "caveat": caveat,
                "basis": f"The change is small next to the year-to-year swings: it would take more than another "
                         f"{record:.0f} years (longer than the whole record), so we give no number."}
    extra = max(1, extra)
    return {"estimate": int(extra),
            "basis": (f"OLS slope of the deseasonalised monthly anomalies ({_fmt(lr.slope * 120)} per decade), "
                      f"residual SD {_fmt(sd)} and lag-1 autocorrelation {r1:.2f} (effective sample size). "
                      f"Solved for the record length where |slope| / standard error >= {zc:.2f} "
                      f"(about {n_needed / 12:.0f} years in total), at least 10 years and at least 1 more year."),
            "caveat": caveat}


def trend_sensitivity(req: TrendRequest) -> dict:
    """Xu hướng và p theo năm bắt đầu: cùng trend_one + cùng luật kết luận như /trends, một lần nạp dữ liệu.
    points sắp theo số năm tăng dần: điểm cuối = đúng kỳ của request (= kết quả /trends)."""
    v = get_variable(req.variable_id)
    region, bbox, _ = resolve_region(req.region)
    _check_time(v, req.start, req.end)
    value = _region_values(v, bbox, req.start, req.end, _country_of(region))[0]
    starts = [req.start] + [f"{y}-01" for y in range(int(req.start[:4]) + 1, int(req.end[:4]) + 1)]
    points = []
    for start in starts:
        s = value.loc[start:]
        if s.index.year.nunique() < 10:             # >= 10 năm tới `end`, cùng cách đếm năm với _insufficient
            continue
        try:
            tr = bridge.trend_one(s, annual=_annual(v))
        except Exception:                           # giống _compute_trend: chuỗi quá ngắn cho pymannkendall
            tr = None
        insufficient = tr is None or bool(tr["insufficient_data"]) or _insufficient(s)
        p = None if insufficient else _num(tr["p_value"])
        points.append({"start": start, "end": req.end, "years": round(len(s) / 12, 2),
                       "slope_per_decade": _num(tr["slope_per_decade"]) if tr else None,
                       "p_value": p, "significant": None if p is None else bool(p < req.alpha)})
    points.reverse()
    full_sig = points[-1]["significant"] if points else None      # điểm cuối luôn là kỳ đầy đủ của request
    return {"variable_id": v.id, "units": v.units, "alpha": req.alpha, "points": points,
            "years_needed": _years_needed(value, full_sig, req.alpha)}
