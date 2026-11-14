"""Bước 2b – làm sạch và tiền xử lý. Đọc data/raw/ qua ADAPTER theo kiểu dữ liệu (rút ra từ reports/01_eda.md), rồi
áp cùng một chuỗi bước cho mọi nguồn: fill → scale (+ đổi đơn vị) → filter → lưới chung → schema chung.
Chạy:    .venv/bin/python preprocess/clean.py [TÊN ...]      (mặc định: mọi sản phẩm trong PRODUCTS đã có dữ liệu thô)
Kết quả: data/processed/grid/<TÊN>.nc     biến <TÊN>, trục (time, lat, lon), float32, NaN = không có dữ liệu,
                                         time = ngày đầu tháng START … END (2001-01 … 2025-12), lưới 0,5° toàn cầu (tâm ô ±0,25 …)
         data/processed/stations/precip_gsom.parquet   bảng dài: station, lat, lon, elev_m, time, precip_gsom (mm/month)
         reports/02_cleaning.md          mỗi bước loại bao nhiêu ô và phân bố giá trị sau xử lý (ghi đè từng sản phẩm)
Kiểu adapter (xem preprocess/README.md):
  monthly_files  lưới lat/lon đều, mỗi tháng một file          IMERG, GLDAS, MERRA-2, SeaWiFS
  multi_month    lưới lat/lon đều, nhiều tháng trong một file   CRU, GPCC
  daily_ease     lưới EASE-Grid 2.0 hằng ngày, có cờ chất lượng  SMAP
  station_csv    mỗi trạm một CSV, giá trị kèm chuỗi cờ          GSOM (giữ ở dạng điểm, không nội suy lên lưới)"""
import json
import re
import sys
from pathlib import Path

import netCDF4
import numpy as np
import pandas as pd
import xarray as xr
from pyproj import Transformer

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eda import END, RAW, ROOT, SETS, START, gsom_rows  # noqa: E402

OUT, REPORT = ROOT / "data" / "processed", ROOT / "reports" / "02_cleaning.md"
RES, MIN_COVER = 0.5, 0.5        # lưới chung 0,5°; ô đích cần ≥ 50 % diện tích có dữ liệu hợp lệ
LAT = np.arange(-90 + RES / 2, 90, RES)
LON = np.arange(-180 + RES / 2, 180, RES)
HOURS = lambda t: 24 * t.days_in_month          # noqa: E731
SECONDS = lambda t: 86400 * t.days_in_month     # noqa: E731

