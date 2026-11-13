"""Adapter Giovanni (docs/02 §4): trung bình vùng qua Harmony, LƯỚI TOÀN CẦU qua Harmony HOSS (§4.6), chuỗi tại điểm qua /timeseries,
parse CSV, assert + đổi đơn vị, ra bảng chung. Giovanni đã xử lý fill/QA/trung bình vùng."""
import io
import json
import os
import time as _time
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests

from pipeline.schema import FetchRequest, Region, request_id, rows
from pipeline.units import GIOVANNI_UNITS, convert_units, giovanni_unit

GIOVANNI = "https://api.giovanni.earthdata.nasa.gov"

CONCEPT_IDS = {"GPM_3IMERGM.07": "C2723754851-GES_DISC",      # ✅ tra CMR 13/11
               "GLDAS_NOAH025_M.2.1": "C1342986036-GES_DISC",
               "M2IMNXASM.5.12.4": "C1276812823-GES_DISC"}

# ID biến Giovanni (✅ /configured-variables/) → (tên biến chuẩn trong docs/01 mục 4, dataset)
VARIABLES = {
    "GPM_3IMERGM_07_precipitation": ("precip", "GPM_3IMERGM.07"),
    "GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst": ("soil_moisture", "GLDAS_NOAH025_M.2.1"),
    "GLDAS_NOAH025_M_2_1_Tair_f_inst": ("tair_land", "GLDAS_NOAH025_M.2.1"),
    "GLDAS_NOAH025_M_2_1_Evap_tavg": ("evap_gldas", "GLDAS_NOAH025_M.2.1"),
    "M2IMNXASM_5_12_4_T2M": ("t2m", "M2IMNXASM.5.12.4"),
}


# ID biến Giovanni → tên biến trong file gốc, dùng cho HOSS (✅ Harmony /capabilities 13/11)
HOSS_VARIABLES = {
    "GPM_3IMERGM_07_precipitation": "Grid/precipitation",
    "GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst": "SoilMoi0_10cm_inst",
    "GLDAS_NOAH025_M_2_1_Tair_f_inst": "Tair_f_inst",
    "GLDAS_NOAH025_M_2_1_Evap_tavg": "Evap_tavg",
    "M2IMNXASM_5_12_4_T2M": "T2M",
}


def _auth():
    from appeears import load_env                 # cùng .env với AppEEARS (EARTHDATA_USER / EARTHDATA_PASS)
    load_env()
    return os.environ["EARTHDATA_USER"], os.environ["EARTHDATA_PASS"]


# ── §4.3 Trung bình vùng (Harmony) ───────────────────────────────────────────

def harmony_area_csv(client, dataset, var_id, region, start, end, out_dir: Path) -> tuple[Path, str]:
    from harmony import BBox, Collection, Request
    w, s, e, n = region.bbox
    req = Request(collection=Collection(id=CONCEPT_IDS[dataset]),
                  temporal={"start": datetime.fromisoformat(start), "stop": datetime.fromisoformat(end)},
                  spatial=BBox(w, s, e, n), variables=[var_id], format="text/csv", average="area")
    assert req.is_valid(), "Request Harmony không hợp lệ"
    job_id = client.submit(req)                   # ✅ chữ ký kiểm tra trên harmony-py 1.8.0
    client.wait_for_processing(job_id, show_progress=False)
    files = [f.result() for f in client.download_all(job_id, directory=str(out_dir), overwrite=True)]
    return Path(files[0]), job_id


# ── §4.6 Lưới toàn cầu (HOSS qua Harmony) → cube 1° ──────────────────────────

def harmony_grid(client, var_id, start, end, out_dir: Path) -> tuple[list[Path], str]:
    """sds/HOSS-geographic: lưới gốc TOÀN CẦU của một biến (không bbox = cả Trái Đất), mỗi tháng một NetCDF.
    Cần tài khoản đã authorize app GES DISC (04, T-1), nếu không HOSS báo 403. out_dir phải tồn tại trước."""
    from harmony import Collection, Request
    _, dataset = VARIABLES[var_id]
    req = Request(collection=Collection(id=CONCEPT_IDS[dataset]),
                  temporal={"start": datetime.fromisoformat(start), "stop": datetime.fromisoformat(end)},
                  variables=[HOSS_VARIABLES[var_id]], format="application/x-netcdf4")
    assert req.is_valid(), "Request Harmony không hợp lệ"
    job_file = out_dir / "job_id.txt"                # lưu ngay → chạy lại thì nối tiếp job đang chạy, không gửi lại
    if job_file.exists():
        job_id = job_file.read_text().strip()
    else:
        job_id = client.submit(req)
        job_file.write_text(job_id)
    wait_job(client, job_id)
    for k in range(5):                               # download_all vẫn hỏi /jobs/status một lần → có thể dính lỗi tạm thời
        try:
            return [Path(f.result()) for f in client.download_all(job_id, directory=str(out_dir), overwrite=False)], job_id
        except Exception as e:
            if "Invalid format for Job ID" not in str(e) or k == 4:
                raise
            _time.sleep(10)


