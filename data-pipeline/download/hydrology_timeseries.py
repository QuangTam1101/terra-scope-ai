"""Hydrology Time Series (NASA GES DISC): chuỗi thời gian tại điểm với bước thời gian ngắn (IMERG 30 phút, GLDAS 3 giờ).
Dịch vụ cũ "Hydrology Data Rods" đã ngừng sau 31/10/2025; nay dùng API "Giovanni in the Cloud: Time Series".
Chạy:    .venv/bin/python download/hydrology_timeseries.py
Kết quả: data/raw/hydrology_timeseries/<VAR_ID>/<điểm>.csv
         Đầu file: metadata của NASA (sản phẩm, đơn vị, undef, toạ độ ô lưới); sau đó bảng "Timestamp (UTC),Data"
         2001–2024. Giá trị là của ô lưới chứa điểm (GLDAS 0,25°, IMERG 0,1°), không phải số đo tại trạm."""
import requests

from common import END, RAW, START, edl_token

API = "https://api.giovanni.earthdata.nasa.gov/timeseries"
VARIABLES = ["GPM_3IMERGHH_07_precipitation",            # mm/giờ, mỗi 30 phút
             "GLDAS_NOAH025_3H_2_1_Rainf_f_tavg",         # kg/m²/s, mỗi 3 giờ (mưa đầu vào của mô hình GLDAS)
             "GLDAS_NOAH025_3H_2_1_SoilMoi0_10cm_inst",   # kg/m², mỗi 3 giờ
             "GLDAS_NOAH025_3H_2_1_RootMoist_inst"]       # kg/m², mỗi 3 giờ (tầng rễ 0–100 cm)
POINTS = {  # (lat, lon) gần đúng của các trạm thuỷ văn dòng chính Mekong, từ thượng lưu xuống
    "jinghong": (22.00, 100.80), "chiang_saen": (20.27, 100.09), "luang_prabang": (19.89, 102.14),
    "vientiane": (17.93, 102.62), "nakhon_phanom": (17.40, 104.80), "pakse": (15.12, 105.80),
    "stung_treng": (13.53, 105.97), "kratie": (12.48, 106.02), "phnom_penh": (11.58, 104.94),
    "tan_chau": (10.80, 105.24), "can_tho": (10.03, 105.78),
}
PER_REQUEST = ("begin_time", "end_time", "mean", "Request_time")   # metadata chỉ đúng cho một lần gọi → bỏ


def series(session, var, lat, lon):
    header, rows = None, []
    for year in range(int(START[:4]), int(END[:4]) + 1):    # IMERG 30 phút: 17.568 dòng/năm → hỏi từng năm
        r = session.get(API, params={"data": var, "location": f"[{lat},{lon}]",
                                     "time": f"{year}-01-01T00:00:00/{year}-12-31T23:59:59"}, timeout=600)
        r.raise_for_status()
        lines = r.text.splitlines()
        k = lines.index("Timestamp (UTC),Data")
        header = header or [l for l in lines[:k + 1] if l.split(",")[0] not in PER_REQUEST]
        rows += [l for l in lines[k + 1:] if l]
    return header, rows


if __name__ == "__main__":
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {edl_token()}"
    for var in VARIABLES:
        for name, (lat, lon) in POINTS.items():
            out = RAW / "hydrology_timeseries" / var / f"{name}.csv"
            if out.exists():
                continue
            header, rows = series(session, var, lat, lon)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text("\n".join(header + rows) + "\n")
            print(var, name, len(rows), "dòng", flush=True)
