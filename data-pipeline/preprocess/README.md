# Tiền xử lý: EDA → adapter → làm sạch → schema chung

Hai script, chạy từ thư mục gốc:

```bash
.venv/bin/python preprocess/eda.py [TÊN ...]      # pha 2a → reports/01_eda.md
.venv/bin/python preprocess/clean.py [TÊN ...]    # pha 2b → data/processed/, reports/02_cleaning.md (+ .json)
.venv/bin/python preprocess/clean.py --check      # tự kiểm phần nội suy, vài giây, không cần dữ liệu
```

```
data/raw/<nguồn>/  ──eda.py──▶  reports/01_eda.md  (phát hiện → chọn adapter, bước lọc, ngưỡng)
        │
        └──clean.py: adapter ─▶ fill→NaN ─▶ scale + đổi đơn vị ─▶ miền vật lý ─▶ cờ chất lượng
                     ─▶ (SMAP: gộp ngày → tháng) ─▶ lưới chung 0,5° ─▶ schema chung ─▶ data/processed/
                     mỗi bước đếm số ô / dòng nó loại ─▶ reports/02_cleaning.md
```

Mọi con số dưới đây lấy từ hai báo cáo sinh tự động; chạy lại script thì báo cáo cập nhật theo dữ liệu.

## 1. EDA (`eda.py`): đo gì, thấy gì

`eda.py` đọc **giá trị thô** (không mask, không scale) và cho mỗi nguồn:

- **Độ phủ thời gian** trên mọi file: số bước, tháng thiếu, tháng trùng.
- **Cấu trúc**: kiểu dữ liệu, thứ tự trục, chiều lat (tăng/giảm), khoảng và bước toạ độ, thuộc tính (fill, scale,
  miền hợp lệ, đơn vị).
- **Phân bố giá trị** trên 12 bước thời gian rải đều: % fill, % NaN, % ngoài miền hợp lệ khai báo, min/p1/p50/p99/max,
  % âm, % ô **hằng số theo thời gian** và giá trị hằng hay gặp (để bắt ô "chết" như băng).
- **Biến chất lượng / số trạm** (`stn`, `numgauge`, cờ SMAP): phân bố trên các ô mà biến chính hợp lệ.
- **GSOM**: số trạm, số tháng mỗi trạm, phân bố PRCP, giải nghĩa `PRCP_ATTRIBUTES` (`a,M,Q,S`).

Phát hiện chính và hệ quả cho bước sau:

| Nguồn | Phát hiện EDA | Hệ quả trong `clean.py` |
|---|---|---|
| IMERG | trục `(time, lon, lat)`: lon trước lat; mm/giờ; fill −9999,9 ở 0,6 % ô; lịch julian | chuyển vị; × 24 × số ngày; tháng lấy từ tên file |
| GLDAS `SoilMoi*` | kg/m²; 3,95 % ô đất liền hằng θ = 1 (= độ dày tầng × 10) quanh năm: băng | ÷ (độ dày cm × 10) → m³/m³; miền hợp lệ 0–0,95 |
| GLDAS `RootMoist` | cùng các ô băng nhưng hằng 100 kg/m², không tách được bằng ngưỡng giá trị | QC "ice" dùng θ tầng 0–10 cm cùng tháng |
| GLDAS `Evap` | kg/m²/s; âm ở 4 % ô (ngưng tụ, sương) | × 86 400 × số ngày; giữ giá trị âm |
| GLDAS `Tair`, MERRA-2 `T2M` | K; MERRA-2 không có fill, tâm ô tại −180° | − 273,15; nội suy lon cộng phần chồng lấn ±360° |
| CRU | 3 file thập kỷ, `time` ngày 16, có 2025; `stn = 0` ở 15,5 % ô-tháng đất liền | adapter nhiều tháng/file; cắt 2001–2024; QC `stn = 0` |
| GPCC | lat giảm dần; dừng 2020; `numgauge = 0` ở 93,5 % ô | lật lat; không lọc theo `numgauge` (lọc thì gần như hết) |
| SeaWiFS | lat giảm dần; không có trục time; thiếu 2008-02, 2008-03, 2009-05; phân bố lệch log | lật lat; tháng từ tên file; miền 0,001–100 |
| SMAP | lưới EASE 36 km hằng ngày; 89 % ô-ngày là fill; cờ bit 0 = 1 ở 48 % ô có giá trị | adapter riêng: lọc từng ngày rồi gộp tháng |
| GSOM | một CSV mỗi trạm; thiếu 1–5 ngày ở 15,4 % dòng; nguồn `S` 3,0 %; cờ chất lượng luôn rỗng | adapter bảng trạm, lọc theo dòng |
| Tất cả | **không nguồn nào khai báo `scale_factor`/`add_offset`** | bước scale hiện chỉ đổi đơn vị (giữ để dữ liệu mới có scale vẫn đúng) |

