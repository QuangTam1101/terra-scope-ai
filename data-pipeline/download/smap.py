"""SMAP L3 Radiometer Global Daily 36 km (SPL3SMP v009, NSIDC) qua Harmony HOSS: độ ẩm đất lớp mặt (~5 cm) đo bằng
vệ tinh, TOÀN CẦU, hằng ngày từ 31/03/2015. Trang challenge giới thiệu SMAP qua AppEEARS, nhưng AppEEARS không nhận
vùng cả địa cầu, và bản 9 km (SPL3SMP_E) toàn cầu nặng ~620 MB/ngày (~2,2 TB); bản 36 km, chỉ lấy 4 biến: ~2,4 MB/ngày.
Chạy:    .venv/bin/python download/smap.py [NĂM ...]     (mặc định 2015 … 2024; chỗ chậm là tải từng file chứ không
         phải Harmony xử lý, nên chạy vài tiến trình song song, mỗi tiến trình vài năm. Máy ngủ thì kết nối treo:
         giữ máy thức; tải treo quá 120 giây thì tự tải lại)
Kết quả: data/raw/smap/<năm>/<số>_SMAP_L3_SM_P_<YYYYMMDD>_R19240_001_subsetted.nc4, một file mỗi ngày:
         nhóm Soil_Moisture_Retrieval_Data_AM (soil_moisture, retrieval_qual_flag, latitude, longitude) và
         nhóm Soil_Moisture_Retrieval_Data_PM (cùng các biến, thêm hậu tố _pm); lưới EASE-Grid 2.0, y 406 × x 964.
Mỗi năm một job Harmony (chạy lại thì năm đã xong được bỏ qua, năm dở dang được tải tiếp)."""
import sys
from datetime import datetime

from harmony import Client, Collection, Request

from common import END, RAW, credentials, harmony_job

COLLECTION = "C2938664585-NSIDC_CPRD"   # SPL3SMP v009
VARIABLES = ["Soil_Moisture_Retrieval_Data_AM/soil_moisture", "Soil_Moisture_Retrieval_Data_AM/retrieval_qual_flag",
             "Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm", "Soil_Moisture_Retrieval_Data_PM/retrieval_qual_flag_pm"]

if __name__ == "__main__":
    client = Client(auth=credentials(), download_timeout=120)
    for year in map(int, sys.argv[1:] or range(2015, int(END[:4]) + 1)):
        out = RAW / "smap" / str(year)
        if any(out.glob("*.nc4")) and not (out / "job_id.txt").exists():
            continue
        req = Request(collection=Collection(id=COLLECTION), variables=VARIABLES, format="application/x-netcdf4",
                      temporal={"start": datetime(year, 1, 1), "stop": datetime(year, 12, 31, 23, 59, 59)})
        print(year, len(harmony_job(client, req, out)), "file ngày", flush=True)
