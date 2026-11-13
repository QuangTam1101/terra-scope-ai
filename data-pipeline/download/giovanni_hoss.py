"""Giovanni (NASA GES DISC) qua Harmony HOSS: lưới tháng gốc 2001–2024 trong bbox Mekong, mỗi biến một NetCDF.
Chạy:    .venv/bin/python download/giovanni_hoss.py [VAR_ID ...]     (mặc định: mọi biến trong VARIABLES)
Kết quả: data/raw/giovanni/<VAR_ID>/<VAR_ID>_mekong_200101-202412.nc
         Giá trị, đơn vị, lưới giữ nguyên như NASA; chỉ giữ ô có tâm trong bbox và ghép 288 file tháng theo time.
Lỗi 403: tài khoản Earthdata chưa authorize app GES DISC (chỉ chủ tài khoản làm được, trên urs.earthdata.nasa.gov)."""
import shutil
import sys
import time
from datetime import datetime

import xarray as xr
from harmony import BBox, Client, Collection, Request

from common import BBOX, END, RAW, START, credentials, crop

GLDAS, IMERG, MERRA2 = "C1342986036-GES_DISC", "C2723754851-GES_DISC", "C1276812823-GES_DISC"
VARIABLES = {  # Giovanni variable ID → (collection trong CMR, tên biến trong file HOSS)
    "GPM_3IMERGM_07_precipitation": (IMERG, "Grid/precipitation"),
    "GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst": (GLDAS, "SoilMoi0_10cm_inst"),
    "GLDAS_NOAH025_M_2_1_SoilMoi10_40cm_inst": (GLDAS, "SoilMoi10_40cm_inst"),
    "GLDAS_NOAH025_M_2_1_SoilMoi40_100cm_inst": (GLDAS, "SoilMoi40_100cm_inst"),
    "GLDAS_NOAH025_M_2_1_SoilMoi100_200cm_inst": (GLDAS, "SoilMoi100_200cm_inst"),
    "GLDAS_NOAH025_M_2_1_RootMoist_inst": (GLDAS, "RootMoist_inst"),
    "GLDAS_NOAH025_M_2_1_Tair_f_inst": (GLDAS, "Tair_f_inst"),
    "GLDAS_NOAH025_M_2_1_Evap_tavg": (GLDAS, "Evap_tavg"),
    "M2IMNXASM_5_12_4_T2M": (MERRA2, "T2M"),
}
TIME = xr.coders.CFDatetimeCoder(use_cftime=True)   # IMERG ghi time theo lịch julian


def wait_job(client, job_id, every=30):
    """Không dùng client.wait_for_processing: nó hỏi /jobs/status, và Harmony thỉnh thoảng trả 400 với job dài."""
    while True:
        try:
            status = client.status(job_id).get("status")
        except Exception as e:                       # lỗi mạng tạm thời → hỏi lại sau
            print("status lỗi tạm thời:", str(e)[:100], flush=True)
            status = None
        if status in ("successful", "complete_with_errors"):
            return
        if status in ("failed", "canceled"):
            sys.exit(f"Harmony job {job_id}: {status}")
        time.sleep(every)


def fetch(client, var_id):
    out = RAW / "giovanni" / var_id / f"{var_id}_mekong_200101-202412.nc"
    if out.exists():
        print("đã có", out)
        return
    concept, hoss_var = VARIABLES[var_id]
    months = out.parent / "months"                   # file tháng tạm, xoá sau khi ghép
    months.mkdir(parents=True, exist_ok=True)
    job_file = out.parent / "job_id.txt"             # chạy lại thì nối tiếp job cũ, không gửi lại
    if job_file.exists():
        job_id = job_file.read_text().strip()
    else:
        req = Request(collection=Collection(id=concept), spatial=BBox(*BBOX), variables=[hoss_var],
                      temporal={"start": datetime.fromisoformat(START),
                                "stop": datetime.fromisoformat(END + "T23:59:59")},
                      format="application/x-netcdf4")
        job_id = client.submit(req)
        job_file.write_text(job_id)
    print(var_id, "job", job_id, flush=True)
    wait_job(client, job_id)
    files = sorted(f.result() for f in client.download_all(job_id, directory=str(months), overwrite=False))
    group = "Grid" if hoss_var.startswith("Grid/") else None
    parts = [crop(xr.open_dataset(f, group=group, decode_times=TIME)).load() for f in files]
    ds = xr.concat(parts, "time", data_vars="minimal", coords="minimal", compat="override").sortby("time")
    assert ds.sizes["time"] == 288, f"{var_id}: có {ds.sizes['time']} tháng, cần 288"
    ds.attrs["mekong_subset"] = f"Harmony HOSS, ô có tâm trong bbox {BBOX}, ghép {len(files)} file tháng, giá trị gốc"
    ds.to_netcdf(out, encoding={v: {"zlib": True, "complevel": 4} for v in ds.data_vars})
    shutil.rmtree(months)
    job_file.unlink()
    print("ghi", out, dict(ds.sizes), flush=True)


if __name__ == "__main__":
    client = Client(auth=credentials())
    for var in sys.argv[1:] or VARIABLES:
        fetch(client, var)
