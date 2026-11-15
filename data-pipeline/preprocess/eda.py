"""Bước 2a – EDA (khám phá dữ liệu) trên data/raw/, đọc giá trị THÔ (không mask, không scale) để biết mỗi nguồn cần
xử lý gì trước khi đưa về schema chung: độ phủ thời gian, lưới, thứ tự trục, kiểu dữ liệu, giá trị fill / scale / miền
hợp lệ, tỉ lệ fill, phân bố giá trị, cờ chất lượng.
Chạy:    .venv/bin/python preprocess/eda.py [TÊN ...]         (mặc định: mọi nguồn trong SETS đã có dữ liệu)
Kết quả: reports/01_eda.md (ghi đè). Thống kê giá trị lấy trên SAMPLE bước thời gian rải đều, độ phủ tính trên mọi file."""
import re
import sys
from pathlib import Path

import netCDF4
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW, REPORT = ROOT / "data" / "raw", ROOT / "reports" / "01_eda.md"
START, END = "2001-01-01", "2025-12-01"     # khoảng phân tích chung (tháng đầu, tháng cuối); clean.py dùng chung
SAMPLE = 12

G = "giovanni/{}/*.nc4"
SETS = {  # tên → (glob trong data/raw, [biến, có thể kèm nhóm "nhóm/biến"], regex ngày trong tên file | None, bước)
    "imerg_precip": (G.format("GPM_3IMERGM_07_precipitation"), ["Grid/precipitation"], r"\.(\d{8})-S", "MS"),
    **{f"gldas_{v.removesuffix('_inst').removesuffix('_tavg').lower()}": (
        G.format(f"GLDAS_NOAH025_M_2_1_{v}"), [v], r"\.A(\d{6})\.", "MS")
       for v in ["SoilMoi0_10cm_inst", "SoilMoi10_40cm_inst", "SoilMoi40_100cm_inst", "SoilMoi100_200cm_inst",
                 "RootMoist_inst", "Tair_f_inst", "Evap_tavg", "PotEvap_tavg"]},
    "merra2_t2m": (G.format("M2IMNXASM_5_12_4_T2M"), ["T2M"], r"\.(\d{6})_T2M", "MS"),
    "smap": ("smap/*/*.nc4", ["Soil_Moisture_Retrieval_Data_AM/soil_moisture",
                              "Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag",
                              "Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm",
                              "Soil_Moisture_Retrieval_Data_PM/retrieval_qual_flag_pm"], r"_(\d{8})_R", "D"),
    "cru_pre": ("knmi_cru_gpcc/cru_ts4.10.*.pre.dat.nc", ["pre", "stn"], None, "MS"),
    "gpcc_precip": ("knmi_cru_gpcc/full_data_monthly_v2022_*_025.nc", ["precip", "numgauge"], None, "MS"),
    "seawifs_chlor_a": ("seawifs/*.L3m.MO.CHL.chlor_a.9km.nc", ["chlor_a"], r"\.(\d{8})_", "MS"),
}
AUX = {  # biến phụ → biến chính: phân bố biến phụ được tính trên các ô biến chính hợp lệ
    "Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag": "Soil_Moisture_Retrieval_Data_AM/soil_moisture",
    "Soil_Moisture_Retrieval_Data_PM/retrieval_qual_flag_pm": "Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm",
    "stn": "pre", "numgauge": "precip"}
SKIP_ATTRS = {"long_name", "standard_name", "comment", "LongName", "DimensionNames", "Units", "origname",
              "fullnamepath", "coordinates", "bounds", "vmin", "vmax", "cell_methods", "reference", "display_scale",
              "display_min", "display_max", "description"}


def files_and_times(pattern, date_re):
    """[(file, chỉ số time trong file | None)] và thời điểm tương ứng."""
    files = sorted(RAW.glob(pattern))
    if date_re:
        # YYYYMMDD hoặc YYYYMM; tên file Harmony bắt đầu bằng số job nên phải sắp lại theo ngày
        stamped = sorted((re.search(date_re, f.name).group(1), f) for f in files)
        return [(f, None) for _, f in stamped], [pd.Timestamp(s if len(s) == 8 else s + "01") for s, _ in stamped]
    pairs, times = [], []                          # file nhiều bước thời gian: đọc trục time
    for f in files:
        with netCDF4.Dataset(f) as d:
            t = d["time"]
            for i, v in enumerate(netCDF4.num2date(t[:], t.units, getattr(t, "calendar", "standard"))):
                pairs.append((f, i))
                times.append(pd.Timestamp(v.year, v.month, v.day))
    return pairs, times


