"""Bước 2c – kiểm chứng dữ liệu đã làm sạch (data/processed/) bằng bằng chứng ĐỘC LẬP với clean.py.
Không gọi hàm xử lý nào của clean.py (chỉ dùng chung vị trí file và khoảng thời gian trong eda.py); quy tắc làm sạch
được viết lại từ đặc tả trong preprocess/README.md bằng thư viện khác (xarray thay cho netCDF4 + ma trận trọng số).
  A. Tính lại từ file thô: số tháng; giá trị từng ô ở các tháng mẫu, gộp khối ô lồng nhau (IMERG 5×5, GLDAS/GPCC 2×2,
     CRU 1×1, SeaWiFS 6×6) với trọng số cos(vĩ độ); trung bình toàn cầu trước/sau. GSOM: lọc lại từ CSV gốc.
     SMAP: gộp tháng từ file ngày, gán ô EASE theo lat/lon NASA ghi trong file (khác cách lấy mẫu 4 × 4 của clean.py).
  B. So với giá trị tham chiếu đã công bố: nhiệt độ và lượng mưa trung bình toàn cầu, tốc độ ấm lên.
  C. So các nguồn độc lập với nhau: vệ tinh với trạm đo, mô hình với tái phân tích. Lệch 1 tháng phải làm tương quan
     giảm rõ (bắt lỗi lệch thời gian); bản đồ trung bình phải giống nhau (bắt lỗi lật trục, lệch kinh độ, sai đơn vị).
Ngưỡng đạt (CRITERIA) đặt trước khi chạy, không chỉnh theo kết quả.
Chạy:    .venv/bin/python preprocess/verify.py          (sau clean.py; vài phút)
Kết quả: reports/03_verification.md"""
import re
import sys
from pathlib import Path

import netCDF4
import numpy as np
import pandas as pd
import xarray as xr

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eda import END, RAW, ROOT, SETS, START  # noqa: E402

GRID, PQ = ROOT / "data" / "processed" / "grid", ROOT / "data" / "processed" / "stations" / "precip_gsom.parquet"
REPORT = ROOT / "reports" / "03_verification.md"
MONTHS = 6                      # số tháng rải đều (trong các tháng có dữ liệu) để tính lại mỗi sản phẩm
CRITERIA = {"khớp ô %": 99.9, "chênh TB MERRA-2 %": 0.1, "T2M toàn cầu °C": (13.5, 16.0),
            "xu hướng T2M °C/thập kỷ": (0.1, 0.45), "mưa IMERG toàn cầu mm/ngày": (2.5, 3.2),
            "r theo ô": 0.7, "r bản đồ": 0.9, "r giảm khi lệch 1 tháng": 0.1, "r trạm–IMERG": 0.6,
            "r SMAP tính lại": 0.9, "r GLDAS–SMAP": 0.4, "|chênh| Tair–T2M °C": 2.0}
days = lambda t: pd.Timestamp(t).days_in_month   # noqa: E731
# sản phẩm → (bộ dữ liệu trong eda.SETS, biến, đổi đơn vị, miền hợp lệ, số ô thô mỗi cạnh ô 0,5° | None = không lồng)
SPEC = {
    "precip_imerg": ("imerg_precip", "precipitation", lambda x, t: x * 24 * days(t), (0, None), 5),
    "precip_cru": ("cru_pre", "pre", None, (0, None), 1),
    "precip_gpcc": ("gpcc_precip", "precip", None, (0, None), 2),
    **{f"sm_{a}_{b}cm_gldas": (f"gldas_soilmoi{a}_{b}cm", f"SoilMoi{a}_{b}cm_inst",
                               (lambda k: lambda x, t: x / k)((b - a) * 10), (0, 0.95), 2)
       for a, b in [(0, 10), (10, 40), (40, 100), (100, 200)]},
    "rootmoist_gldas": ("gldas_rootmoist", "RootMoist_inst", None, (0, None), 2),
    "tair_gldas": ("gldas_tair_f", "Tair_f_inst", lambda x, t: x - 273.15, (-90, 60), 2),
    "evap_gldas": ("gldas_evap", "Evap_tavg", lambda x, t: x * 86400 * days(t), (None, None), 2),
    "chlor_a_seawifs": ("seawifs_chlor_a", "chlor_a", None, (0.001, 100), 6),
    "t2m_merra2": ("merra2_t2m", "T2M", lambda x, t: x - 273.15, (-90, 60), None),
}
FULL = xr.DataArray(np.full((360, 720), np.nan), dims=("lat", "lon"),
                    coords={"lat": np.arange(-89.75, 90, 0.5), "lon": np.arange(-179.75, 180, 0.5)})


