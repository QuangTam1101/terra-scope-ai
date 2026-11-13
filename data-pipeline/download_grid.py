"""Tải lưới TOÀN CẦU các biến Giovanni qua Harmony HOSS rồi dựng cube 1° (docs/04 mục 3a, docs/02 §4.6, docs/01 S1–S7).
Chạy nền:  nohup .venv/bin/python -u download_grid.py > data/raw/harmony_grid/log.txt 2>&1 &
Một biến:  .venv/bin/python -u download_grid.py GPM_3IMERGM_07_precipitation
Kết quả:   data/raw/harmony_grid/<VAR_ID>/*.nc4 (thô, giữ nguyên) → data/processed/cube_<tên chuẩn>.nc
Chạy lại an toàn: biến đã có cube thì bỏ qua; có job_id.txt thì nối tiếp job đó; file thô đã tải thì không tải lại."""
import sys
from pathlib import Path

from harmony import Client

from pipeline.giovanni_adapter import HOSS_VARIABLES, VARIABLES, _auth, build_cube, harmony_grid, with_retries

START, END = "2001-01-01", "2024-12-31"
RAW, OUT = Path("data/raw/harmony_grid"), Path("data/processed")

if __name__ == "__main__":
    client = Client(auth=_auth())
    OUT.mkdir(parents=True, exist_ok=True)
    for var_id in sys.argv[1:] or list(HOSS_VARIABLES):
        cube_path = OUT / f"cube_{VARIABLES[var_id][0]}.nc"
        if cube_path.exists():
            print("đã có", cube_path)
            continue
        raw = RAW / var_id
        raw.mkdir(parents=True, exist_ok=True)
        files, job = with_retries(harmony_grid, client, var_id, START, END, raw)   # job_id.txt ghi ngay khi gửi job
        print(var_id, "job", job, "tải", len(files), "file")
        build_cube(sorted(files), var_id).to_netcdf(cube_path)
        print("ghi", cube_path)