PRODUCTS = {  # tên → nguồn thô (SETS trong eda.py), biến, adapter, đổi đơn vị, miền vật lý hợp lệ, đơn vị chuẩn
    "precip_imerg": dict(set="imerg_precip", var="Grid/precipitation", adapter="monthly_files",
                         conv=lambda x, t: x * HOURS(t), valid=(0, None), units="mm/month"),
    "precip_cru": dict(set="cru_pre", var="pre", adapter="multi_month", conv=None, valid=(0, None), units="mm/month",
                       qc="stn"),
    "precip_gpcc": dict(set="gpcc_precip", var="precip", adapter="multi_month", conv=None, valid=(0, None),
                        units="mm/month"),
    **{f"sm_{a}_{b}cm_gldas": dict(set=f"gldas_soilmoi{a}_{b}cm", var=f"SoilMoi{a}_{b}cm_inst", adapter="monthly_files",
                                   conv=(lambda d: lambda x, t: x / d)((b - a) * 10), valid=(0, 0.95), units="m3/m3")
       for a, b in [(0, 10), (10, 40), (40, 100), (100, 200)]},     # kg/m² ÷ (độ dày cm × 10 kg/m² mỗi cm) = m³/m³
    "rootmoist_gldas": dict(set="gldas_rootmoist", var="RootMoist_inst", adapter="monthly_files", conv=None,
                            valid=(0, None), units="kg/m2", qc="ice",
                            note="độ sâu vùng rễ đổi theo lớp thực vật: không đổi sang m³/m³"),
    "tair_gldas": dict(set="gldas_tair_f", var="Tair_f_inst", adapter="monthly_files", conv=lambda x, t: x - 273.15,
                       valid=(-90, 60), units="degC"),
    "evap_gldas": dict(set="gldas_evap", var="Evap_tavg", adapter="monthly_files", conv=lambda x, t: x * SECONDS(t),
                       valid=(None, None), units="mm/month", note="giá trị âm nhỏ = ngưng tụ/sương, giữ lại"),
    "t2m_merra2": dict(set="merra2_t2m", var="T2M", adapter="monthly_files", conv=lambda x, t: x - 273.15,
                       valid=(-90, 60), units="degC"),
    "chlor_a_seawifs": dict(set="seawifs_chlor_a", var="chlor_a", adapter="monthly_files", conv=None,
                            valid=(0.001, 100), units="mg/m3",
                            note="chỉ có tới 12/2010; phân bố lệch log, nên lấy log10 khi tính xu hướng"),
    "sm_surface_smap": dict(set="smap", var="soil_moisture (AM) + soil_moisture_pm (PM)", adapter="daily_ease",
                            conv=None, valid=(0.02, 0.5), units="m3/m3", qc="smap_flag",
                            note="lớp mặt ~5 cm; từ 04/2015; trung bình tháng của các lượt AM + PM đạt chất lượng "
                                 "khuyến nghị, cần ≥ MIN_OBS lượt mỗi tháng"),
    "precip_gsom": dict(set=None, var="PRCP", adapter="station_csv", conv=None, valid=(0, 9300), units="mm/month",
                        note="trạm đo GHCN; 9300 mm ≈ kỷ lục tháng thế giới (Cherrapunji 7/1861)"),
}
GSOM_MAX_MISSING_DAYS = 0   # GSOM vẫn tính tổng tháng khi thiếu 1–5 ngày → tổng thấp hơn thực, bỏ
GSOM_DROP_SOURCES = {"S"}   # S = suy ra từ bản tin synop GTS; NCEI: mưa có thể lệch nhiều, "use with caution"
MIN_OBS = 5     # SMAP: số lượt quan trắc hợp lệ tối thiểu (AM + PM) trong tháng để giữ một ô EASE
SMAP_PASSES = [("Soil_Moisture_Retrieval_Data_AM/soil_moisture", "Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag"),
               ("Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm",
                "Soil_Moisture_Retrieval_Data_PM/retrieval_qual_flag_pm")]


# ---------- adapter: mỗi kiểu dữ liệu thô → (tháng, mảng 2D (lat tăng dần, lon), thuộc tính, lat, lon, biến phụ)

def _axes(var):
    """lat, lon của biến (tìm trong nhóm của biến rồi nhóm cha) và thứ tự trục."""
    grp = var.group()
    find = lambda n: (grp.variables.get(n) or grp.parent.variables.get(n))[:]   # noqa: E731
    lat_name = next(d for d in var.dimensions if d.startswith("lat"))
    lon_name = next(d for d in var.dimensions if d.startswith("lon"))
    return np.asarray(find(lat_name), float), np.asarray(find(lon_name), float), lat_name, lon_name


def _orient(raw, dims, lat_name, lon_name, lat):
    """Đưa mảng về (lat, lon), lat tăng dần."""
    raw = np.squeeze(raw, axis=tuple(i for i, d in enumerate(dims) if d not in (lat_name, lon_name)))
    dims2 = [d for d in dims if d in (lat_name, lon_name)]
    if dims2[0] == lon_name:                                   # IMERG lưu (time, lon, lat)
        raw = raw.T
    return raw[::-1] if lat[0] > lat[-1] else raw


