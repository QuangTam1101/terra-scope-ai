"""Decode AppEEARS: scale factor, fill / giá trị đặc biệt, bit QA, valid range (docs/03 §C, C2, D, D2).
Todo: QA masking, missing values, scale factors. Chỉ áp cho AppEEARS (Giovanni đã xử lý sẵn)."""
import numpy as np

# ── §C Scale factor ──────────────────────────────────────────────────────────

def ensure_scaled(da, valid_min, valid_max, scale, offset=0.0):
    """Trả về da ở đơn vị thật (NDVI, LST). Tự nhận biết đã scale hay còn thô; không chắc thì dừng."""
    lo, hi = (float(q) for q in da.quantile([0.01, 0.99], skipna=True))
    if valid_min <= lo and hi <= valid_max:                       # đã ở đơn vị thật
        return da
    raw_lo, raw_hi = (valid_min - offset) / scale, (valid_max - offset) / scale
    if raw_lo <= lo and hi <= raw_hi:                             # còn thô → nhân scale
        return da * scale + offset
    raise ValueError(f"Không xác định được trạng thái scale: p1={lo}, p99={hi}")


def scale_et(da, scale=0.1):
    """ET/PET: khoảng thô và khoảng thật chồng nhau nên quyết định theo dtype, không theo giá trị."""
    if np.issubdtype(da.dtype, np.integer):                       # int16 thô → nhân scale
        return da.astype("float64") * scale
    if np.issubdtype(da.dtype, np.floating) and "scale_factor" in da.encoding:  # xarray đã tự áp scale
        return da
    raise ValueError(f"ET dtype={da.dtype}, encoding={da.encoding}: không rõ đã scale chưa")


# ── §C2 Fill / giá trị đặc biệt (áp trên số THÔ, trước khi scale) ───────────

FILL = {  # ✅ /api/product 13/11/2026
    "_1_km_monthly_NDVI": -3000,
    "LST_Day_1km": 0, "LST_Night_1km": 0,
    "ET_500m": 32767, "PET_500m": 32767,
    "LC_Type1": 255, "SRTMGL3_DEM": -32768,
}
ET_MAX_RAW = 32700  # 32761–32766 = lớp đặc biệt (nước, đô thị, đất trống, băng…), không phải ET


def mask_fill(raw, layer):
    """raw: mảng số nguyên thô. Trả float với fill/lớp đặc biệt → NaN. KHÔNG dùng cho layer QA."""
    out = raw.astype("float64")
    out = out.where(raw != FILL[layer]) if hasattr(out, "where") else np.where(raw == FILL[layer], np.nan, out)
    if layer in ("ET_500m", "PET_500m"):
        out = out.where(raw <= ET_MAX_RAW) if hasattr(out, "where") else np.where(raw > ET_MAX_RAW, np.nan, out)
    return out


# ── §D Bit QA ────────────────────────────────────────────────────────────────

def bits(qa, start, n):
    """Lấy n bit bắt đầu từ bit `start` (bit 0 = bit thấp nhất)."""
    return (np.asarray(qa).astype(np.int64) >> start) & ((1 << n) - 1)


# MOD13A3 _1_km_monthly_VI_Quality (✅ /api/quality/MOD13A3.061/_1_km_monthly_VI_Quality)
def ndvi_good(vi_q):                    # bit 0–1 MODLAND == 00 "VI produced, good quality"
    return bits(vi_q, 0, 2) == 0


def ndvi_land(vi_q):                    # bit 11–13 land/water == 001 "Land (nothing else but land)"
    return bits(vi_q, 11, 3) == 1


# MOD11A2 QC_Day / QC_Night (✅ /api/quality/MOD11A2.061/QC_Day)
def lst_ok(qc):                         # MODLAND 00, hoặc 01 mà LST error (bit 6–7) ≤ 01 (≤ 2 K)
    m, err = bits(qc, 0, 2), bits(qc, 6, 2)
    return (m == 0) | ((m == 1) & (err <= 1))


# MOD16A2GF ET_QC_500m (✅ /api/quality/MOD16A2GF.061/ET_QC_500m)
def et_main_algorithm(qc):              # bit 0 MODLAND == 0 (chỉ dùng nếu Đăng chọn siết, K5)
    return bits(qc, 0, 1) == 0


def lst_valid(lst_raw, qc):
    """BẪY: FillValue của QC báo = 0 nhưng QC = 0 là TỐT NHẤT. Thiếu dữ liệu nhận biết qua LST == 0."""
    return (np.asarray(lst_raw) != 0) & lst_ok(qc)


# Chính sách QA mặc định theo layer giá trị (🔬 Đăng duyệt). ET: không lọc thêm (gap-filled), xem 03 K5.
QA_POLICY = {
    "_1_km_monthly_NDVI": ("_1_km_monthly_VI_Quality", ndvi_good, "modland_good"),
    "LST_Day_1km": ("QC_Day", lst_ok, "modland_good_or_lst_err_le_2k"),
    "LST_Night_1km": ("QC_Night", lst_ok, "modland_good_or_lst_err_le_2k"),
    "ET_500m": (None, None, "et_valid_only"),
    "PET_500m": (None, None, "et_valid_only"),
}


# ── §D2 Valid range ──────────────────────────────────────────────────────────

VALID = {"ndvi": (-0.2, 1.0), "lst": (150.0, 1310.7), "et_8day": (0.0, 3270.0)}  # đã scale


def to_nan_outside(x, lo, hi):
    """Ngoài valid range → NaN. Không cắt về biên (cắt về biên = bịa số)."""
    x = np.asarray(x, dtype="float64")
    return np.where((x >= lo) & (x <= hi), x, np.nan)
