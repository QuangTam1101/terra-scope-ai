"""Lưới toàn cầu (docs/01 S5–S8b, mục 7): gộp mọi nguồn về ô 1°, xu hướng cả lưới trong vài giây,
chuỗi cho vùng BẤT KỲ người dùng vẽ, và gom ô significant thành "điểm nóng" cho Contradiction Hunter."""
import warnings

import numpy as np
import pandas as pd
import xarray as xr
from scipy import ndimage, stats

from .trends import bh_fdr

STEP = 1.0


def bin_to_grid(da, step=STEP):
    """Trung bình khối: mọi ô nguồn có TÂM trong ô đích step° → ô đích (tâm tại k·step + step/2).
    Chạy được với mọi lưới nguồn (IMERG 0.1°, GLDAS 0.25°, MERRA-2 0.5° × 0.625°); NaN (ô biển GLDAS) bị bỏ qua.
    Bỏ trọng số cos(vĩ độ) bên trong một ô 1° (chênh < 1%)."""
    lat = np.clip(da["lat"].values, -90, 90 - 1e-9)
    lon = (da["lon"].values + 180) % 360 - 180
    da = da.assign_coords(lat=np.floor(lat / step) * step + step / 2, lon=np.floor(lon / step) * step + step / 2)
    total = da.fillna(0).groupby("lat").sum().groupby("lon").sum()
    count = da.notnull().groupby("lat").sum().groupby("lon").sum()
    return (total / count).where(count > 0)


def global_coords(step=STEP):
    return np.arange(-90 + step / 2, 90, step), np.arange(-180 + step / 2, 180, step)


def write_grid_points(land, path, batch_size=None):
    """land: DataArray bool (lat, lon), vd. cube GLDAS có giá trị (GLDAS chỉ có đất liền, từ 60°S) →
    CSV id,latitude,longitude (tâm ô) cho `appeears.py point`. batch_size → nhiều file *_G1.csv, *_G2.csv…"""
    pts = land.where(land, drop=True).to_dataframe(name="m").dropna().reset_index()
    pts = pd.DataFrame({"id": [f"g_{a}_{o}" for a, o in zip(pts["lat"], pts["lon"])],
                        "latitude": pts["lat"], "longitude": pts["lon"]})
    size = batch_size or len(pts)
    paths = []
    for k in range(0, len(pts), size):
        p = path if batch_size is None else path.with_name(f"{path.stem}_G{k // size + 1}{path.suffix}")
        pts.iloc[k:k + size].to_csv(p, index=False)
        paths.append(p)
    return paths


def points_to_cube(obs, variable, step=STEP):
    """observations từ AppEEARS point (region_id = g_<lat>_<lon> = tâm ô) → cube (time, lat, lon) toàn cầu;
    ô không có điểm (biển, Nam Cực) = NaN. Mỗi ô = 1 pixel MODIS mẫu, không phải TB ô (03 K6)."""
    o = obs[obs["variable"] == variable]
    ll = o["region_id"].str.extract(r"^g_(-?[\d.]+)_(-?[\d.]+)$").astype(float)
    s = pd.Series(o["value"].to_numpy(dtype="float64"),
                  index=pd.MultiIndex.from_arrays([pd.to_datetime(o["time"]), ll[0], ll[1]],
                                                  names=["time", "lat", "lon"]))
    lat, lon = global_coords(step)
    return xr.DataArray.from_series(s).reindex(lat=lat, lon=lon).rename(variable)


