# SMAP (NASA NSIDC) – độ ẩm đất lớp mặt đo từ vệ tinh, toàn cầu, hằng ngày

**Nguồn trên trang challenge:** SMAP được giới thiệu qua "AppEEARS" (NASA resources). AppEEARS không nhận vùng cả địa
cầu, và bản 9 km (SPL3SMP_E) toàn cầu nặng ~2,2 TB, nên ở đây lấy **bản 36 km SPL3SMP v009** qua **Harmony HOSS**, chỉ
tách 4 biến cần dùng (~2,1 MB/ngày; 3 845 file, 8,1 GB). **Script:** `download/smap.py [NĂM ...]` (đăng nhập bằng `.env`; mỗi năm một job
Harmony; chỗ chậm là tải từng file, nên chạy vài tiến trình song song; máy ngủ thì tải treo).

| Mục | Giá trị |
|---|---|
| Sản phẩm | SMAP L3 Radiometer Global Daily 36 km EASE-Grid Soil Moisture, v009 (CMR `C2938664585-NSIDC_CPRD`) |
| File | `<năm>/<số>_SMAP_L3_SM_P_<YYYYMMDD>_R19240_<bản>_subsetted.nc4`, một file mỗi ngày (số đầu tên là số thứ tự Harmony; `<bản>` là lần NSIDC sinh file, `001` hoặc `002` ở 225 ngày; mỗi ngày chỉ một file) |
| Thời gian | 2015-03-31 → 2025-12-31: 3 845 ngày có file, thiếu 84 ngày (xem dưới) |
| Lưới | EASE-Grid 2.0 toàn cầu 36 km (EPSG:6933), `y` 406 × `x` 964, toạ độ `x`, `y` theo mét |
| Nhóm `Soil_Moisture_Retrieval_Data_AM` | lượt sáng (6 giờ địa phương): `soil_moisture`, `retrieval_qual_flag`, `latitude`, `longitude` |
| Nhóm `Soil_Moisture_Retrieval_Data_PM` | lượt chiều (18 giờ): cùng các biến, thêm hậu tố `_pm` |

## Biến

| Biến | Nghĩa | Đơn vị | Fill | Ghi chú |
|---|---|---|---|---|
| `soil_moisture`, `soil_moisture_pm` | độ ẩm đất lớp mặt ~0–5 cm | m³/m³ | `-9999` | miền hợp lệ khai báo 0,02–0,5 |
| `retrieval_qual_flag`, `retrieval_qual_flag_pm` | cờ chất lượng (bit) | | `65534` | **bit 0 = 1: chất lượng không được khuyến nghị** |

## Cần biết trước khi dùng

- **Mỗi ngày chỉ phủ một phần địa cầu** (dải quét của một lượt): ~90 % ô-lượt là fill. Muốn có lưới đầy thì gộp tháng.
- **Bit 0 của cờ chất lượng = 1 ở ~42 % ô có giá trị** (thực vật dày, đất đóng băng, nhiễu sóng vô tuyến …).
  `preprocess/clean.py` bỏ các ô này trước khi gộp tháng. Hệ quả: rừng nhiệt đới gần như không bao giờ đạt (Amazon 0 %
  lượt, 07/2020), Mekong 41 %; sau làm sạch SMAP phủ 60 % diện tích đất liền.
- `latitude`/`longitude` trong file chỉ có giá trị ở ô có dữ liệu ngày đó (còn lại fill). Toạ độ đầy đủ tính từ
  `x`, `y` bằng pyproj (EPSG:6933 → EPSG:4326), khớp `latitude`/`longitude` của file trong 1e-5°.
- Ô EASE có diện tích bằng nhau: ở vĩ độ cao một ô 36 km cao tới ~1° vĩ độ, nên không có tâm ô EASE nào trong một số
  ô 0,5°; `preprocess/clean.py` lấy mẫu 4 × 4 điểm trong mỗi ô 0,5° thay vì gom tâm ô EASE.
- Chỉ có ~10 năm (từ 31/03/2015), ngắn hơn 2001–2025 của các nguồn khác. **Hai khoảng trống dài** khi vệ tinh vào
  chế độ an toàn: 2019-06-20 → 2019-07-22 (33 ngày) và 2022-08-07 → 2022-09-19 (44 ngày); thêm 7 ngày lẻ (2015-05-13,
  2015-12-16, 2016-05-01, 2016-09-27, 2022-09-21, 2022-11-17, 2025-03-18). Tháng 7/2019 và 8–9/2022 vì vậy ít lượt
  quan trắc, nhiều ô không đủ `MIN_OBS`.
- Harmony tự tạm dừng (`paused`) job có trên ~300 granule sau bước xem trước; `harmony_job()` trong
  `download/common.py` tự cho chạy tiếp.
