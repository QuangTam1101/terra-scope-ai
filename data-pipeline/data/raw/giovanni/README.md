# Giovanni (NASA GES DISC) – lưới tháng toàn cầu: mưa, độ ẩm đất, nhiệt độ, bốc thoát hơi

**Nguồn trên trang challenge:** "Giovanni" (NASA resources). Giovanni là công cụ xem/tính trên web; dữ liệu phía sau
là các sản phẩm GES DISC. Ở đây tải đúng các biến Giovanni đó (cùng mã biến) dạng lưới qua dịch vụ **Harmony HOSS**,
HOSS chỉ tách biến cần lấy khỏi file gốc, giá trị, đơn vị và lưới giữ nguyên.
**Script:** `download/giovanni_hoss.py` (đăng nhập bằng `.env`). Tổng 3,6 GB.

## Biến (mỗi biến một thư mục, tên = mã biến Giovanni; 300 file tháng 2001-01 → 2025-12; IMERG Final ra sau ~3,5 tháng nên hiện có 297
file, tới 09/2025: chạy lại script khi NASA phát hành thêm)

| Thư mục / mã biến | Nghĩa | Đơn vị gốc | Lưới (lat × lon) |
|---|---|---|---|
| `GPM_3IMERGM_07_precipitation` | mưa vệ tinh IMERG Final V07, trung bình tháng | mm/giờ | 0,1°, 1800 × 3600 |
| `GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst` | độ ẩm đất tầng 0–10 cm | kg/m² | 0,25°, 600 × 1440 |
| `GLDAS_NOAH025_M_2_1_SoilMoi10_40cm_inst` | độ ẩm đất tầng 10–40 cm | kg/m² | 0,25° |
| `GLDAS_NOAH025_M_2_1_SoilMoi40_100cm_inst` | độ ẩm đất tầng 40–100 cm | kg/m² | 0,25° |
| `GLDAS_NOAH025_M_2_1_SoilMoi100_200cm_inst` | độ ẩm đất tầng 100–200 cm | kg/m² | 0,25° |
| `GLDAS_NOAH025_M_2_1_RootMoist_inst` | độ ẩm đất vùng rễ (độ sâu đổi theo lớp thực vật, xem dưới) | kg/m² | 0,25° |
| `GLDAS_NOAH025_M_2_1_Tair_f_inst` | nhiệt độ không khí (đầu vào GLDAS) | K | 0,25° |
| `GLDAS_NOAH025_M_2_1_Evap_tavg` | bốc thoát hơi thực tế | kg/m²/s | 0,25° |
| `M2IMNXASM_5_12_4_T2M` | nhiệt độ 2 m của tái phân tích MERRA-2 | K | 0,5° × 0,625°, 361 × 576 |

Tên file: `<số>_<tên granule gốc>_<biến>_subsetted.nc4`. **Số đầu tên là số thứ tự của Harmony, không theo thời
gian**: sắp xếp theo tháng trong tên granule (IMERG `.YYYYMMDD-S`, GLDAS `.AYYYYMM.`, MERRA-2 `.YYYYMM`).

| Sản phẩm | Trục | Toạ độ | Fill |
|---|---|---|---|
| IMERG | nhóm `Grid`, `precipitation(time, lon, lat)`: **lon trước lat** | lat −89,95 … 89,95; lon −179,95 … 179,95 | `-9999.9` |
| GLDAS | `(time, lat, lon)` | lat −59,875 … 89,875 (không có châu Nam Cực); lon −179,875 … 179,875 | `-9999` |
| MERRA-2 | `(time, lat, lon)` | lat −90 … 90 bước 0,5; lon −180 … 179,375 bước 0,625 (**tâm ô tại −180°**, ô vắt qua kinh tuyến 180) | `1e15` |

## Cần biết trước khi dùng (số liệu từ `reports/01_eda.md`)

- **IMERG dùng lịch `julian`** (NASA khai báo như vậy): `time` đọc ra là `cftime.DatetimeJulian`. Đổi sang pandas,
  giữ nguyên ngày/tháng/năm: `ds.indexes["time"].to_datetimeindex(unsafe=True, time_unit="ns")`. Tháng lấy từ tên file
  thì khỏi đọc `time`.
- **Ô băng của GLDAS**: 3,95 % ô đất liền (Greenland, núi băng) có độ ẩm đất đúng bằng độ dày tầng × 10 kg/m², tức
  θ = 1 m³/m³ (0–10 cm = 100; 10–40 = 300; 40–100 = 600; 100–200 = 1000), và `RootMoist` hằng 100. Đó là băng,
  không phải đất bão hoà; `preprocess/clean.py` loại (θ > 0,95).
- **`RootMoist` không phải tầng 0–100 cm cố định**: Noah đặt độ sâu vùng rễ theo lớp thực vật. So với tổng các tầng
  `SoilMoi*`: ô nông nghiệp = đúng tổng 0–100 cm; ô rừng ≈ 0,93 × tổng 0–200 cm. So sánh giữa các ô hoặc cần m³/m³
  thì dùng các tầng `SoilMoi*`; `RootMoist` chỉ dùng cho xu hướng theo thời gian của từng ô.
- `Evap_tavg` âm ở 4 % ô đất liền (tới −4,6·10⁻⁶ kg/m²/s: ngưng tụ, sương); là vật lý, giữ lại; cẩn thận khi lấy log.
- GLDAS chỉ có trên đất liền (ô biển là fill). IMERG và MERRA-2 phủ cả biển.
- GLDAS là **mô hình** (Noah) dùng mưa vệ tinh làm đầu vào, nên không độc lập với IMERG.
- Chuỗi 30 phút / 3 giờ tại một điểm bất kỳ: `download/hydrology_timeseries.py`.

## Đổi đơn vị (làm trong `preprocess/clean.py`, không làm ở đây)

| Biến | Đổi | Ghi chú |
|---|---|---|
| IMERG `precipitation` | × 24 × số ngày trong tháng → mm/tháng | |
| GLDAS `Evap_tavg` | × 86 400 × số ngày trong tháng → mm/tháng | 1 kg/m² = 1 mm nước |
| GLDAS `SoilMoi*` | ÷ (độ dày tầng cm × 10) → m³/m³ | 0–10 cm ÷ 100; 10–40 ÷ 300; 40–100 ÷ 600; 100–200 ÷ 1000 |
| GLDAS `RootMoist` | **không** chia cho độ dày cố định | độ sâu vùng rễ khác nhau theo ô |
| `Tair_f_inst`, `T2M` | − 273,15 → °C | |