## 2. Adapter: vì sao bốn kiểu

EDA cho thấy các nguồn khác nhau ở **cách đóng gói**, còn phép làm sạch thì giống nhau. Nên mỗi kiểu đóng gói có một
adapter, trả về cùng một dạng: `(tháng, mảng 2D (lat tăng dần, lon), thuộc tính, lat, lon, biến phụ)`; các bước sau
không cần biết nguồn.

| Adapter | Đóng gói | Nguồn | Việc riêng |
|---|---|---|---|
| `monthly_files` | lưới lat/lon đều, mỗi tháng một file | IMERG, GLDAS, MERRA-2, SeaWiFS | tháng lấy từ tên file (tên Harmony bắt đầu bằng số job, không theo thời gian); đưa trục về (lat, lon), lat tăng dần |
| `multi_month` | lưới lat/lon đều, nhiều tháng trong một file | CRU, GPCC | đọc trục `time` (CRU ghi ngày 16 → đưa về ngày 1); kèm biến phụ (`stn`) |
| `daily_ease` | lưới EASE-Grid 2.0 hằng ngày, 2 lượt AM/PM, có cờ | SMAP | lọc từng lượt từng ngày, rồi gộp tháng trên lưới EASE gốc |
| `station_csv` | một CSV mỗi trạm, giá trị kèm chuỗi cờ | GSOM | tách `PRCP_ATTRIBUTES`; giữ ở dạng điểm, không nội suy lên lưới |

## 3. Các bước làm sạch (thứ tự và lý do)

| # | Bước | Làm gì | Vì sao ở vị trí này |
|---|---|---|---|
| 1 | **fill → NaN** | `_FillValue`, `missing_value` so sánh ở **kiểu dữ liệu gốc** | trước khi scale: so sánh số thực sau khi nhân dễ lệch |
| 2 | **scale + đổi đơn vị** | `× scale_factor + add_offset` (nếu có), rồi đổi sang đơn vị chuẩn | mm/tháng cho mưa và bốc hơi, m³/m³ cho độ ẩm đất tầng, °C, mg/m³ |
| 3 | **miền vật lý** | ngoài miền hợp lệ → NaN (bảng dưới) | sau đổi đơn vị để ngưỡng viết bằng đơn vị chuẩn |
| 4 | **cờ chất lượng** | CRU `stn = 0`; SMAP bit 0; RootMoist băng; GSOM: thiếu ngày, nguồn `S` | sau miền vật lý để mỗi bước đếm riêng phần nó loại |
| 5 | **gộp thời gian** (SMAP) | trung bình tháng các lượt AM + PM đã qua 1–4; cần ≥ `MIN_OBS` = 5 lượt | lọc **trước** khi gộp: một lượt xấu không lẫn vào trung bình |
| 6 | **lưới chung** | trung bình có trọng số diện tích về 0,5°; ô phủ < `MIN_COVER` = 50 % → NaN. SMAP: lấy mẫu 4 × 4 điểm mỗi ô | cuối cùng, trên giá trị đã sạch: NaN không kéo trung bình |
| 7 | **schema chung** | ghi NetCDF / Parquet theo mục 5 | |

Miền vật lý theo sản phẩm (`PRODUCTS` trong `clean.py`):