def monthly_files(p):
    pattern, _, date_re, _ = SETS[p["set"]]
    ice = {}   # RootMoist: ô băng không nhận ra được từ giá trị (luôn 100 kg/m²) → dùng tầng 0–10 cm cùng tháng
    if p.get("qc") == "ice":
        ice = {re.search(date_re, f.name).group(1): f for f in RAW.glob(SETS["gldas_soilmoi0_10cm"][0])}
    for f in sorted(RAW.glob(pattern)):
        s = re.search(date_re, f.name).group(1)
        t = pd.Timestamp(s if len(s) == 8 else s + "01")
        with netCDF4.Dataset(f) as d:
            d.set_auto_maskandscale(False)
            v = d[p["var"]]
            lat, lon, la, lo = _axes(v)
            aux = {}
            if ice:
                with netCDF4.Dataset(ice[s]) as d0:
                    v0 = d0["SoilMoi0_10cm_inst"]
                    aux["theta0_10"] = _orient(np.asarray(v0[:]), v0.dimensions, la, lo, lat) / 100  # kg/m² → m³/m³
            yield t, _orient(v[:], v.dimensions, la, lo, lat), _attrs(v), np.sort(lat), lon, aux


def multi_month(p):
    pattern = SETS[p["set"]][0]
    for f in sorted(RAW.glob(pattern)):
        with netCDF4.Dataset(f) as d:
            d.set_auto_maskandscale(False)
            v = d[p["var"]]
            lat, lon, la, lo = _axes(v)
            tv = d["time"]
            times = netCDF4.num2date(tv[:], tv.units, getattr(tv, "calendar", "standard"))
            for i, tt in enumerate(times):
                aux = {k: _orient(d[k][i], d[k].dimensions[1:], la, lo, lat) for k in [p.get("qc")] if k}
                yield (pd.Timestamp(tt.year, tt.month, 1), _orient(v[i], v.dimensions[1:], la, lo, lat), _attrs(v),
                       np.sort(lat), lon, aux)


def daily_ease(p, n):
    """SMAP: lọc từng ngày (fill, miền hợp lệ, cờ chất lượng) rồi mới gộp tháng trên lưới EASE gốc.
    Trả (tháng, trung bình tháng trên lưới EASE 406 × 964, chỉ số lấy mẫu sang lưới chung)."""
    pattern, _, date_re, _ = SETS[p["set"]]
    files = sorted(RAW.glob(pattern), key=lambda f: re.search(date_re, f.name).group(1))
    sampler = None
    for month, group in pd.Series(files).groupby([re.search(date_re, f.name).group(1)[:6] for f in files]):
        total = count = None
        for f in group:
            with netCDF4.Dataset(f) as d:
                d.set_auto_maskandscale(False)
                if sampler is None:
                    sampler = ease_sampler(d["x"][:], d["y"][:])
                for sm, flag in SMAP_PASSES:
                    v = d[sm]
                    x = clean_steps(v[:], _attrs(v), p, None, {"flag": d[flag][:]}, n)
                    ok = ~np.isnan(x)
                    total = np.where(ok, x, 0) + (0 if total is None else total)
                    count = ok.astype(int) + (0 if count is None else count)
        with np.errstate(invalid="ignore"):
            monthly = total / count
        n["cell_months"] += (count > 0).sum()
        n["few_obs"] += ((count > 0) & (count < MIN_OBS)).sum()
        monthly[count < MIN_OBS] = np.nan
        yield pd.Timestamp(month + "01"), monthly, sampler


def ease_sampler(x, y):
    """Chỉ số ô EASE chứa từng điểm mẫu, lưới 4 × 4 điểm đều trong mỗi ô 0,5° (−1 = ngoài lưới EASE, tức |lat| > 85°).
    Ô EASE 36 km có diện tích bằng nhau nên ở vĩ độ cao có ô 0,5° không chứa tâm ô EASE nào; lấy mẫu từ phía lưới
    đích tránh được lỗ hổng đó và xấp xỉ trung bình theo diện tích."""
    k = (np.arange(4) + 0.5) / 4 * RES - RES / 2
    la, lo = np.broadcast_arrays((LAT[:, None] + k)[:, None, :, None], (LON[:, None] + k)[None, :, None, :])
    X, Y = Transformer.from_crs(4326, 6933, always_xy=True).transform(lo, la)     # EASE-Grid 2.0 toàn cầu
    ix = np.rint((X - x[0]) / (x[1] - x[0]))
    iy = np.rint((Y - y[0]) / (y[1] - y[0]))
    ok = np.isfinite(ix) & np.isfinite(iy) & (ix >= 0) & (ix < len(x)) & (iy >= 0) & (iy < len(y))
    idx = np.where(ok, np.nan_to_num(iy) * len(x) + np.nan_to_num(ix), -1).astype(int)
    return idx.reshape(len(LAT), len(LON), -1)


