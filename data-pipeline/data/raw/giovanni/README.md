# Giovanni (NASA GES DISC) – lưới tháng mưa, độ ẩm đất, nhiệt độ, bốc hơi cho cả bbox Mekong

**Nguồn trên trang challenge:** "Giovanni" (NASA resources). Giovanni là công cụ xem/tính trên web; dữ liệu gốc phía
sau là các sản phẩm GES DISC. Ở đây tải đúng các biến Giovanni đó (cùng mã biến) dưới dạng lưới qua dịch vụ
**Harmony HOSS** (cắt theo bbox phía server), để tự tính xu hướng thay vì chỉ xem ảnh trên Giovanni.
**Script:** `download/giovanni_hoss.py` (đăng nhập bằng `.env`).

## Biến (mỗi biến một thư mục, tên = mã biến Giovanni)

| Thư mục / mã biến | Nghĩa | Đơn vị gốc | Lưới (lat × lon) |
|---|---|---|---|
| `GPM_3IMERGM_07_precipitation` | mưa vệ tinh IMERG Final V07, trung bình tháng | mm/giờ | 0,1° (270 × 160) |
| `GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst` | độ ẩm đất tầng 0–10 cm | kg/m² | 0,25° (108 × 64) |
| `GLDAS_NOAH025_M_2_1_SoilMoi10_40cm_inst` | độ ẩm đất tầng 10–40 cm | kg/m² | 0,25° |
| `GLDAS_NOAH025_M_2_1_SoilMoi40_100cm_inst` | độ ẩm đất tầng 40–100 cm | kg/m² | 0,25° |
| `GLDAS_NOAH025_M_2_1_SoilMoi100_200cm_inst` | độ ẩm đất tầng 100–200 cm | kg/m² | 0,25° |
| `GLDAS_NOAH025_M_2_1_RootMoist_inst` | độ ẩm đất vùng rễ (độ sâu thay đổi theo lớp thực vật, xem dưới) | kg/m² | 0,25° |
| `GLDAS_NOAH025_M_2_1_Tair_f_inst` | nhiệt độ không khí (đầu vào GLDAS) | K | 0,25° (108 × 64) |
| `GLDAS_NOAH025_M_2_1_Evap_tavg` | bốc thoát hơi thực tế | kg/m²/s | 0,25° (108 × 64) |
| `M2IMNXASM_5_12_4_T2M` | nhiệt độ 2 m của tái phân tích MERRA-2 | K | 0,5° × 0,625° (55 × 26) |

Mỗi thư mục có một file `<mã biến>_mekong_200101-202412.nc`: 288 tháng (2001-01 → 2024-12), trục `time, lat, lon`,
`time` là ngày đầu tháng. GLDAS kèm `time_bnds`; IMERG kèm `lat_bnds`, `lon_bnds`, `time_bnds`.

## Cách cắt

- Lấy các ô có **tâm** nằm trong bbox 94–110°E, 8–35°N (kể cả tâm nằm đúng trên biên, như MERRA-2 có tâm tại 8°,
  35°, 110°). Giá trị giữ nguyên như NASA phát hành: không nội suy, không đổi đơn vị, không lọc.
- IMERG trong file gốc nằm ở nhóm (group) `Grid`; file ở đây đã đưa ra cấp gốc, đọc thẳng bằng `xr.open_dataset(f)`.

## Đổi đơn vị khi phân tích

| Biến | Đổi | Ghi chú |
|---|---|---|
| IMERG `precipitation` | × số giờ trong tháng → mm/tháng | `ds.time.dt.days_in_month * 24` |
| GLDAS `Evap_tavg` | × 86 400 × số ngày trong tháng → mm/tháng | 1 kg/m² = 1 mm nước |
| GLDAS `SoilMoi*` | ÷ độ dày tầng (mm) → m³/m³ | 0–10 cm ÷ 100; 10–40 ÷ 300; 40–100 ÷ 600; 100–200 ÷ 1000 |
| GLDAS `RootMoist` | **không** chia cho một độ dày cố định | độ sâu vùng rễ khác nhau theo ô (xem dưới) |
| `Tair_f_inst`, `T2M` | − 273,15 → °C | |

## Cần biết trước khi dùng

- **IMERG dùng lịch `julian`** (NASA khai báo như vậy): `time` đọc ra là `cftime.DatetimeJulian` (dtype object).
  Đổi sang pandas, giữ nguyên ngày/tháng/năm: `ds.indexes["time"].to_datetimeindex(unsafe=True, time_unit="ns")`.
  GLDAS và MERRA-2 dùng lịch chuẩn, đọc ra `datetime64` bình thường.
- **`RootMoist` không phải tầng 0–100 cm cố định**: Noah đặt độ sâu vùng rễ theo lớp thực vật. Đã kiểm tra bằng
  cách so với tổng các tầng `SoilMoi*`: ở ô đất nông nghiệp (Phnom Penh, Cần Thơ) `RootMoist` = đúng tổng 0–100 cm;
  ở ô rừng (Cảnh Hồng, Luang Prabang) `RootMoist` ≈ 0,93 × tổng 0–200 cm. So sánh giữa các ô hoặc đổi sang m³/m³
  thì dùng các tầng `SoilMoi*`; `RootMoist` chỉ nên dùng để xem xu hướng theo thời gian của từng ô.
- `Evap_tavg` có giá trị âm rất nhỏ (tới −3·10⁻¹⁰ kg/m²/s: ngưng tụ, sương); cẩn thận khi lấy log.
- GLDAS chỉ có trên đất liền: ô biển là NaN (khoảng 21 % số ô trong bbox). IMERG và MERRA-2 có cả trên biển.
- GLDAS là **mô hình** (Noah) có dùng mưa vệ tinh làm đầu vào, nên không độc lập với IMERG. Khi so sánh mưa với độ ẩm
  đất, nhớ rằng hai nguồn có liên quan với nhau.
- Bản 30 phút / 3 giờ tại 11 trạm dòng chính nằm ở `data/raw/hydrology_timeseries/`.