def coverage(times, freq):
    t = pd.DatetimeIndex(times)
    if freq == "MS":
        t = t.to_period("M").to_timestamp()
    full = pd.date_range(t.min(), t.max(), freq=freq)
    missing, dup = full.difference(t), t[t.duplicated()].unique()
    shown = ", ".join(f"{x:%Y-%m-%d}" for x in missing[:12]) + (" …" if len(missing) > 12 else "")
    return (f"{t.min():%Y-%m-%d} → {t.max():%Y-%m-%d}; {len(t)} bước / {len(full)} kỳ vọng; "
            f"thiếu {len(missing)}{': ' + shown if len(missing) else ''}; trùng {len(dup)}")


def attrs(var):
    return {k: (v.tolist() if isinstance(v, np.ndarray) else v) for k, v in
            ((k, var.getncattr(k)) for k in var.ncattrs()) if k not in SKIP_ATTRS}


def axis_info(var):
    out, grp = [], var.group()
    for dim in var.dimensions:
        c = grp.variables.get(dim) or grp.parent and grp.parent.variables.get(dim)
        size = var.shape[var.dimensions.index(dim)]
        if c is None or c.ndim != 1 or size < 2:
            out.append(f"{dim}={size}")
            continue
        v = c[:]
        out.append(f"{dim}={size} [{float(v[0]):g} … {float(v[-1]):g}, bước {float(v[1] - v[0]):g}]")
    return ", ".join(out)


def value_stats(arrs, a):
    x = np.concatenate([np.ma.getdata(v).ravel() for v in arrs])
    bad = np.zeros(x.size, bool)
    for k in ("_FillValue", "missing_value"):
        if k in a:
            bad |= x == np.asarray(a[k], dtype=x.dtype).ravel()[0]
    nan = np.isnan(x) if x.dtype.kind == "f" else np.zeros(x.size, bool)
    good = x[~bad & ~nan]
    lo, hi = a["valid_range"] if "valid_range" in a else (a.get("valid_min"), a.get("valid_max"))
    s = {"fill %": 100 * bad.mean(), "NaN %": 100 * nan.mean()}
    if lo is not None and hi is not None and abs(float(hi)) < 1e10:
        s["ngoài valid range %"] = 100 * ((good < lo) | (good > hi)).sum() / x.size
    if good.size:
        q = np.percentile(good, [0, 1, 50, 99, 100])
        s |= {"min": q[0], "p1": q[1], "p50": q[2], "p99": q[3], "max": q[4], "âm %": 100 * (good < 0).mean()}
    return s, x, bad | nan


