"""Tải cube ĐỘ PHÂN GIẢI GỐC cho một khung vùng (mặc định: vùng Mekong [94, 8, 110, 35]) qua Harmony HOSS.

Dùng lại hàm của data-pipeline (Long): CONCEPT_IDS, HOSS_VARIABLES, wait_job, read_grid_file, convert_cube.
Khác download_grid.py ở hai điểm: có cắt bbox, và KHÔNG gộp về lưới 1° (giữ IMERG 0,1°, GLDAS 0,25°).

Đăng nhập Earthdata: harmony-py tự đọc file .netrc/_netrc của người dùng (không đọc .env, không in thông tin tài khoản).

Chạy (từ thư mục backend/, môi trường spaceapps):
    python scripts/download_region.py                    # cả 2 biến P0, 2001–2024
    python scripts/download_region.py --months 1         # thử 1 tháng để kiểm tra quyền truy cập
Kết quả: data-pipeline/data/raw/harmony_region/<tên vùng>/<VAR_ID>/*.nc4 (thô)
         data-pipeline/data/processed/regions/<tên vùng>/cube_<biến>.nc   (cube cho backend: CUBE_DIR)
Viết với sự hỗ trợ của AI (Claude Code).
"""
import argparse
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd
import xarray as xr

ROOT = Path(__file__).resolve().parents[2]
PIPELINE_DIR = ROOT / "data-pipeline"
sys.path.insert(0, str(PIPELINE_DIR))

from harmony import BBox, Client, Collection, Request  # noqa: E402

from pipeline.giovanni_adapter import (CONCEPT_IDS, HOSS_VARIABLES, VARIABLES, convert_cube,  # noqa: E402
                                       read_grid_file, wait_job)

P0_VARS = ["GPM_3IMERGM_07_precipitation", "GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst"]
REGION_NAME = "mekong"
BBOX = (94.0, 8.0, 110.0, 35.0)           # W, S, E, N: vùng Mekong đội chốt 13/11/2026 (cả lưu vực, gồm Việt Nam)


def submit(client, var_id, start, end, bbox, out_dir: Path) -> str:
    _, dataset = VARIABLES[var_id]
    req = Request(collection=Collection(id=CONCEPT_IDS[dataset]),
                  temporal={"start": datetime.fromisoformat(start), "stop": datetime.fromisoformat(end)},
                  spatial=BBox(*bbox), variables=[HOSS_VARIABLES[var_id]], format="application/x-netcdf4")
    assert req.is_valid(), "Request Harmony không hợp lệ"
    job_file = out_dir / "job_id.txt"           # chạy lại thì nối tiếp job cũ, không gửi lại
    if job_file.exists():
        return job_file.read_text().strip()
    job_id = client.submit(req)
    job_file.write_text(job_id)
    return job_id


def build_native_cube(files, var_id):
    """Các file tháng → cube (time, lat, lon) ở lưới gốc, đơn vị chuẩn, nhãn đầu tháng."""
    first = read_grid_file(files[0], var_id)
    cube = xr.concat([read_grid_file(f, var_id) for f in files], "time").sortby("time").sortby("lat").sortby("lon")
    cube["time"] = pd.to_datetime(cube["time"].dt.strftime("%Y-%m-01").values)   # IMERG dùng cftime julian
    cube = cube.astype("float32")
    cube, unit = convert_cube(var_id, cube, first.attrs.get("units", ""))
    if VARIABLES[var_id][0] == "soil_moisture":
        cube = cube.where(cube < 0.99)          # GLDAS = 1,0 m³/m³ cố định trên ô băng (docs/03 K22)
    name, dataset = VARIABLES[var_id]
    res = float(abs(cube["lat"].diff("lat").median()))
    return cube.rename(name).assign_attrs(units=unit, source="giovanni_harmony_hoss", dataset=dataset,
                                          source_variable=var_id, grid=f"native_{res:g}deg", region=REGION_NAME)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("vars", nargs="*", default=P0_VARS)
    ap.add_argument("--start", default="2001-01-01")
    ap.add_argument("--end", default="2024-12-31")
    ap.add_argument("--months", type=int, help="chỉ tải N tháng đầu (để thử)")
    a = ap.parse_args()
    end = a.end
    if a.months:
        end = (pd.Timestamp(a.start) + pd.DateOffset(months=a.months) - pd.Timedelta(days=1)).strftime("%Y-%m-%d")

    client = Client()                            # đọc .netrc/_netrc
    suffix = "_test" if a.months else ""
    out = PIPELINE_DIR / "data" / "processed" / "regions" / (REGION_NAME + suffix)
    out.mkdir(parents=True, exist_ok=True)
    for var_id in a.vars:
        name = VARIABLES[var_id][0]
        cube_path = out / f"cube_{name}.nc"
        if cube_path.exists():
            print("đã có", cube_path, flush=True)
            continue
        raw = PIPELINE_DIR / "data" / "raw" / "harmony_region" / (REGION_NAME + suffix) / var_id
        raw.mkdir(parents=True, exist_ok=True)
        job = submit(client, var_id, a.start, end, BBOX, raw)
        print(var_id, "job", job, flush=True)
        wait_job(client, job, every=10)
        files = sorted(Path(f.result()) for f in client.download_all(job, directory=str(raw), overwrite=False))
        files = [f for f in files if f.suffix in (".nc4", ".nc", ".h5")]
        print(var_id, "tải", len(files), "file", flush=True)
        cube = build_native_cube(files, var_id)
        cube.to_netcdf(cube_path)
        print("ghi", cube_path, dict(cube.sizes), cube.attrs["units"],
              str(cube.time.values[0])[:7], "→", str(cube.time.values[-1])[:7], flush=True)


if __name__ == "__main__":
    main()
