"""Giovanni (NASA GES DISC) qua Harmony HOSS: lưới tháng TOÀN CẦU 2001–2025, mỗi biến một thư mục.
HOSS chỉ tách đúng biến cần lấy ra khỏi file gốc của NASA; giá trị, đơn vị, lưới giữ nguyên.
Chạy:    .venv/bin/python download/giovanni_hoss.py [VAR_ID ...]     (mặc định: mọi biến trong VARIABLES)
Kết quả: data/raw/giovanni/<VAR_ID>/<số>_<tên granule gốc>_<biến>_subsetted.nc4, 300 file tháng.
         Chạy lại sau khi đổi END thì chỉ tải các tháng còn thiếu.
Lỗi 403: tài khoản Earthdata chưa authorize app GES DISC (chỉ chủ tài khoản làm được, trên urs.earthdata.nasa.gov)."""
import sys
from datetime import datetime

import pandas as pd
from harmony import Client, Collection, Request

from common import END, RAW, START, credentials, harmony_job

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

if __name__ == "__main__":
    client = Client(auth=credentials(), download_timeout=120)
    months = pd.date_range(START, END, freq="MS")
    for var_id in sys.argv[1:] or VARIABLES:
        out = RAW / "giovanni" / var_id
        have = len(list(out.glob("*.nc4")))
        if have >= len(months):
            print("đã có", out)
            continue
        concept, hoss_var = VARIABLES[var_id]
        # chỉ xin các tháng sau phần đã có (tên file mỗi job mang số job khác nên tải lại sẽ trùng).
        # ponytail: giả định phần đã có liền mạch từ START; nếu thiếu tháng giữa chừng thì xoá thư mục rồi tải lại
        # không truyền spatial → HOSS trả cả lưới toàn cầu
        req = Request(collection=Collection(id=concept), variables=[hoss_var], format="application/x-netcdf4",
                      temporal={"start": months[have].to_pydatetime(),
                                "stop": datetime.fromisoformat(END + "T23:59:59")})
        files = harmony_job(client, req, out)
        print(var_id, len(files), "file tháng", flush=True)