def _attrs(v):
    return {k: v.getncattr(k) for k in v.ncattrs()}


# ---------- các bước chung

def step_fill(raw, a):
    """Giá trị fill / missing_value → NaN."""
    x = raw.astype(np.float64)
    for k in ("_FillValue", "missing_value"):
        if k in a:
            x[raw == np.asarray(a[k], dtype=raw.dtype)] = np.nan
    return x


def step_scale(x, a, conv, t):
    """scale_factor/add_offset (nếu nguồn khai báo), rồi đổi sang đơn vị chuẩn."""
    x = x * a.get("scale_factor", 1) + a.get("add_offset", 0)
    return conv(x, t) if conv else x


def step_valid(x, lo, hi):
    """Ngoài miền vật lý hợp lệ → NaN."""
    bad = np.zeros(x.shape, bool)
    if lo is not None:
        bad |= x < lo
    if hi is not None:
        bad |= x > hi
    x[bad] = np.nan
    return x


def step_qc(x, aux, kind):
    """Lọc theo biến chất lượng của nguồn. CRU: stn = 0 nghĩa là không có trạm nào trong bán kính tương quan, giá trị
    là khí hậu trung bình 1961–1990 chứ không phải quan trắc → bỏ (nếu giữ sẽ kéo xu hướng về 0)."""
    """SMAP: bit 0 của retrieval_qual_flag = 1 nghĩa là chất lượng KHÔNG được khuyến nghị (thực vật dày, đất đóng băng,
    nhiễu sóng vô tuyến …) → bỏ."""
    """GLDAS RootMoist: ô băng (Greenland, núi băng) có θ tầng 0–10 cm ≈ 1 và RootMoist hằng 100 kg/m² → bỏ."""
    if kind == "stn":
        x[aux["stn"] == 0] = np.nan
    elif kind == "smap_flag":
        x[(aux["flag"] & 1) != 0] = np.nan
    elif kind == "ice":
        x[aux["theta0_10"] > 0.95] = np.nan
    return x


def clean_steps(raw, a, p, t, aux, n):
    """fill → scale + đổi đơn vị → miền vật lý → chất lượng; đếm số ô mỗi bước biến thành NaN vào n."""
    x = step_fill(raw, a)
    nan0 = np.isnan(x).sum()
    x = step_valid(step_scale(x, a, p["conv"], t), *p["valid"])
    nan1 = np.isnan(x).sum()
    x = step_qc(x, aux, p.get("qc"))
    nan2 = np.isnan(x).sum()
    n["cells"] += x.size
    n["fill"] += nan0
    n["valid"] += nan1 - nan0
    n["qc"] += nan2 - nan1
    return x


def edges(c, lo, hi):
    """Biên ô của lưới đều. Toạ độ trong file thường là float32 (lệch ~1e-5°): biên −78° thành −77,999997° làm một mẩu
    ô bên cạnh lọt vào trung bình (verify.py phát hiện). Nên làm tròn hai biên ngoài tới 1e-4° rồi chia đều."""
    d = (c[-1] - c[0]) / (len(c) - 1)
    a, b = np.round([c[0] - d / 2, c[-1] + d / 2], 4)   # ponytail: giả định biên ngoài là bội 1e-4° (đúng với mọi nguồn)
    return np.clip(np.linspace(a, b, len(c) + 1), lo, hi)