def md_table(rows):
    """Bảng Markdown từ list[dict] (số in 4 chữ số có nghĩa)."""
    cols = list(dict.fromkeys(k for r in rows for k in r))
    cell = lambda v: f"{v:.4g}" if isinstance(v, (float, np.floating)) else str(v)  # noqa: E731
    return "\n".join(["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
                     + ["| " + " | ".join(cell(r.get(c, "")) for c in cols) + " |" for r in rows])


def flag_table(flag, sm_bad):
    """Phân bố giá trị cờ ở các ô có độ ẩm đất hợp lệ."""
    vals, counts = np.unique(flag[~sm_bad], return_counts=True)
    top = sorted(zip(counts, vals), reverse=True)[:6]
    return ", ".join(f"{int(v)}: {100 * c / counts.sum():.1f} %" for c, v in top)


def eda_grid(name, pattern, variables, date_re, freq):
    pairs, times = files_and_times(pattern, date_re)
    lines = [f"## {name}", "", f"- File: `data/raw/{pattern}` ({len({f for f, _ in pairs})} file)",
             f"- Thời gian: {coverage(times, freq)}"]
    idx = np.unique(np.linspace(0, len(pairs) - 1, min(SAMPLE, len(pairs))).astype(int))
    with netCDF4.Dataset(pairs[0][0]) as d:
        for vpath in variables:
            v = d[vpath]
            lines.append(f"- `{vpath}` {v.dtype}, trục ({axis_info(v)}); thuộc tính: `{attrs(v)}`")
    rows, keep = [], {}
    for vpath in variables:
        arrs, a = [], None
        for f, i in (pairs[k] for k in idx):
            with netCDF4.Dataset(f) as d:
                d.set_auto_maskandscale(False)
                v = d[vpath]
                a = a or attrs(v)
                arrs.append(v[i] if i is not None else v[:])
        s, x, bad = value_stats(arrs, a)
        keep[vpath] = (x, bad)
        if vpath not in AUX:                     # ô hợp lệ ở mọi bước mẫu nhưng không đổi theo thời gian (vd. băng)
            grid = x.reshape(len(arrs), -1)
            ok = ~bad.reshape(len(arrs), -1).any(0)
            const = grid[:, ok].std(0) == 0
            vals, counts = np.unique(grid[0, ok][const], return_counts=True)
            s["hằng số theo t %"] = 100 * const.mean() if ok.any() else np.nan
            s["giá trị hằng hay gặp"] = ", ".join(f"{v:g}" for v in vals[np.argsort(-counts)][:3])
        rows.append({"biến": vpath, **s})
    lines += ["", f"Giá trị thô trên {len(idx)} bước thời gian rải đều ({', '.join(f'{times[k]:%Y-%m-%d}' for k in idx)}):",
              "", md_table(rows)]
    for aux in (v for v in variables if v in AUX):  # cờ chất lượng, số trạm: phân bố trên ô biến chính hợp lệ
        lines.append(f"\nPhân bố `{aux}` ở ô có `{AUX[aux]}` hợp lệ (giá trị: tỉ lệ): "
                     f"{flag_table(keep[aux][0], keep[AUX[aux]][1])}")
    return lines


def gsom_rows(cols=("STATION", "DATE", "PRCP", "PRCP_ATTRIBUTES")):
    """Mọi CSV trạm GSOM ghép thành một bảng (chuỗi, chưa đổi kiểu), chỉ giữ tháng START … END."""
    frames = []
    for f in sorted((RAW / "cdo_gsom" / "csv").glob("*.csv")):
        df = pd.read_csv(f, usecols=lambda c: c in cols, dtype=str)
        frames.append(df[(df.DATE >= START[:7]) & (df.DATE <= END[:7])])
    return pd.concat(frames, ignore_index=True)


def eda_gsom():
    st = pd.read_csv(RAW / "cdo_gsom" / "stations.csv")
    df = gsom_rows()
    prcp = pd.to_numeric(df["PRCP"], errors="coerce")
    months = prcp.notna().groupby(df.STATION).sum()
    # PRCP_ATTRIBUTES = a,M,Q,S (tài liệu GSOM của NCEI): số ngày thiếu (1–5), cờ đo (T vết, a có ngày thiếu),
    # cờ chất lượng GHCN-Daily, mã nguồn (S = suy ra từ bản tin synop GTS, NCEI khuyên dùng thận trọng với mưa)
    attr = df.loc[prcp.notna(), "PRCP_ATTRIBUTES"].fillna(",,,").str.split(",", expand=True).reindex(columns=range(4))
    attr.columns = ["a", "M", "Q", "S"]
    src = attr.S.fillna("")
    only_s = src.eq("S").groupby(df.loc[prcp.notna(), "STATION"]).all()
    q = np.percentile(prcp.dropna(), [0, 1, 50, 99, 99.99, 100])
    period, n_months = f"{START[:4]}–{END[:4]}", len(pd.date_range(START, END, freq="MS"))
    share = lambda s: ", ".join(f"{k or 'rỗng'}: {100 * v:.1f} %" for k, v in s.value_counts(normalize=True).head(8).items())  # noqa: E731
    return ["## gsom_prcp (trạm GHCN)", "",
            f"- `stations.csv`: {len(st)} trạm có PRCP trong {period} theo kiểm kê GHCN-Daily; "
            f"{int(st.has_gsom.sum())} có file GSOM",
            f"- Dòng {period}: {len(df)}; PRCP trống {100 * prcp.isna().mean():.1f} %",
            f"- Số tháng có PRCP mỗi trạm (trên {n_months}): trung vị {months.median():.0f}; ≥ 240: {(months >= 240).sum()} "
            f"trạm; ≥ 180: {(months >= 180).sum()}; 0: {(months == 0).sum()}",
            f"- PRCP (mm/tháng) min/p1/p50/p99/p99,99/max: {' / '.join(f'{v:.1f}' for v in q)}; âm: {(prcp < 0).sum()}",
            f"- `PRCP_ATTRIBUTES` (trên dòng có PRCP): số ngày thiếu > 0 ở "
            f"{100 * pd.to_numeric(attr.a, errors='coerce').gt(0).mean():.1f} % (tối đa "
            f"{pd.to_numeric(attr.a, errors='coerce').max():.0f}); cờ đo: {share(attr.M.fillna(''))}; "
            f"cờ chất lượng: {share(attr.Q.fillna(''))}",
            f"- Mã nguồn: {share(src)}; {only_s.sum()} trạm chỉ có nguồn `S` (synop GTS)"]


if __name__ == "__main__":
    wanted = sys.argv[1:] or [*SETS, "gsom_prcp"]
    out = ["# EDA dữ liệu thô (sinh tự động bởi `preprocess/eda.py`)", "",
           "Giá trị thô: chưa áp `scale_factor`, chưa đổi fill thành NaN.", ""]
    for name in wanted:
        if name == "gsom_prcp":
            ready = (RAW / "cdo_gsom" / "stations.csv").exists()
            out += (eda_gsom() if ready else ["## gsom_prcp", "", "_Chưa có dữ liệu._"]) + [""]
            continue
        pattern, variables, date_re, freq = SETS[name]
        if not any(RAW.glob(pattern)):
            out += [f"## {name}", "", f"_Chưa có dữ liệu `data/raw/{pattern}`._", ""]
            continue
        print("EDA", name, flush=True)
        out += eda_grid(name, pattern, variables, date_re, freq) + [""]
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text("\n".join(out))
    print("ghi", REPORT)
