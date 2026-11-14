# SMAP (NASA NSIDC) – độ ẩm đất lớp mặt đo từ vệ tinh, toàn cầu, hằng ngày

**Nguồn trên trang challenge:** SMAP được giới thiệu qua "AppEEARS" (NASA resources). AppEEARS không nhận vùng cả địa
cầu, và bản 9 km (SPL3SMP_E) toàn cầu nặng ~2,2 TB, nên ở đây lấy **bản 36 km SPL3SMP v009** qua **Harmony HOSS**, chỉ
tách 4 biến cần dùng (~2,4 MB/ngày). **Script:** `download/smap.py [NĂM ...]` (đăng nhập bằng `.env`; mỗi năm một job
Harmony; chỗ chậm là tải từng file, nên chạy vài tiến trình song song; máy ngủ thì tải treo).

| Mục | Giá trị |
|---|---|
| Sản phẩm | SMAP L3 Radiometer Global Daily 36 km EASE-Grid Soil Moisture, v009 (CMR `C2938664585-NSIDC_CPRD`) |
| File | `<năm>/<số>_SMAP_L3_SM_P_<YYYYMMDD>_R19240_001_subsetted.nc4`, một file mỗi ngày (số đầu tên là số thứ tự Harmony) |
| Thời gian | 2015-03-31 → 2024-12-31 |
| Lưới | EASE-Grid 2.0 toàn cầu 36 km (EPSG:6933), `y` 406 × `x` 964, toạ độ `x`, `y` theo mét |
| Nhóm `Soil_Moisture_Retrieval_Data_AM` | lượt sáng (6 giờ địa phương): `soil_moisture`, `retrieval_qual_flag`, `latitude`, `longitude` |
| Nhóm `Soil_Moisture_Retrieval_Data_PM` | lượt chiều (18 giờ): cùng các biến, thêm hậu tố `_pm` |

## Biến

| Biến | Nghĩa | Đơn vị | Fill | Ghi chú |
|---|---|---|---|---|
| `soil_moisture`, `soil_moisture_pm` | độ ẩm đất lớp mặt ~0–5 cm | m³/m³ | `-9999` | miền hợp lệ khai báo 0,02–0,5 |
| `retrieval_qual_flag`, `retrieval_qual_flag_pm` | cờ chất lượng (bit) | | `65534` | **bit 0 = 1: chất lượng không được khuyến nghị** |

## Cần biết trước khi dùng

- **Mỗi ngày chỉ phủ một phần địa cầu** (dải quét của một lượt): ~89 % ô-ngày là fill. Muốn có lưới đầy thì gộp tháng.
- **Bit 0 của cờ chất lượng = 1 ở ~48 % ô có giá trị** (thực vật dày, đất đóng băng, nhiễu sóng vô tuyến …).
  `preprocess/clean.py` bỏ các ô này trước khi gộp tháng.
- `latitude`/`longitude` trong file chỉ có giá trị ở ô có dữ liệu ngày đó (còn lại fill). Toạ độ đầy đủ tính từ
  `x`, `y` bằng pyproj (EPSG:6933 → EPSG:4326), khớp `latitude`/`longitude` của file trong 1e-5°.
- Ô EASE có diện tích bằng nhau: ở vĩ độ cao một ô 36 km cao tới ~1° vĩ độ, nên không có tâm ô EASE nào trong một số
  ô 0,5°; `preprocess/clean.py` lấy mẫu 4 × 4 điểm trong mỗi ô 0,5° thay vì gom tâm ô EASE.
- Chỉ có ~10 năm (từ 31/03/2015), ngắn hơn 2001–2024 của các nguồn khác; giữa 2019 vệ tinh vào chế độ an toàn nên
  có khoảng trống vài tuần.
- Harmony tự tạm dừng (`paused`) job có trên ~300 granule sau bước xem trước; `harmony_job()` trong
  `download/common.py` tự cho chạy tiếp.