def weights(src_lat, src_lon):
    """Ma trận trọng số bảo toàn diện tích giữa lưới nguồn và lưới chung (tách theo lat và lon).
    Theo lat dùng sin(vĩ độ) nên trọng số tỉ lệ đúng với diện tích ô trên mặt cầu. Theo lon cộng thêm phần chồng lấn
    với lưới nguồn dịch ±360°, vì ô nguồn vắt qua kinh tuyến 180 (MERRA-2 có tâm ô tại −180°) phủ cả hai mép."""
    def overlap(s, t):
        return np.clip(np.minimum(t[1:, None], s[None, 1:]) - np.maximum(t[:-1, None], s[None, :-1]), 0, None)
    sin = lambda e: np.sin(np.radians(e))                                     # noqa: E731
    wlat = overlap(sin(edges(src_lat, -90, 90)), sin(edges(LAT, -90, 90)))
    s, t = edges(src_lon, -np.inf, np.inf), edges(LON, -180, 180)
    wlon = overlap(s, t) + overlap(s + 360, t) + overlap(s - 360, t)
    area = np.diff(sin(edges(LAT, -90, 90)))[:, None] * RES
    return wlat, wlon, area


def step_sample(x, idx):
    """SMAP: trung bình các điểm mẫu rơi vào ô EASE hợp lệ; < MIN_COVER số điểm mẫu hợp lệ → NaN."""
    v = np.append(x.ravel(), np.nan)[idx]                     # chỉ số −1 → NaN
    ok = ~np.isnan(v)
    cnt = ok.sum(-1)
    out = np.where(ok, v, 0).sum(-1) / np.maximum(cnt, 1)
    out[cnt < MIN_COVER * idx.shape[-1]] = np.nan
    return out


def step_regrid(x, w):
    """Trung bình có trọng số diện tích trên các ô nguồn hợp lệ; ô đích phủ < MIN_COVER → NaN."""
    wlat, wlon, area = w
    ok = ~np.isnan(x)
    num = wlat @ np.where(ok, x, 0) @ wlon.T
    den = wlat @ ok @ wlon.T
    with np.errstate(invalid="ignore", divide="ignore"):
        out = num / den
    out[den < MIN_COVER * area * (1 - 1e-9)] = np.nan       # ô phủ đúng 50 %: sai số làm tròn không được quyết định
    return out


# ---------- trạm GSOM

def run_gsom(name, p):
    """Adapter station_csv + các bước lọc theo dòng (trạm × tháng). PRCP_ATTRIBUTES = số ngày thiếu, cờ đo, cờ chất
    lượng, mã nguồn (tài liệu GSOM của NCEI). Mỗi bước chỉ đếm dòng mà bước trước chưa loại."""
    df = gsom_rows(("STATION", "DATE", "LATITUDE", "LONGITUDE", "ELEVATION", "PRCP", "PRCP_ATTRIBUTES"))
    attr = df.PRCP_ATTRIBUTES.fillna(",,,").str.split(",", expand=True).reindex(columns=range(4)).fillna("")
    x = pd.to_numeric(df.PRCP, errors="coerce")
    steps = {"PRCP trống %": x.isna(),
             "cờ chất lượng ≠ rỗng %": attr[2].ne(""),
             f"thiếu > {GSOM_MAX_MISSING_DAYS} ngày %": pd.to_numeric(attr[0], errors="coerce").fillna(0)
                                                         > GSOM_MAX_MISSING_DAYS,
             f"nguồn {'/'.join(sorted(GSOM_DROP_SOURCES))} %": attr[3].isin(GSOM_DROP_SOURCES),
             "ngoài miền vật lý %": ~x.between(*p["valid"])}
    drop = pd.Series(False, index=df.index)
    stats = {"sản phẩm": name, "dòng trạm × tháng": len(df)}
    for k, bad in steps.items():
        stats[k] = 100 * (bad & ~drop).mean()
        drop |= bad
    keep = df[~drop]
    out = pd.DataFrame({"station": keep.STATION.astype("category"),
                        "lat": pd.to_numeric(keep.LATITUDE).astype("float32"),
                        "lon": pd.to_numeric(keep.LONGITUDE).astype("float32"),
                        "elev_m": pd.to_numeric(keep.ELEVATION, errors="coerce").astype("float32"),
                        "time": pd.to_datetime(keep.DATE + "-01"),
                        name: x[~drop].astype("float32")})
    path = OUT / "stations" / f"{name}.parquet"
    path.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(path, index=False)
    months = out.groupby("station", observed=True).size()
    q = np.percentile(out[name], [1, 50, 99])
    stats |= {"trạm có dữ liệu": len(months), "trạm ≥ 240 tháng": int((months >= 240).sum()),
              "trạm ≥ 180 tháng": int((months >= 180).sum()), "đơn vị": p["units"], "p1": q[0], "p50": q[1], "p99": q[2]}
    print(json.dumps(stats, ensure_ascii=False, default=float), flush=True)
    return stats