def wait_job(client, job_id, every=30):
    """Tự hỏi trạng thái qua client.status (/jobs/<id>). ✅ 13/11: wait_for_processing của harmony-py hỏi /jobs/status,
    Harmony thỉnh thoảng trả 400 "Invalid format for Job ID 'status'" → job dài chắc chắn dính lỗi."""
    while True:
        try:
            s = client.status(job_id)
        except Exception as e:                       # lỗi mạng / máy chủ tạm thời → hỏi lại sau
            print("status lỗi tạm thời:", str(e)[:120], flush=True)
            s = {}
        if s.get("status") in ("successful", "complete_with_errors"):
            return s
        if s.get("status") in ("failed", "canceled"):
            raise Exception(f"Harmony job {job_id} {s['status']}: {s.get('message', '')}")
        _time.sleep(every)


def read_grid_file(path, var_id):
    """Một file HOSS → DataArray (time, lat, lon). ✅ file thật 13/11: IMERG nhóm 'Grid', chiều (time, lon, lat),
    units 'mm/hr'; GLDAS phẳng (time, lat, lon) 'kg m-2'; MERRA-2 phẳng (time, lat, lon) 'K', lat gồm cả ±90."""
    import xarray as xr
    group, _, name = HOSS_VARIABLES[var_id].rpartition("/")
    da = xr.open_dataset(path, group=group or None)[name]
    return da.transpose("time", "lat", "lon")


def convert_cube(var_id, da, unit):
    """Như convert_units nhưng cho cả cube: assert đơn vị nguồn rồi đổi (days_in_month lấy từ trục time)."""
    accepted, std_unit, f = GIOVANNI_UNITS[var_id]
    assert unit.strip() in accepted, f"{var_id}: đơn vị nguồn '{unit}' không nằm trong {accepted}, không đổi"
    return f(da, da["time"]), std_unit


def build_cube(files, var_id):
    """Các file tháng → cube 1° (time, lat, lon), đơn vị chuẩn, nhãn đầu tháng (01 S5–S7)."""
    import xarray as xr
    from pipeline.grid import bin_to_grid, global_coords
    first = read_grid_file(files[0], var_id)
    cube = xr.concat([bin_to_grid(read_grid_file(f, var_id)) for f in files], "time").sortby("time")
    lat, lon = global_coords()                      # GLDAS chỉ từ 60°S → vẫn đủ lưới 180 × 360, ô thiếu = NaN
    cube = cube.reindex(lat=lat, lon=lon, method="nearest", tolerance=1e-6)
    # ✅ 13/11: IMERG ghi lịch julian (cftime). 1980–2024 hai lịch cùng năm nhuận → lấy nguyên ngày trên nhãn.
    cube["time"] = pd.to_datetime(cube["time"].dt.strftime("%Y-%m-01").values)
    cube, unit = convert_cube(var_id, cube, first.attrs.get("units", ""))
    name, dataset = VARIABLES[var_id]
    return cube.rename(name).assign_attrs(units=unit, source="giovanni_harmony_hoss", dataset=dataset,
                                          source_variable=var_id, grid="1deg_block_mean")


class GiovanniAdapter:
    source = "giovanni"

    def fetch(self, reqs: list[FetchRequest], raw_dir: Path) -> Path:
        from harmony import Client
        client = Client(auth=_auth())
        for req in reqs:
            out = raw_dir / "giovanni" / request_id(req)
            if (out / "manifest.json").exists():
                continue                                    # cache hit → không tốn quota
            out.mkdir(parents=True, exist_ok=True)
            quota_guard()
            jobs = {}
            for region in req.regions:
                for var_id in req.variables:
                    path, job = with_retries(harmony_area_csv, client, req.dataset, var_id,
                                             region, req.start, req.end, out)
                    target = out / f"{region.region_id}__{var_id}.csv"
                    path.rename(target)
                    jobs[target.name] = job
            (out / "manifest.json").write_text(json.dumps({"request_id": request_id(req), "jobs": jobs}))
        return raw_dir / "giovanni"

    def normalize(self, reqs: list[FetchRequest], raw: Path) -> pd.DataFrame:
        parts = []
        for req in reqs:
            out = raw / request_id(req)
            jobs = json.loads((out / "manifest.json").read_text())["jobs"]
            for region in req.regions:
                for var_id in req.variables:
                    name = f"{region.region_id}__{var_id}.csv"
                    parts.append(normalize_area_csv(out / name, region, var_id, jobs.get(name, ""),
                                                    req.start, req.end))
        return pd.concat(parts, ignore_index=True)