def processed(name):
    return xr.open_dataset(GRID / f"{name}.nc")[name]


def open_raw(set_, names, t):
    """Các biến thô `names` của tháng t (xarray tự đổi fill → NaN), trục (lat tăng dần, lon); None nếu nguồn không
    có tháng đó."""
    pattern, _, date_re, _ = SETS[set_]
    if date_re:
        f = next((f for f in RAW.glob(pattern) if re.search(date_re, f.name).group(1)[:6] == f"{t:%Y%m}"), None)
        if f is None:
            return None
        ds = xr.open_dataset(f, group="Grid" if set_ == "imerg_precip" else None, decode_times=False)
    else:
        ds = next((d.sel(time=f"{t:%Y-%m}") for d in map(xr.open_dataset, sorted(RAW.glob(pattern)))
                   if f"{t:%Y-%m}" in d.time.dt.strftime("%Y-%m").values), None)
        if ds is None:
            return None
    return ds[names].squeeze(drop=True).transpose("lat", "lon").sortby("lat").astype("float64")


def raw_month(name, t):
    """Giá trị thô tháng t sau fill → đổi đơn vị → miền vật lý → cờ chất lượng, viết lại từ đặc tả."""
    set_, var, conv, (lo, hi), _ = SPEC[name]
    ds = open_raw(set_, [var, "stn"] if name == "precip_cru" else [var], t)
    if ds is None:
        return None
    da = conv(ds[var], t) if conv else ds[var]
    if lo is not None:
        da = da.where(da >= lo)
    if hi is not None:
        da = da.where(da <= hi)
    if name == "precip_cru":                       # stn = 0: không có trạm, giá trị là khí hậu trung bình
        da = da.where(ds["stn"] != 0)
    if name == "rootmoist_gldas":                  # ô băng: θ tầng 0–10 cm cùng tháng > 0,95
        theta = open_raw("gldas_soilmoi0_10cm", ["SoilMoi0_10cm_inst"], t)["SoilMoi0_10cm_inst"] / 100
        da = da.where(~(theta > 0.95))
    return da


def raw_months(set_):
    """Các tháng trong START…END mà file thô có."""
    pattern, _, date_re, _ = SETS[set_]
    if date_re:
        ms = {re.search(date_re, f.name).group(1)[:6] for f in RAW.glob(pattern)}
    else:
        ms = {m for f in RAW.glob(pattern) for m in xr.open_dataset(f).time.dt.strftime("%Y%m").values}
    return {m for m in ms if START[:4] + START[5:7] <= m <= END[:4] + END[5:7]}


def block_mean(da, k):
    """Trung bình khối k × k ô thô, trọng số cos(vĩ độ) (đúng tỉ lệ diện tích khi các hàng cách đều); khối có < 50 %
    diện tích hợp lệ → NaN. Trả mảng trên lưới 0,5° toàn cầu."""
    lat = da.lat.values.astype(float)               # float32 trong file: dựng lại tâm hàng cách đều bằng float64
    d = (lat[-1] - lat[0]) / (len(lat) - 1)
    lat = np.round(lat[0] - d / 2, 4) + d * (np.arange(len(lat)) + 0.5)
    w = xr.DataArray(np.cos(np.radians(lat)), dims="lat", coords={"lat": da.lat}) * xr.ones_like(da)
    c = dict(lat=k, lon=k)
    good, total = (w * da.notnull()).coarsen(c).sum(), w.coarsen(c).sum()
    out = ((da.fillna(0) * w).coarsen(c).sum() / good).where(good >= 0.5 * total * (1 - 1e-9))   # đúng 50 % → giữ
    out = out.assign_coords(lat=np.round(out.lat.values, 3), lon=np.round(out.lon.values, 3))
    return out.reindex_like(FULL, method="nearest", tolerance=1e-3).values