# ---------- chạy một sản phẩm lưới

def run(name):
    p = PRODUCTS[name]
    if p["adapter"] == "station_csv":
        return run_gsom(name, p)
    months = pd.date_range(START, END, freq="MS")
    cube = np.full((len(months), len(LAT), len(LON)), np.nan, np.float32)
    n = dict(cells=0, fill=0, valid=0, qc=0, cell_months=0, few_obs=0)
    inside = lambda t: START <= f"{t:%Y-%m-%d}" <= END                        # noqa: E731
    if p["adapter"] == "daily_ease":
        src_grid = "EASE-Grid 2.0 36 km, 406 × 964"
        regrid_note = f"trung bình 4×4 điểm mẫu mỗi ô {RES}°, < {MIN_COVER:.0%} điểm hợp lệ → NaN"
        for t, monthly, idx in daily_ease(p, n):
            if inside(t):
                cube[months.get_loc(t)] = step_sample(monthly, idx)
    else:
        adapter = {"monthly_files": monthly_files, "multi_month": multi_month}[p["adapter"]]
        regrid_note = f"trung bình bảo toàn diện tích về {RES}°, ô phủ < {MIN_COVER:.0%} → NaN"
        w = None
        for t, raw, a, lat, lon, aux in adapter(p):
            if not inside(t):
                continue
            if w is None:
                w, src_grid = weights(lat, lon), f"{len(lat)} × {len(lon)}, lat {lat[0]:g}…{lat[-1]:g}"
            cube[months.get_loc(t)] = step_regrid(clean_steps(raw, a, p, t, aux, n), w)
    filled = (~np.isnan(cube)).any(0)
    ds = xr.Dataset({name: (("time", "lat", "lon"), cube)}, coords={"time": months, "lat": LAT, "lon": LON})
    ds[name].attrs = {"units": p["units"], "source_dataset": p["set"], "source_variable": p["var"],
                      "processing": "fill→NaN; scale_factor/add_offset; đổi đơn vị; lọc miền vật lý "
                                    f"{p['valid']}; lọc chất lượng {p.get('qc') or 'không'}; {regrid_note}",
                      **({"note": p["note"]} if "note" in p else {})}
    path = OUT / "grid" / f"{name}.nc"
    path.parent.mkdir(parents=True, exist_ok=True)
    ds.to_netcdf(path, encoding={name: {"zlib": True, "complevel": 4}})
    v = cube[~np.isnan(cube)]
    q = np.percentile(v, [1, 50, 99]) if v.size else [np.nan] * 3
    stats = {"sản phẩm": name, "lưới gốc": src_grid, "tháng có dữ liệu": int((~np.isnan(cube)).any((1, 2)).sum()),
             "fill→NaN %": 100 * n["fill"] / n["cells"], "ngoài miền vật lý %": 100 * n["valid"] / n["cells"],
             "lọc chất lượng %": 100 * n["qc"] / n["cells"],
             "ô-tháng < MIN_OBS lượt %": 100 * n["few_obs"] / n["cell_months"] if n["cell_months"] else "",
             "ô 0,5° có dữ liệu %": 100 * filled.mean(),
             "đơn vị": p["units"], "p1": q[0], "p50": q[1], "p99": q[2]}
    print(json.dumps(stats, ensure_ascii=False, default=float), flush=True)
    return stats


