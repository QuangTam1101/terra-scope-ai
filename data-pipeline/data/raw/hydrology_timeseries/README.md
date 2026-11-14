# Hydrology Time Series (NASA GES DISC) – chuỗi mưa / độ ẩm đất dày đặc tại một điểm, lấy khi cần

**Nguồn trên trang challenge:** "Hydrology Data Rods" (NASA resources). Dịch vụ này **đã ngừng** (sau 31/10/2025,
link cũ chuyển về trang thông báo của GES DISC). NASA thay bằng "Giovanni in the Cloud: Time Series", gọi qua API:

```
https://api.giovanni.earthdata.nasa.gov/timeseries?data=<VAR_ID>&location=[lat,lon]&time=<start>/<end>
```

Cần token Earthdata (Bearer); script tự lấy token từ `EARTHDATA_USER`/`EARTHDATA_PASS` trong `.env`.
**Script:** `download/hydrology_timeseries.py TÊN LAT LON [VAR_ID ...]` (hỏi từng năm một rồi ghép lại).

**Không tải sẵn.** API chỉ trả từng điểm, nên đây là công cụ lấy theo yêu cầu: điểm người dùng chọn trên nền tảng,
hoặc trạm cần kiểm chứng ở bước thời gian ngắn. Bản tháng dạng lưới toàn cầu của cùng các sản phẩm nằm ở
`data/raw/giovanni/`.

```bash
.venv/bin/python download/hydrology_timeseries.py phnom_penh 11.58 104.94
```

## Biến

| `VAR_ID` | Nghĩa | Đơn vị | Bước thời gian | Lưới |
|---|---|---|---|---|
| `GPM_3IMERGHH_07_precipitation` | mưa vệ tinh IMERG Final Run V07 | mm/giờ (cường độ) | 30 phút | 0,1° |
| `GLDAS_NOAH025_3H_2_1_Rainf_f_tavg` | mưa đầu vào của mô hình GLDAS | kg/m²/s (= mm/s) | 3 giờ | 0,25° |
| `GLDAS_NOAH025_3H_2_1_SoilMoi0_10cm_inst` | độ ẩm đất tầng 0–10 cm | kg/m² (= mm nước) | 3 giờ | 0,25° |
| `GLDAS_NOAH025_3H_2_1_RootMoist_inst` | độ ẩm đất vùng rễ; độ sâu theo lớp thực vật (xem `data/raw/giovanni/README.md`) | kg/m² | 3 giờ | 0,25° |

Danh sách mọi biến API nhận: `https://api.giovanni.earthdata.nasa.gov/configured-variables/`.

## Định dạng file `<VAR_ID>/<TÊN>.csv`

```
prod_name,GPM_3IMERGHH.07      ← metadata của NASA: sản phẩm, DOI, đơn vị (unit), giá trị thiếu (undef),
...                               toạ độ tâm ô lưới thực sự được lấy (lat, lon), độ phân giải
                               ← một dòng trống
Timestamp (UTC),Data
2001-01-01T00:00:00,0.0
...
```

```python
lines = open(f).read().splitlines()
df = pd.read_csv(f, skiprows=lines.index("Timestamp (UTC),Data"), parse_dates=["Timestamp (UTC)"])
```

## Cần biết trước khi dùng

- Giá trị là của **ô lưới chứa điểm** (xem `lat`, `lon` trong metadata), không phải số đo tại trạm.
- Giờ là **UTC**; đổi sang giờ địa phương trước khi cộng theo ngày.
- IMERG là cường độ (mm/giờ) mỗi 30 phút: tổng mưa = Σ(giá trị × 0,5). GLDAS Rainf: tổng 3 giờ = giá trị × 10 800.
- Giá trị thiếu: xem dòng `undef` trong metadata (IMERG dùng -9999.9).
- Số dòng mỗi năm: IMERG 17 520 (năm nhuận 17 568); GLDAS 3 giờ 2 920 (2 928).