def wmean(a, lat):
    """Trung bình theo diện tích (cos vĩ độ) trên các ô có giá trị; NaN nếu không có ô nào."""
    w = np.cos(np.radians(lat))[:, None] * np.isfinite(a)
    return float(np.nansum(a * w) / w.sum()) if w.sum() else np.nan


def check_grid(name):
    """A: số tháng (tháng thô có mà sau xử lý rỗng thì tính lại cũng phải rỗng); từng ô của các tháng mẫu; trung bình
    toàn cầu trước/sau."""
    p = processed(name)
    have = p.notnull().any(("lat", "lon")).values
    got_months = {f"{t:%Y%m}" for t in pd.to_datetime(p.time.values[have])}
    k = SPEC[name][4]
    n = bad = 0
    gm = []
    for t in pd.to_datetime(p.time.values[have][np.linspace(0, have.sum() - 1, MONTHS).astype(int)]):
        r, got = raw_month(name, t), p.sel(time=t).values
        gm.append((wmean(r.values, r.lat.values), wmean(got, p.lat.values)))
        if k is None:
            continue
        exp = block_mean(r, k)
        same = (np.isnan(exp) & np.isnan(got)) | np.isclose(exp, got, rtol=1e-4, atol=1e-6)
        n, bad = n + same.size, bad + int((~same).sum())
    raw_ms = raw_months(SPEC[name][0])
    empty = sorted(raw_ms - got_months)
    empty_ok = k is not None and all(np.isnan(block_mean(raw_month(name, pd.Timestamp(m + "01")), k)).all()
                                     for m in empty)
    a, b = np.nanmean([x for x, _ in gm]), np.nanmean([y for _, y in gm])
    row = {"sản phẩm": name, "tháng thô / sau xử lý": f"{len(raw_ms)} / {len(got_months)}" + "".join(
               f" ({m[:4]}-{m[4:]} rỗng sau ngưỡng 50 %, tính lại cũng rỗng)" if empty_ok else f" (thiếu {m})"
               for m in empty),
           "tháng tính lại": len(gm), "ô so": n, "ô lệch": bad if n else "",
           "khớp ô %": 100 * (n - bad) / n if n else "", "TB toàn cầu thô": a, "TB toàn cầu sau xử lý": b,
           "chênh TB %": abs(b - a) / abs(a) * 100}
    good = got_months <= raw_ms and (not empty or empty_ok) and (row["khớp ô %"] >= CRITERIA["khớp ô %"] if n else
                                     row["chênh TB %"] <= CRITERIA["chênh TB MERRA-2 %"])
    row["kết luận"] = "đạt" if good else "**KHÔNG ĐẠT**"
    return row


def check_gsom(rng):
    """A: lọc lại 300 trạm ngẫu nhiên từ CSV gốc theo đặc tả, so từng dòng với parquet."""
    st = pd.read_csv(RAW / "cdo_gsom" / "stations.csv")
    ids = [i for i in st.id[st.has_gsom] if (RAW / "cdo_gsom" / "csv" / f"{i}.csv").exists()]
    ids = list(rng.choice(ids, 300, replace=False))
    exp = []
    for sid in ids:
        df = pd.read_csv(RAW / "cdo_gsom" / "csv" / f"{sid}.csv", dtype=str)
        if "PRCP" not in df:
            continue
        df = df[(df.DATE >= START[:7]) & (df.DATE <= END[:7])]
        a = df.PRCP_ATTRIBUTES.fillna("").str.split(",")          # số ngày thiếu, cờ đo, cờ chất lượng, nguồn
        part = lambda i: a.str[i].fillna("")                       # noqa: E731
        v = pd.to_numeric(df.PRCP, errors="coerce")
        keep = v.between(0, 9300) & part(2).eq("") & part(0).isin(["", "0"]) & part(3).ne("S")
        exp.append(pd.DataFrame({"station": sid, "time": pd.to_datetime(df.DATE[keep] + "-01"), "e": v[keep]}))
    exp = pd.concat(exp).astype({"time": "datetime64[ns]"})
    got = pd.read_parquet(PQ, filters=[("station", "in", ids)])[["station", "time", "precip_gsom"]]
    got = got.astype({"station": str, "time": "datetime64[ns]"})
    m = exp.merge(got, on=["station", "time"], how="outer")
    bad = int((m.e.isna() | m.precip_gsom.isna() | ~np.isclose(m.e, m.precip_gsom, atol=0.01)).sum())
    return {"trạm so": len(ids), "dòng tính lại": len(exp), "dòng trong parquet": len(got), "dòng lệch": bad,
            "kết luận": "đạt" if bad == 0 else "**KHÔNG ĐẠT**"}