def write_report(new):
    """Giữ dòng của sản phẩm chạy trước, thay dòng của sản phẩm vừa chạy."""
    store = REPORT.with_suffix(".json")
    rows = json.loads(store.read_text()) if store.exists() else {}
    rows.update({r["sản phẩm"]: r for r in new})
    store.parent.mkdir(exist_ok=True)
    store.write_text(json.dumps(rows, ensure_ascii=False, indent=1, default=float))
    fmt = lambda v: f"{v:.4g}" if isinstance(v, float) else str(v)   # noqa: E731
    tables = {}                                    # lưới và trạm có bộ cột khác nhau → mỗi bộ cột một bảng
    for r in rows.values():
        tables.setdefault(tuple(r), []).append(r)
    lines = ["# Kết quả làm sạch (sinh tự động bởi `preprocess/clean.py`)", "",
             f"Lưới: tỉ lệ % tính trên tổng số ô × tháng của lưới gốc trong {START[:4]}–{END[:4]}, phân vị tính trên "
             "lưới 0,5° sau "
             "xử lý. Trạm: tỉ lệ % tính trên tổng số dòng trạm × tháng, mỗi bước chỉ đếm dòng bước trước chưa loại."]
    for cols, rs in tables.items():
        lines += ["", "| " + " | ".join(cols) + " |", "|" + "---|" * len(cols),
                  *("| " + " | ".join(fmt(r[c]) for c in cols) + " |" for r in rs)]
    REPORT.write_text("\n".join(lines) + "\n")


def check():
    """Tự kiểm phần nội suy (chạy `clean.py --check`, vài giây, không cần dữ liệu)."""
    x = np.random.default_rng(0).random((len(LAT), len(LON)))
    assert np.allclose(step_regrid(x, weights(LAT, LON)), x), "lưới trùng lưới chung phải giữ nguyên"
    mlat, mlon = np.linspace(-90, 90, 361), np.arange(-180, 180, 0.625)        # lưới MERRA-2, tâm ô tại −180°
    assert np.allclose(step_regrid(np.full((361, 576), 7.0), weights(mlat, mlon)), 7), "hằng số phải giữ, đủ ô"
    half = np.where(np.arange(len(LON) * 2) % 2, np.nan, 1.0)[None].repeat(len(LAT) * 2, 0)
    assert np.isfinite(step_regrid(half, weights(LAT[0] - RES / 4 + np.arange(len(LAT) * 2) * RES / 2,
                                                 LON[0] - RES / 4 + np.arange(len(LON) * 2) * RES / 2))).all(), \
        "ô phủ đúng 50 % vẫn giữ"
    d = 36032.220840584                                  # EASE-Grid 2.0 toàn cầu 36 km: tâm ô x, y theo mét
    ex, ey = -17367530.44516 + d * (np.arange(964) + 0.5), 7314540.83063 - d * (np.arange(406) + 0.5)
    lat_ease = Transformer.from_crs(6933, 4326, always_xy=True).transform(*np.meshgrid(ex, ey))[1]
    got = step_sample(lat_ease, ease_sampler(ex, ey))
    near = np.abs(LAT) < 60        # trên 60° ô EASE 36 km cao tới ~1° vĩ độ nên sai số do kích thước ô, không do lỗi
    assert np.nanmax(np.abs(got[near] - LAT[near, None])) < 0.15, "SMAP: điểm mẫu phải rơi vào đúng ô EASE"
    print("check OK")


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        sys.exit(check())
    names = sys.argv[1:] or [k for k, p in PRODUCTS.items()
                             if any(RAW.glob(SETS[p["set"]][0] if p["set"] else "cdo_gsom/csv/*.csv"))]
    write_report([run(k) for k in names])
    print("ghi", REPORT)