| Sản phẩm | Miền hợp lệ | Lý do |
|---|---|---|
| mưa (IMERG, CRU, GPCC) | ≥ 0 | |
| `precip_gsom` | 0–9 300 mm/tháng | kỷ lục tháng thế giới (Cherrapunji 7/1861) |
| `sm_*_gldas` | 0–0,95 m³/m³ | θ = 1 là băng; độ rỗng đất thật < 0,95 |
| `sm_surface_smap` | 0,02–0,5 m³/m³ | miền hợp lệ SMAP khai báo |
| nhiệt độ | −90 … 60 °C | ngoài kỷ lục Trái Đất |
| `chlor_a_seawifs` | 0,001–100 mg/m³ | `valid_min`/`valid_max` của file |
| `evap_gldas`, `rootmoist_gldas` | không giới hạn trên (evap được âm) | |

## 4. Hiệu quả từng bước (đo được, `reports/02_cleaning.md`)

Tỉ lệ % tính trên **tổng số ô × tháng của lưới gốc** trong 2001–2024 (cột "ô 0,5° có dữ liệu" tính trên lưới chung).

| Sản phẩm | fill → NaN | ngoài miền vật lý | lọc chất lượng | ô 0,5° có dữ liệu | Đọc kết quả |
|---|---|---|---|---|---|
| `precip_imerg` | 0,60 % | 0 | 0 | 99,8 % | fill gần cực; còn lại phủ kín toàn cầu |
| `precip_cru` | 74,0 % | 0 | **3,7 %** | 24,6 % | fill = biển; QC bỏ ô-tháng không có trạm (khí hậu điền vào) |
| `precip_gpcc` | 71,9 % | 0 | 0 | 28,4 % | chỉ đất liền, 240 tháng |
| `sm_*_gldas` (4 tầng) | 71,9 % | **1,11 %** | 0 | 22,7 % | miền vật lý bỏ đúng các ô băng (3,95 % ô đất liền) |
| `rootmoist_gldas` | 71,9 % | 0 | **1,11 %** | 22,7 % | QC "ice" bỏ cùng các ô băng; độ phủ khớp các tầng |
| `tair_gldas` | 71,5 % | 0 | 0 | 23,9 % | |
| `evap_gldas` | 71,9 % | 0 | 0 | 23,6 % | p1 = −0,32 mm/tháng: giữ ngưng tụ |
| `t2m_merra2` | 0 | 0 | 0 | 100 % | kiểm tra nội suy vắt kinh tuyến 180 (trước khi sửa: mất cột 179,75°) |
| `chlor_a_seawifs` | 58,0 % | 0 | 0 | 60,3 % | 116 tháng có dữ liệu trong 2001–2010; 2008-01 rỗng sau lưới chung (vệ tinh gián đoạn) |
| `sm_surface_smap` | xem báo cáo | | | | lọc từng ngày; thêm cột "ô-tháng < MIN_OBS lượt" |

GSOM (tỉ lệ trên 8 072 959 dòng trạm × tháng, mỗi bước chỉ đếm dòng bước trước chưa loại):

| PRCP trống | cờ chất lượng ≠ rỗng | thiếu > 0 ngày | nguồn `S` | ngoài miền | trạm còn lại | trạm ≥ 240 tháng |
|---|---|---|---|---|---|---|
| 4,9 % | 0 | **14,6 %** | 1,5 % | 0 | 72 317 | 8 474 (trước lọc: 11 292) |

Đánh đổi lớn nhất là **bỏ tháng thiếu ngày của GSOM**: mất 14,6 % dòng và 1/4 số trạm có chuỗi ≥ 20 năm, đổi lại không
còn tổng tháng bị thiếu (thấp hơn thực tới 5/30). Ngưỡng ở `GSOM_MAX_MISSING_DAYS` (đặt 5 để giữ lại như GSOM).

## 5. Schema chung

**Lưới** `data/processed/grid/<sản phẩm>.nc` (NetCDF4, nén zlib):

| Mục | Giá trị |
|---|---|
| Biến | một biến, tên = tên sản phẩm (ví dụ `precip_imerg`), float32, NaN = không có dữ liệu |
| Trục | `time` 288 tháng (ngày đầu tháng, 2001-01 … 2024-12), `lat` 360 (−89,75 … 89,75), `lon` 720 (−179,75 … 179,75) |
| Thuộc tính | `units` (đơn vị chuẩn), `source_dataset`, `source_variable`, `processing` (các bước và ngưỡng đã áp), `note` |

