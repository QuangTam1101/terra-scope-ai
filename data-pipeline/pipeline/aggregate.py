"""Raster → chuỗi thời gian theo vùng, rồi 8 ngày → tháng (docs/03 §E, §F; docs/01 S2–S6).
Todo: raster → regional time series; xarray / rasterio / rioxarray; point/polygon extraction (phần area)."""
import numpy as np
import pandas as pd

from pipeline import qa

# ── §E Gộp không gian ────────────────────────────────────────────────────────

def zonal_mean(values, inside, lat=None, min_frac=0.3):
    """values: 2D đã decode + QA (NaN = loại); inside: 2D bool, tâm pixel trong vùng; lat: 1D vĩ độ
    từng hàng nếu lưới lat/lon (trọng số cos), None nếu lưới MODIS native (pixel đều diện tích)."""
    w = np.ones_like(values, dtype="float64")
    if lat is not None:
        w = w * np.cos(np.deg2rad(np.asarray(lat)))[:, None]
    n_total = int(inside.sum())
    if n_total == 0:
        raise ValueError("Vùng không chứa tâm pixel nào: kiểm tra polygon/CRS")
    ok = inside & np.isfinite(values)
    n_valid = int(ok.sum())
    frac = n_valid / n_total
    mean = float((values[ok] * w[ok]).sum() / w[ok].sum()) if n_valid else np.nan
    return {"value": mean if frac >= min_frac else np.nan, "n_valid": n_valid, "valid_frac": frac}


# layer giá trị → (valid range đã scale, scale factor) để ensure_scaled tự phát hiện (03 §C)
SCALE = {
    "_1_km_monthly_NDVI": (qa.VALID["ndvi"], 0.0001),
    "LST_Day_1km": (qa.VALID["lst"], 0.02),
    "LST_Night_1km": (qa.VALID["lst"], 0.02),
}


def decode_layer(ds_raw, layer):
    """S3 + S4 trên Dataset mở bằng mask_and_scale=False: fill → NaN, scale, lọc QA (đọc QA số thô)."""
    raw = ds_raw[layer]
    if layer in ("ET_500m", "PET_500m"):
        val = qa.scale_et(raw).where(raw <= qa.ET_MAX_RAW)       # 32767 và 32761–32766 đều > 32700
    else:
        (lo, hi), scale = SCALE[layer]
        val = qa.ensure_scaled(qa.mask_fill(raw, layer), lo, hi, scale)
    qa_layer, ok, _ = qa.QA_POLICY[layer]
    if qa_layer:                                                  # BẪY QC fill = 0: không bao giờ che QA theo fill
        val = val.where(ok(ds_raw[qa_layer].values))
    return val


def region_mask(da, bbox):
    """2D bool: tâm pixel nằm trong bbox (W, S, E, N, EPSG:4326), ở CRS của raster."""
    import geopandas as gpd                                       # import muộn: chỉ đường area cần
    from rasterio.features import geometry_mask
    from shapely.geometry import box
    crs = da.rio.crs or "EPSG:4326"                               # native: CRS từ coord `crs` (raster_to_series)
    geom = gpd.GeoSeries([box(*bbox)], crs="EPSG:4326").to_crs(crs).iloc[0]
    ydim, xdim = da.rio.y_dim, da.rio.x_dim
    return ~geometry_mask([geom], out_shape=(da.sizes[ydim], da.sizes[xdim]),
                          transform=da.rio.transform(), all_touched=False)


def raster_to_series(ds_raw, layer, bbox, min_frac=0.3):
    """Một layer AppEEARS của một vùng → DataFrame (index = ngày composite): value, n_valid, valid_frac."""
    import rioxarray  # noqa: F401  (đăng ký accessor .rio)
    if "crs" in ds_raw.data_vars:                                 # ✅ R4 13/11: CRS nằm trong biến grid_mapping `crs`;
        ds_raw = ds_raw.set_coords("crs")                         # phải là coord thì rioxarray mới đọc được (native: sinusoidal)
    da = decode_layer(ds_raw, layer)
    if "lat" in da.dims:                                          # ✅ geographic: lat/lon; native: xdim/ydim (rio tự nhận)
        da = da.rio.set_spatial_dims(x_dim="lon", y_dim="lat")
    if ds_raw.rio.crs is not None:
        da = da.rio.write_crs(ds_raw.rio.crs)
    inside = region_mask(da, bbox)
    geographic = da.rio.crs is None or da.rio.crs.is_geographic
    lat = da[da.rio.y_dim].values if geographic else None         # native sinusoidal: pixel đều diện tích
    stats = [zonal_mean(da.isel(time=k).values, inside, lat, min_frac) for k in range(da.sizes["time"])]
    # ✅ R4 13/11: AppEEARS ghi lịch julian (cftime). 2000–2024 hai lịch có cùng năm nhuận → lấy nguyên ngày ghi trên nhãn.
    return pd.DataFrame(stats, index=pd.to_datetime(da["time"].dt.strftime("%Y-%m-%d").values))


# ── §F 8 ngày → tháng ────────────────────────────────────────────────────────

def composite_days(start):
    """Số ngày thật của composite bắt đầu ở `start`: 8, trừ composite cuối năm (đến hết 31/12)."""
    end_of_year = pd.Timestamp(year=start.year, month=12, day=31)
    return min(8, (end_of_year - start).days + 1)


def composites_to_monthly(s, how, min_composites=2):
    """s: Series giá trị theo NGÀY BẮT ĐẦU composite (NaN = loại).
    how='mean' cho đại lượng cường độ (LST): trung bình theo số ngày phủ.
    how='sum'  cho đại lượng tích luỹ (ET, PET, mm/8 ngày): cộng phần của composite rơi vào tháng."""
    daily = []
    for start, v in s.items():
        n = composite_days(start)
        days = pd.date_range(start, periods=n, freq="D")
        per_day = v if how == "mean" else v / n           # ET: chia đều lượng của composite cho từng ngày
        daily.append(pd.DataFrame({"v": per_day, "comp": start}, index=days))
    d = pd.concat(daily)
    g = d.groupby(d.index.to_period("M"))
    out = g["v"].mean() if how == "mean" else g["v"].sum(min_count=1)
    valid_comps = d.dropna(subset=["v"]).groupby(d.dropna(subset=["v"]).index.to_period("M"))["comp"].nunique()
    if how == "sum":                                      # tổng chỉ đúng khi mọi ngày trong tháng có số
        full = g["v"].count() == g["v"].size()
        out = out.where(full)
    out = out.where(valid_comps.reindex(out.index, fill_value=0) >= min_composites)
    out.index = out.index.to_timestamp()                  # nhãn = ngày đầu tháng
    return out


def series_to_monthly(stats, layer):
    """stats từ raster_to_series / point CSV → DataFrame tháng (value, n_valid, valid_frac).
    MOD13A3 đã theo tháng: chỉ đổi nhãn. MOD11A2 (LST): trung bình. MOD16A2GF (ET/PET): cộng theo ngày."""
    month = stats.index.to_period("M").to_timestamp()
    if layer == "_1_km_monthly_NDVI":
        out = stats.copy()
        out.index = month
        return out
    how = "sum" if layer in ("ET_500m", "PET_500m") else "mean"
    value = composites_to_monthly(stats["value"], how)
    g = stats.groupby(month)
    return pd.DataFrame({"value": value, "n_valid": g["n_valid"].sum().reindex(value.index),
                         "valid_frac": g["valid_frac"].mean().reindex(value.index)})