def grid_trend(cube, start=None, end=None, min_years=10, chunk=4096, annual=False):
    """Seasonal Mann-Kendall + Sen theo mùa cho MỌI ô cùng lúc (numpy), cho khoảng thời gian người dùng chọn.
    annual=True: độ dốc = Sen trên trung bình anomaly từng năm, như trends.trend_one(annual=True).
    cube: DataArray (time, lat, lon), nhãn đầu tháng; khoảng chọn phải gồm trọn năm.
    Khớp pymannkendall.seasonal_test khi không có giá trị trùng; bỏ hiệu chỉnh trùng (ties) → phương sai
    lớn hơn thật một chút ở ô sa mạc nhiều tháng mưa = 0, tức là THẬN TRỌNG hơn (p lớn hơn)."""
    c = cube.sel(time=slice(start, end)).transpose("lat", "lon", "time")
    t = pd.DatetimeIndex(c["time"].values)
    assert len(t) % 12 == 0 and t[0].month == 1, "khoảng thời gian phải gồm trọn năm (tháng 1 → tháng 12)"
    ny = len(t) // 12
    x = c.values.reshape(-1, ny, 12).astype("float64")
    i, j = np.triu_indices(ny, k=1)
    s_stat, var, slope = np.zeros(len(x)), np.zeros(len(x)), np.full(len(x), np.nan)
    for a in range(0, len(x), chunk):                         # ponytail: khối 4096 ô ≈ 110 MB RAM
        b = x[a:a + chunk]
        d = b[:, j, :] - b[:, i, :]                            # (ô, cặp năm, tháng)
        s_stat[a:a + chunk] = np.nansum(np.sign(d), axis=(1, 2))
        n = np.isfinite(b).sum(axis=1)                         # (ô, tháng)
        var[a:a + chunk] = (n * (n - 1) * (2 * n + 5) / 18).sum(axis=1)
        if annual:                                             # (ô, năm): TB anomaly năm, rồi Sen theo cặp năm
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)  # ô không có dữ liệu: nanmean rỗng → NaN
                ya = np.nanmean(b - np.nanmean(b, axis=1, keepdims=True), axis=2)
            r = (ya[:, j] - ya[:, i]) / (j - i)[None, :]
        else:
            r = (d / (j - i)[None, :, None]).reshape(len(b), -1)
        ok = np.isfinite(r).any(axis=1)
        slope[a:a + chunk][ok] = np.nanmedian(r[ok], axis=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        z = np.where(s_stat > 0, s_stat - 1, np.where(s_stat < 0, s_stat + 1, 0)) / np.sqrt(var)
    p = 2 * stats.norm.sf(np.abs(z))
    n_years = np.isfinite(x).any(axis=2).sum(axis=1)
    p[(n_years < min_years) | ~np.isfinite(z)] = np.nan       # thiếu dữ liệu → không kết luận
    shape = (c.sizes["lat"], c.sizes["lon"])
    out = {"slope_per_decade": slope * 10, "z": z, "p_value": p, "p_value_fdr": bh_fdr(p), "n_years": n_years}
    return xr.Dataset({k: (("lat", "lon"), v.reshape(shape)) for k, v in out.items()},
                      coords={"lat": c["lat"], "lon": c["lon"]},
                      attrs={"start": str(t[0].date()), "end": str(t[-1].date()),
                             "method": "seasonal_mk_sen_annual" if annual else "seasonal_mk_sen"})


def shape_mask(lat, lon, rings):
    """Ô nào có TÂM nằm trong đường viền (quốc gia): mảng bool (lat, lon).
    rings: các vòng (N, 2) lon/lat của mọi mảnh; quy tắc chẵn-lẻ nên lỗ (hồ, nước nằm trong nước khác) và
    nhiều mảnh (đảo) đều đúng. Quét từng hàng vĩ độ, đếm số cạnh cắt hàng ở bên trái mỗi tâm ô.
    Toạ độ phẳng: đường viền Natural Earth đã cắt tại ±180° nên không vòng nào vắt qua kinh tuyến 180."""
    edges = np.concatenate([np.column_stack([r[:-1], r[1:]]) for r in map(np.asarray, rings)])
    x1, y1, x2, y2 = edges.T
    lon = np.asarray(lon, dtype=float)
    out = np.zeros((len(lat), len(lon)), dtype=bool)
    for i, yc in enumerate(np.asarray(lat, dtype=float)):
        hit = (y1 <= yc) != (y2 <= yc)            # cạnh cắt đường y = yc (nửa mở: đỉnh không bị đếm hai lần)
        if hit.any():
            xs = np.sort(x1[hit] + (yc - y1[hit]) * (x2[hit] - x1[hit]) / (y2[hit] - y1[hit]))
            out[i] = np.searchsorted(xs, lon) % 2 == 1
    return out


def region_series(cube, bbox, rings=None):
    """Chuỗi tháng của vùng người dùng chọn: trung bình có trọng số cos(vĩ độ) các ô có tâm trong bbox,
    hoặc, khi có `rings` (đường viền quốc gia), chỉ các ô có tâm nằm trong đường viền (`shape_mask`).
    Trả (value, valid_frac) để báo chất lượng dữ liệu trên web; valid_frac tính trên các ô được chọn."""
    w, s, e, n = bbox
    assert w < e and s < n, "bbox phải là (W, S, E, N), W < E (chưa hỗ trợ vùng cắt kinh tuyến 180°)"
    sub = cube.sel(lat=slice(s, n), lon=slice(w, e))
    assert sub.sizes["lat"] and sub.sizes["lon"], "bbox nhỏ hơn một ô lưới 1°: chọn vùng lớn hơn"
    inside = xr.ones_like(sub.isel(time=0), dtype=bool)
    if rings is not None:
        inside = inside & xr.DataArray(shape_mask(sub["lat"].values, sub["lon"].values, rings),
                                       coords={"lat": sub["lat"], "lon": sub["lon"]}, dims=("lat", "lon"))
        assert inside.any(), "không ô nào có tâm trong đường viền"
    wgt = (np.cos(np.deg2rad(sub["lat"])) * xr.ones_like(sub.isel(time=0))).where(inside, 0.0)
    ok = sub.notnull() & inside
    value = (sub * wgt).sum(("lat", "lon")) / wgt.where(ok).sum(("lat", "lon"))
    frac = ok.sum(("lat", "lon")) / int(inside.sum())
    idx = pd.DatetimeIndex(sub["time"].values)
    return pd.Series(value.values, index=idx).where(frac.values > 0), pd.Series(frac.values, index=idx)


def hotspot_regions(trend, q=0.05, min_cells=4):
    """Gom các ô significant (q < 0.05) CÙNG chiều và liền kề (8 hướng) thành vùng → "tự tìm khu vực".
    Trả (labels: DataArray int, 0 = không thuộc vùng nào; bảng vùng). Vùng < min_cells ô bị bỏ (nhiễu lẻ).
    ponytail: không nối qua kinh tuyến 180° (vùng ở hai mép bản đồ thành hai vùng)."""
    sig = (trend["p_value_fdr"] < q).values
    sign = np.sign(trend["slope_per_decade"].values)
    labels = np.zeros(sig.shape, dtype=int)
    rows, next_id = [], 1
    for sgn, name in ((1, "up"), (-1, "down")):
        lab, n = ndimage.label(sig & (sign == sgn), structure=np.ones((3, 3)))
        for k in range(1, n + 1):
            m = lab == k
            if m.sum() < min_cells:
                continue
            labels[m] = next_id
            la, lo = trend["lat"].values[m.any(1)], trend["lon"].values[m.any(0)]
            rows.append({"region_id": f"h{next_id}_{name}", "label": next_id, "direction": name,
                         "n_cells": int(m.sum()), "bbox": [float(lo.min()) - 0.5, float(la.min()) - 0.5,
                                                           float(lo.max()) + 0.5, float(la.max()) + 0.5],
                         "median_slope_per_decade": float(np.nanmedian(trend["slope_per_decade"].values[m]))})
            next_id += 1
    return xr.DataArray(labels, coords={"lat": trend["lat"], "lon": trend["lon"]}), pd.DataFrame(rows)


def hotspot_obs(cube, labels, table, variable, unit):
    """Chuỗi tháng (TB cos-vĩ độ) của mỗi điểm nóng → bảng dài (region_id, variable, unit, time, value)
    đúng dạng trends.trends_table / contradictions.find_opposite_trends cần."""
    wgt = np.cos(np.deg2rad(cube["lat"])) * xr.ones_like(labels, dtype=float)
    parts = []
    for r in table.itertuples():
        m = labels == r.label
        v = (cube.where(m) * wgt).sum(("lat", "lon")) / wgt.where(m & cube.notnull()).sum(("lat", "lon"))
        parts.append(pd.DataFrame({"region_id": r.region_id, "variable": variable, "unit": unit,
                                   "time": pd.DatetimeIndex(cube["time"].values), "value": v.values}))
    return pd.concat(parts, ignore_index=True)