Tháng nguồn không có (GPCC sau 2020, SeaWiFS sau 2010, SMAP trước 04/2015) là NaN: mọi sản phẩm cùng một trục, ghép
thẳng bằng `xr.merge` được.

**Trạm** `data/processed/stations/precip_gsom.parquet`: bảng dài, cột `station, lat, lon, elev_m, time, precip_gsom`
(mm/tháng, float32), chỉ dòng qua mọi bước lọc.

## 6. Vì sao lưới 0,5° và nội suy bảo toàn diện tích

- **0,5° là độ phân giải thô nhất của các nguồn mưa chính** (CRU 0,5°; SMAP 36 km ≈ 0,33°): gộp lên từ IMERG 0,1°,
  GLDAS/GPCC 0,25° không bịa thêm chi tiết; làm mịn CRU xuống 0,1° thì có. Mất chi tiết của IMERG ở vùng núi; khi cần
  chi tiết của một vùng thì dùng công cụ theo vùng (AppEEARS, Hydrology Time Series) hoặc file thô.
- **Kích thước**: 259 200 ô × 288 tháng ≈ 300 MB/sản phẩm khi chưa nén: tính Mann-Kendall cho từng ô toàn cầu vẫn vừa
  bộ nhớ máy cá nhân.
- **Bảo toàn diện tích** (trọng số = diện tích phần chồng lấn trên mặt cầu, theo sin vĩ độ): giữ đúng trung bình
  vùng (mm/tháng của ô 0,5° = trung bình các ô nhỏ bên trong) và bỏ qua ô NaN thay vì để NaN lan ra. Song tuyến
  (bilinear) không bảo toàn tổng và làm nhoè bờ biển.
- **`MIN_COVER` = 50 %**: ô ven biển chỉ giữ khi ít nhất nửa diện tích có dữ liệu hợp lệ; thấp hơn thì một mẩu đất nhỏ
  đại diện cho cả ô.
- **SMAP lấy mẫu 4 × 4 điểm** thay vì gom tâm ô EASE: ô EASE có diện tích bằng nhau nên ở vĩ độ cao cao tới ~1° vĩ độ,
  nhiều ô 0,5° không chứa tâm ô EASE nào.

## 7. Kiểm tra

`clean.py --check` chạy 4 phép thử, không cần dữ liệu:

1. Lưới nguồn trùng lưới chung → kết quả giống hệt đầu vào (trọng số đúng, không lệch nửa ô).
2. Trường hằng số trên lưới MERRA-2 (tâm ô −180°, lat ±90) → hằng số, **không thiếu ô nào** (bắt lỗi kinh tuyến 180).
3. Lưới 0,25° có đúng nửa số ô NaN → mọi ô 0,5° vẫn giữ (ngưỡng `MIN_COVER` tính đúng).
4. SMAP: trường "vĩ độ của ô EASE" lấy mẫu về 0,5° lệch < 0,15° so với vĩ độ ô đích dưới 60° (chỉ số và chiều lưới
  EASE đúng; trên 60° sai số do kích thước ô EASE, không phải lỗi).

Kiểm tra thủ công một ô: mở `data/processed/grid/<sản phẩm>.nc` và file thô cùng tháng, so trung bình các ô gốc nằm
trong ô 0,5° với giá trị đã xử lý (sau khi đổi đơn vị).

## 8. Giới hạn đã biết

- GLDAS là mô hình dùng mưa vệ tinh làm đầu vào: không độc lập với IMERG khi so sánh.
- GSOM chưa đồng nhất hoá (trạm dời chỗ, đổi thiết bị); so sánh trạm với lưới để ở bước Contradiction Hunter.
- Các nguồn có chiều dài khác nhau (GPCC → 2020, SeaWiFS → 2010, SMAP từ 04/2015): bước xu hướng phải tính trên khoảng
  thời gian chung hoặc ghi rõ khoảng của từng nguồn.