def check_smap(months=("2016-07", "2020-01", "2024-07")):
    """A: gộp tháng từ file ngày (AM + PM, đặc tả: miền 0,02–0,5, bit 0 cờ = 0, ≥ 5 lượt), gán ô EASE vào ô 0,5° theo
    lat/lon NASA ghi trong file, trung bình các ô EASE rơi vào cùng ô 0,5°; so với file đã xử lý."""
    p = processed("sm_surface_smap")
    rows = []
    for m in months:
        files = [f for f in RAW.glob("smap/*/*.nc4") if f"_{m.replace('-', '')}" in f.name]
        if not files or not p.sel(time=f"{m}-01").notnull().any():
            continue
        tot = cnt = 0
        lat = lon = np.full((406, 964), -999.0)
        for f in files:
            with netCDF4.Dataset(f) as d:
                d.set_auto_maskandscale(False)
                for g, s in (("Soil_Moisture_Retrieval_Data_AM", ""), ("Soil_Moisture_Retrieval_Data_PM", "_pm")):
                    sm, fl = d[g][f"soil_moisture{s}"][:], d[g][f"retrieval_qual_flag{s}"][:]
                    ok = (sm >= 0.02) & (sm <= 0.5) & ((fl & 1) == 0)
                    tot, cnt = tot + np.where(ok, sm, 0), cnt + ok
                    lat = np.where(ok, d[g][f"latitude{s}"][:], lat)
                    lon = np.where(ok, d[g][f"longitude{s}"][:], lon)
        use = cnt >= 5
        exp = pd.DataFrame({"i": ((lat[use] + 90) // 0.5).astype(int), "j": ((lon[use] + 180) // 0.5).astype(int),
                            "v": (tot / np.maximum(cnt, 1))[use]}).groupby(["i", "j"]).v.mean()
        got = p.sel(time=f"{m}-01").values[exp.index.get_level_values(0), exp.index.get_level_values(1)]
        both = np.isfinite(got)
        r = np.corrcoef(exp.values[both], got[both])[0, 1]
        rows.append({"tháng": m, "ô so": int(both.sum()), "r": r,
                     "trung vị |chênh| m³/m³": float(np.median(np.abs(exp.values[both] - got[both]))),
                     "kết luận": "đạt" if r >= CRITERIA["r SMAP tính lại"] else "**KHÔNG ĐẠT**"})
    return rows


def cell_corr(a, b, shift=0, min_n=24):
    """Trung vị tương quan theo thời gian của từng ô (ô có ≥ min_n tháng chung). shift: a(t + shift) với b(t)."""
    if shift:
        a, b = a[shift:], b[:-shift]
    a, b = a.reshape(len(a), -1), b.reshape(len(b), -1)
    m = np.isfinite(a) & np.isfinite(b)
    keep = m.sum(0) >= min_n
    a, b, m = a[:, keep].astype(float), b[:, keep].astype(float), m[:, keep]
    dev = lambda x: np.where(m, x - np.where(m, x, 0).sum(0) / m.sum(0), 0)   # noqa: E731
    a, b = dev(a), dev(b)
    with np.errstate(invalid="ignore", divide="ignore"):
        r = (a * b).sum(0) / np.sqrt((a * a).sum(0) * (b * b).sum(0))
    return float(np.nanmedian(r)), int(keep.sum())


def map_corr(a, b):
    ok = np.isfinite(a) & np.isfinite(b)
    return float(np.corrcoef(a[ok], b[ok])[0, 1])


def station_corr(pq, cube, shift=0):
    """Trung vị tương quan giữa trạm GSOM và ô IMERG chứa trạm (trạm có ≥ 60 tháng chung). shift như cell_corr."""
    t0 = pd.Timestamp(cube.time.values[0])
    ti = ((pq.time.dt.year - t0.year) * 12 + pq.time.dt.month - t0.month + shift).to_numpy()
    i = ((pq.lat.to_numpy() + 90) // 0.5).astype(int).clip(0, 359)
    j = ((pq.lon.to_numpy() + 180) // 0.5).astype(int).clip(0, 719)
    ok = (ti >= 0) & (ti < cube.sizes["time"])
    d = pd.DataFrame({"s": pq.station.to_numpy()[ok], "a": pq.precip_gsom.to_numpy()[ok].astype(float),
                      "b": cube.values[ti[ok], i[ok], j[ok]].astype(float)}).dropna()
    r = d.groupby("s", observed=True).filter(lambda g: len(g) >= 60).groupby("s", observed=True) \
        .apply(lambda g: np.corrcoef(g.a, g.b)[0, 1], include_groups=False)
    return float(r.median()), len(r)


def verdict(v, c):
    ok = c[0] <= v <= c[1] if isinstance(c, tuple) else v >= c
    return "đạt" if ok else "**KHÔNG ĐẠT**"


def md(rows):
    cols = list(rows[0])
    f = lambda v: f"{v:.4g}" if isinstance(v, (float, np.floating)) else str(v)   # noqa: E731
    return ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols),
            *("| " + " | ".join(f(r[c]) for c in cols) + " |" for r in rows), ""]


def part_b():
    t2m, pr = processed("t2m_merra2"), processed("precip_imerg")
    lat = t2m.lat.values
    gm = pd.Series([wmean(m, lat) for m in t2m.values], index=pd.to_datetime(t2m.time.values)).dropna()
    yearly = gm.groupby(gm.index.year).mean()
    yearly = yearly[gm.groupby(gm.index.year).size() == 12]            # chỉ năm đủ 12 tháng
    slope = np.polyfit(yearly.index, yearly.values, 1)[0] * 10
    pmean = np.nanmean([wmean(m, lat) / days(t) for m, t in zip(pr.values, pr.time.values)])
    return [{"đại lượng": "T2M trung bình toàn cầu °C (MERRA-2)", "giá trị": gm.mean(),
             "tham chiếu": "NOAA: TB thế kỷ 20 là 13,9 °C, 2001–2025 ấm hơn 0,6–1,3 °C", "ngưỡng": "13,5–16",
             "kết luận": verdict(gm.mean(), CRITERIA["T2M toàn cầu °C"])},
            {"đại lượng": f"xu hướng T2M {yearly.index[0]}–{yearly.index[-1]} °C/thập kỷ", "giá trị": slope,
             "tham chiếu": "IPCC AR6, Copernicus: ~0,2–0,3 °C/thập kỷ gần đây", "ngưỡng": "0,1–0,45",
             "kết luận": verdict(slope, CRITERIA["xu hướng T2M °C/thập kỷ"])},
            {"đại lượng": "mưa IMERG trung bình toàn cầu mm/ngày", "giá trị": pmean,
             "tham chiếu": "GPCP: ~2,7 mm/ngày; vệ tinh thường cao hơn một chút", "ngưỡng": "2,5–3,2",
             "kết luận": verdict(pmean, CRITERIA["mưa IMERG toàn cầu mm/ngày"])}]


def part_c():
    rows = []
    pr, gp = processed("precip_imerg"), processed("precip_gpcc")
    gp = gp.isel(time=gp.notnull().any(("lat", "lon")).values)
    im = pr.sel(time=gp.time)
    r0, n = cell_corr(im.values, gp.values)
    r1, _ = cell_corr(im.values, gp.values, 1)
    rows += [{"phép so": "IMERG – GPCC, tương quan theo ô", "giá trị": r0, "số ô/trạm": n,
              "kết luận": verdict(r0, CRITERIA["r theo ô"])},
             {"phép so": "… cùng phép so, lệch 1 tháng", "giá trị": r1, "số ô/trạm": "",
              "kết luận": f"giảm {r0 - r1:.2f}: " + verdict(r0 - r1, CRITERIA["r giảm khi lệch 1 tháng"])}]
    for other in ("precip_gpcc", "precip_cru"):
        r = map_corr(pr.mean("time").values, processed(other).mean("time").values)
        rows.append({"phép so": f"IMERG – {other.split('_')[1].upper()}, bản đồ mưa trung bình", "giá trị": r,
                     "số ô/trạm": "", "kết luận": verdict(r, CRITERIA["r bản đồ"])})
    pq = pd.read_parquet(PQ)
    s0, n = station_corr(pq, pr)
    s1, _ = station_corr(pq, pr, 1)
    rows += [{"phép so": "trạm GSOM – ô IMERG chứa trạm", "giá trị": s0, "số ô/trạm": n,
              "kết luận": verdict(s0, CRITERIA["r trạm–IMERG"])},
             {"phép so": "… cùng phép so, lệch 1 tháng", "giá trị": s1, "số ô/trạm": "",
              "kết luận": f"giảm {s0 - s1:.2f}: " + verdict(s0 - s1, CRITERIA["r giảm khi lệch 1 tháng"])}]
    ta, t2 = processed("tair_gldas").mean("time").values, processed("t2m_merra2").mean("time").values
    r, bias = map_corr(ta, t2), float(np.nanmean(ta - t2))
    rows += [{"phép so": "GLDAS Tair – MERRA-2 T2M, bản đồ trung bình", "giá trị": r, "số ô/trạm": "",
              "kết luận": verdict(r, CRITERIA["r bản đồ"])},
             {"phép so": "GLDAS Tair − MERRA-2 T2M, chênh trung bình °C (đất liền)", "giá trị": bias, "số ô/trạm": "",
              "kết luận": verdict(abs(bias), (0, CRITERIA["|chênh| Tair–T2M °C"]))}]
    if (GRID / "sm_surface_smap.nc").exists():
        sp = processed("sm_surface_smap")
        sp = sp.isel(time=sp.notnull().any(("lat", "lon")).values)
        r, n = cell_corr(processed("sm_0_10cm_gldas").sel(time=sp.time).values, sp.values)
        rows.append({"phép so": "GLDAS 0–10 cm – SMAP, tương quan theo ô", "giá trị": r, "số ô/trạm": n,
                     "kết luận": verdict(r, CRITERIA["r GLDAS–SMAP"])})
    return rows


if __name__ == "__main__":
    out = ["# Kiểm chứng dữ liệu đã làm sạch (sinh tự động bởi `preprocess/verify.py`)", "",
           f"Dữ liệu `data/processed/` khoảng {START[:7]} … {END[:7]}. Ngưỡng đạt đặt trước khi chạy (`CRITERIA` "
           "trong `verify.py`); cách làm từng phép thử: `preprocess/README.md` mục 7.", "",
           "## A. Tính lại từ file thô, độc lập với `clean.py`", ""]
    out += md([check_grid(n) for n in SPEC if (GRID / f"{n}.nc").exists()])
    out += ["_tháng thô / sau xử lý_: số tháng file thô có trong khoảng và số tháng có dữ liệu sau xử lý. _ô so_: mọi"
            " ô 0,5° toàn cầu của các tháng mẫu, kể cả ô NaN (NaN phải ở đúng chỗ); khớp = lệch tương đối ≤ 1e-4. "
            "MERRA-2 có lưới không lồng vào 0,5° nên chỉ so trung bình toàn cầu (ngưỡng 0,1 %). Với lưới chỉ có đất "
            "liền hoặc chỉ có biển, chênh trung bình toàn cầu đến từ các ô ven bờ bị bỏ theo ngưỡng 50 %, chỉ để tham"
            " khảo.", ""]
    if PQ.exists():
        out += ["GSOM (300 trạm ngẫu nhiên, lọc lại từ CSV gốc, so từng dòng trạm × tháng):", ""]
        out += md([check_gsom(np.random.default_rng(0))])
    if (GRID / "sm_surface_smap.nc").exists():
        out += ["SMAP (gộp lại từ file ngày, gán ô theo lat/lon NASA; khác cách lấy mẫu của `clean.py` nên không "
                "khớp tuyệt đối, so bằng tương quan):", ""]
        out += md(check_smap())
    out += ["## B. So với giá trị tham chiếu đã công bố", ""] + md(part_b())
    out += ["## C. So các nguồn độc lập với nhau", "",
            "Nguồn khác nhau đo cùng đại lượng phải khớp nhau; nếu xử lý lật trục, lệch kinh độ hay lệch tháng thì "
            "tương quan sụp. Dòng _lệch 1 tháng_ là đối chứng: tương quan phải giảm rõ.", ""] + md(part_c())
    REPORT.write_text("\n".join(out))
    print("\n".join(out))
    print("ghi", REPORT)