# ── §4.4 Parse CSV trung bình vùng ───────────────────────────────────────────

def parse_giovanni_area_csv(path_or_text) -> tuple[pd.DataFrame, dict]:
    """Metadata 'khoá,giá trị' kết thúc ở dòng chỉ có ',', sau đó là bảng 'time,mean_<VAR>'.
    Trả (DataFrame time = đầu tháng, value) và dict metadata (chứa đơn vị)."""
    p = Path(path_or_text) if "\n" not in str(path_or_text) else None
    text = p.read_text(encoding="utf-8") if p else str(path_or_text)
    lines = text.splitlines()
    cut = next(i for i, l in enumerate(lines) if l.strip() == ",")       # dòng chỉ có ","
    meta = {}
    for l in lines[:cut]:
        k, _, v = l.partition(",")
        meta[k.strip().rstrip(":")] = v.strip().strip('"')
    df = pd.read_csv(io.StringIO("\n".join(lines[cut + 1:])))
    df.columns = [c.strip() for c in df.columns]
    value_col = next(c for c in df.columns if c.startswith("mean_"))
    t = pd.to_datetime(df["time"], utc=True, format="ISO8601")
    out = pd.DataFrame({"time": t.dt.tz_localize(None).dt.to_period("M").dt.to_timestamp(),
                        "value": pd.to_numeric(df[value_col], errors="coerce")})
    return out, meta


def normalize_area_csv(path, region: Region, var_id, job_id, start="2001-01-01", end="2024-12-31"):
    """Một CSV Giovanni → các dòng observations (đủ mọi tháng trong giai đoạn, thiếu = NaN)."""
    df, meta = parse_giovanni_area_csv(path)
    value, unit = convert_units(var_id, df["value"], df["time"], giovanni_unit(meta))
    months = pd.date_range(start, end, freq="MS")
    monthly = pd.DataFrame({"value": value.to_numpy()}, index=df["time"]).reindex(months)
    name, dataset = VARIABLES[var_id]
    return rows(region, name, monthly, unit=unit, source="giovanni", dataset=dataset,
                source_variable=var_id, agg="area_mean" if region.geom_type == "polygon" else "pixel",
                qa_policy="giovanni_preprocessed", request_ref=job_id)


# ── §4.5 Điểm (dự phòng), token, quota, retry ──────────────────────────────

def edl_token() -> str:
    """Token Earthdata Login từ tài khoản trong .env (không lưu ra file)."""
    r = requests.post("https://urs.earthdata.nasa.gov/api/users/find_or_create_token", auth=_auth(), timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]                 # ✅ 13/11


def quota_guard(token=None, limit=0.95):
    token = token or edl_token()
    r = requests.get(f"{GIOVANNI}/quota", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    r.raise_for_status()
    check_quota(r.json(), limit)


def check_quota(body, limit=0.95):
    used = float(body["quota"] if isinstance(body, dict) else body)   # ⚠️ dạng JSON xác nhận ở T-1
    if used >= limit:
        raise RuntimeError(f"Giovanni quota đã dùng {used:.0%}: dừng, chuyển Plan B (04, mục 6)")
    return used


def point_series(var_id, lat, lon, start, end, token):
    r = requests.get(f"{GIOVANNI}/timeseries",
                     params={"data": var_id, "location": f"[{lat},{lon}]", "time": f"{start}/{end}"},
                     headers={"Authorization": f"Bearer {token}"}, timeout=120)
    r.raise_for_status()
    return r.text                                   # ⚠️ CSV hay JSON: xác nhận ở T-4, lưu nguyên văn vào raw


def with_retries(fn, *args, tries=4, base=10):
    """Chỉ thử lại lỗi mạng/timeout (10 → 20 → 40 s). Hết quota thì dừng hẳn."""
    for k in range(tries):
        try:
            return fn(*args)
        except (requests.ConnectionError, requests.Timeout, RuntimeError) as e:
            if "quota" in str(e) or k == tries - 1:
                raise
            _time.sleep(base * 2 ** k)
