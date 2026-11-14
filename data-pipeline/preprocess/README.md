# Tiền xử lý: EDA → adapter → làm sạch → schema chung

Ba script, chạy từ thư mục gốc:

```bash
.venv/bin/python preprocess/eda.py [TÊN ...]      # pha 2a → reports/01_eda.md
.venv/bin/python preprocess/clean.py [TÊN ...]    # pha 2b → data/processed/, reports/02_cleaning.md (+ .json)
.venv/bin/python preprocess/clean.py --check      # tự kiểm phần nội suy, vài giây, không cần dữ liệu
.venv/bin/python preprocess/verify.py             # pha 2c → reports/03_verification.md (kiểm chứng độc lập, vài phút)
```

```
data/raw/<nguồn>/  ──eda.py──▶  reports/01_eda.md  (phát hiện → chọn adapter, bước lọc, ngưỡng)
        │
        └──clean.py: adapter ─▶ fill→NaN ─▶ scale + đổi đơn vị ─▶ miền vật lý ─▶ cờ chất lượng
                     ─▶ (SMAP: gộp ngày → tháng) ─▶ lưới chung 0,5° ─▶ schema chung ─▶ data/processed/
                     mỗi bước đếm số ô / dòng nó loại ─▶ reports/02_cleaning.md
data/raw + data/processed ──verify.py (code riêng)──▶ reports/03_verification.md (tính lại, so số công bố, so chéo)
```

Mọi con số dưới đây lấy từ ba báo cáo sinh tự động; chạy lại script thì báo cáo cập nhật theo dữ liệu.

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
| IMERG | trục `(time, lon, lat)`: lon trước lat; mm/giờ; fill −9999,9 ở 0,6 % ô; lịch julian; Final mới tới 09/2025 | chuyển vị; × 24 × số ngày; tháng lấy từ tên file |
| GLDAS `SoilMoi*` | kg/m²; 3,95 % ô đất liền hằng θ = 1 (= độ dày tầng × 10) quanh năm: băng | ÷ (độ dày cm × 10) → m³/m³; miền hợp lệ 0–0,95 |
| GLDAS `RootMoist` | cùng các ô băng nhưng hằng 100 kg/m², không tách được bằng ngưỡng giá trị | QC "ice" dùng θ tầng 0–10 cm cùng tháng |
| GLDAS `Evap` | kg/m²/s; âm ở 4 % ô (ngưng tụ, sương) | × 86 400 × số ngày; giữ giá trị âm |
| GLDAS `Tair`, MERRA-2 `T2M` | K; MERRA-2 không có fill, tâm ô tại −180° | − 273,15; nội suy lon cộng phần chồng lấn ±360° |
| CRU | 3 file (2001–2010, 2011–2020, 2021–2025), `time` ngày 16; `stn = 0` ở 15,5 % ô-tháng đất liền | adapter nhiều tháng/file; QC `stn = 0` |
| GPCC | lat giảm dần; dừng 2020; `numgauge = 0` ở 93,5 % ô | lật lat; không lọc theo `numgauge` (lọc thì gần như hết) |
| SeaWiFS | lat giảm dần; không có trục time; thiếu 2008-02, 2008-03, 2009-05; phân bố lệch log | lật lat; tháng từ tên file; miền 0,001–100 |
| SMAP | lưới EASE 36 km hằng ngày; 90 % ô-ngày là fill; cờ bit 0 = 1 ở 42 % ô có giá trị; thiếu 84 ngày (2 đợt chế độ an toàn 2019, 2022) | adapter riêng: lọc từng ngày rồi gộp tháng |
| GSOM | một CSV mỗi trạm; thiếu 1–5 ngày ở 15,6 % dòng; nguồn `S` 3,0 %; cờ chất lượng luôn rỗng | adapter bảng trạm, lọc theo dòng |
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

Tỉ lệ % tính trên **tổng số ô × tháng của lưới gốc** trong 2001–2025 (cột "ô 0,5° có dữ liệu" tính trên lưới chung).

| Sản phẩm | fill → NaN | ngoài miền vật lý | lọc chất lượng | ô 0,5° có dữ liệu | Đọc kết quả |
|---|---|---|---|---|---|
| `precip_imerg` | 0,60 % | 0 | 0 | 99,8 % | fill gần cực; còn lại phủ kín toàn cầu; 297 tháng (tới 09/2025) |
| `precip_cru` | 74,0 % | 0 | **3,8 %** | 24,6 % | fill = biển; QC bỏ ô-tháng không có trạm (khí hậu điền vào) |
| `precip_gpcc` | 71,9 % | 0 | 0 | 28,4 % | chỉ đất liền, 240 tháng |
| `sm_*_gldas` (4 tầng) | 71,9 % | **1,11 %** | 0 | 22,7 % | miền vật lý bỏ đúng các ô băng (3,95 % ô đất liền) |
| `rootmoist_gldas` | 71,9 % | 0 | **1,11 %** | 22,7 % | QC "ice" bỏ cùng các ô băng; độ phủ khớp các tầng |
| `tair_gldas` | 71,5 % | 0 | 0 | 23,9 % | |
| `evap_gldas` | 71,9 % | 0 | 0 | 23,6 % | p1 = −0,30 mm/tháng: giữ ngưng tụ |
| `t2m_merra2` | 0 | 0 | 0 | 100 % | kiểm tra nội suy vắt kinh tuyến 180 (trước khi sửa: mất cột 179,75°) |
| `chlor_a_seawifs` | 58,0 % | 0 | 0 | 60,3 % | 116 tháng có dữ liệu trong 2001–2010; 2008-01 rỗng sau lưới chung (vệ tinh gián đoạn) |
| `sm_surface_smap` | 90,2 % | 0,59 % | **3,8 %** | 12,9 % | tỉ lệ trên ô-lượt EASE; QC bỏ 42 % lượt có giá trị; 3,3 % ô-tháng EASE < 5 lượt → NaN; 129 tháng |

GSOM (tỉ lệ trên 8 428 975 dòng trạm × tháng, mỗi bước chỉ đếm dòng bước trước chưa loại):

| PRCP trống | cờ chất lượng ≠ rỗng | thiếu > 0 ngày | nguồn `S` | ngoài miền | trạm còn lại | trạm ≥ 240 tháng |
|---|---|---|---|---|---|---|
| 4,9 % | 0 | **14,9 %** | 1,4 % | 0 | 74 192 | 9 137 (trước lọc: 11 827) |

Đánh đổi lớn nhất là **bỏ tháng thiếu ngày của GSOM**: mất 14,9 % dòng và 23 % số trạm có chuỗi ≥ 20 năm, đổi lại không
còn tổng tháng bị thiếu (thấp hơn thực tới 5/30). Ngưỡng ở `GSOM_MAX_MISSING_DAYS` (đặt 5 để giữ lại như GSOM).

## 5. Schema chung

**Lưới** `data/processed/grid/<sản phẩm>.nc` (NetCDF4, nén zlib):

| Mục | Giá trị |
|---|---|
| Biến | một biến, tên = tên sản phẩm (ví dụ `precip_imerg`), float32, NaN = không có dữ liệu |
| Trục | `time` 300 tháng (ngày đầu tháng, 2001-01 … 2025-12), `lat` 360 (−89,75 … 89,75), `lon` 720 (−179,75 … 179,75) |
| Thuộc tính | `units` (đơn vị chuẩn), `source_dataset`, `source_variable`, `processing` (các bước và ngưỡng đã áp), `note` |

Tháng nguồn không có (GPCC sau 2020, SeaWiFS sau 2010, SMAP trước 04/2015, IMERG sau 09/2025 vì chưa phát hành) là
NaN: mọi sản phẩm cùng một trục, ghép thẳng bằng `xr.merge` được.

**Trạm** `data/processed/stations/precip_gsom.parquet`: bảng dài, cột `station, lat, lon, elev_m, time, precip_gsom`
(mm/tháng, float32), chỉ dòng qua mọi bước lọc.

## 6. Vì sao lưới 0,5° và nội suy bảo toàn diện tích

- **0,5° là độ phân giải thô nhất của các nguồn mưa chính** (CRU 0,5°; SMAP 36 km ≈ 0,33°): gộp lên từ IMERG 0,1°,
  GLDAS/GPCC 0,25° không bịa thêm chi tiết; làm mịn CRU xuống 0,1° thì có. Mất chi tiết của IMERG ở vùng núi; khi cần
  chi tiết của một vùng thì dùng công cụ theo vùng (AppEEARS, Hydrology Time Series) hoặc file thô.
- **Kích thước**: 259 200 ô × 300 tháng ≈ 311 MB/sản phẩm khi chưa nén: tính Mann-Kendall cho từng ô toàn cầu vẫn vừa
  bộ nhớ máy cá nhân.
- **Bảo toàn diện tích** (trọng số = diện tích phần chồng lấn trên mặt cầu, theo sin vĩ độ): giữ đúng trung bình
  vùng (mm/tháng của ô 0,5° = trung bình các ô nhỏ bên trong) và bỏ qua ô NaN thay vì để NaN lan ra. Song tuyến
  (bilinear) không bảo toàn tổng và làm nhoè bờ biển.
- **`MIN_COVER` = 50 %**: ô ven biển chỉ giữ khi ít nhất nửa diện tích có dữ liệu hợp lệ; thấp hơn thì một mẩu đất nhỏ
  đại diện cho cả ô.
- **SMAP lấy mẫu 4 × 4 điểm** thay vì gom tâm ô EASE: ô EASE có diện tích bằng nhau nên ở vĩ độ cao cao tới ~1° vĩ độ,
  nhiều ô 0,5° không chứa tâm ô EASE nào.

## 7. Kiểm tra: làm sao biết dữ liệu sạch là đúng

Ba lớp, lớp sau độc lập hơn lớp trước.

**a. `clean.py --check`** (vài giây, không cần dữ liệu): phần nội suy chạy trên dữ liệu giả có đáp án biết trước.

1. Lưới nguồn trùng lưới chung → kết quả giống hệt đầu vào (trọng số đúng, không lệch nửa ô).
2. Trường hằng số trên lưới MERRA-2 (tâm ô −180°, lat ±90) → hằng số, **không thiếu ô nào** (bắt lỗi kinh tuyến 180).
3. Lưới 0,25° có đúng nửa số ô NaN → mọi ô 0,5° vẫn giữ (ngưỡng `MIN_COVER` tính đúng).
4. SMAP: trường "vĩ độ của ô EASE" lấy mẫu về 0,5° lệch < 0,15° so với vĩ độ ô đích dưới 60° (chỉ số và chiều lưới
   EASE đúng; trên 60° sai số do kích thước ô EASE, không phải lỗi).

**b. `verify.py`** (vài phút, chạy sau `clean.py`) → `reports/03_verification.md`. Viết riêng: không import hàm xử lý
nào của `clean.py`, đọc file bằng thư viện khác (xarray tự giải mã fill, `coarsen` gộp khối thay cho ma trận trọng số),
quy tắc viết lại từ bảng ở mục 3. Ngưỡng đạt (`CRITERIA`) ghi trong code trước khi chạy.

| Phép thử | Bắt được lỗi gì | Kết quả 14/11/2026 |
|---|---|---|
| A1. Tính lại **mọi ô** 0,5° toàn cầu của 6 tháng rải đều, kể cả vị trí NaN, cho 11 sản phẩm lưới lồng vào 0,5° (khối 5×5, 2×2, 1×1, 6×6) | sai đơn vị, fill lọt, lọc sai, lật trục, lệch ô, ngưỡng 50 % sai | 11/11 khớp 100 % ô (lệch tương đối ≤ 1e-4) |
| A2. Số tháng thô = số tháng sau xử lý; tháng thô có mà sau xử lý rỗng thì tính lại cũng phải rỗng | mất tháng, lệch tháng | khớp; SeaWiFS 2008-01 rỗng ở cả hai cách |
| A3. MERRA-2 (lưới không lồng): trung bình toàn cầu trước/sau | nội suy làm lệch tổng | lệch 0,003 % |
| A4. GSOM: lọc lại 300 trạm ngẫu nhiên từ CSV gốc | sai quy tắc lọc theo dòng | 24 473 dòng, lệch 0 |
| A5. SMAP: gộp lại từ file ngày, gán ô theo lat/lon NASA ghi trong file (khác cách lấy mẫu 4 × 4) | sai cờ, sai gộp tháng, sai chỉ số EASE | r = 0,997 ở cả 3 tháng mẫu |
| B. So với số công bố: T2M toàn cầu, xu hướng ấm lên, mưa toàn cầu | sai đơn vị, sai trọng số diện tích | 14,6 °C; 0,18 °C/thập kỷ; 2,76 mm/ngày (GPCP ~2,7) |
| C1. IMERG–GPCC tương quan theo ô, và khi lệch 1 tháng | lệch thời gian | r = 0,92; lệch 1 tháng còn 0,32 |
| C2. Trạm GSOM–ô IMERG chứa trạm (34 313 trạm) | lật trục, lệch kinh độ, lệch tháng | r = 0,89; lệch 1 tháng còn 0,21 |
| C3. Bản đồ mưa trung bình IMERG–GPCC, IMERG–CRU; nhiệt độ GLDAS–MERRA-2 | lật/lệch bản đồ, sai đơn vị | r = 0,96; 0,96; 0,997 (chênh 0,23 °C) |
| C4. GLDAS 0–10 cm – SMAP theo ô | | r = 0,69 (mô hình và vệ tinh đo lớp khác nhau) |

`verify.py` đã bắt được **hai lỗi thật của `clean.py`** (đã sửa, rồi chạy lại toàn bộ):
- Toạ độ trong file IMERG, SeaWiFS là float32 (lệch tới 1,5e-5°), biên ô tính thẳng từ đó làm một mẩu ô bên cạnh lọt vào
  trung bình: 0,18 % ô IMERG lệch tới 1e-4, ô mưa 0 thành 2e-6. Sửa: `edges()` làm tròn hai biên ngoài rồi chia đều.
- Ô phủ đúng 50 % (hay gặp ở ven bờ) bị bỏ hay giữ tuỳ sai số làm tròn, trái đặc tả "≥ 50 % thì giữ" (SeaWiFS 5 ô
  trong 6 tháng mẫu). Sửa: so ngưỡng với dung sai 1e-9.

Và một lỗi của chính nó (tính độ phủ bằng float32): hai bản code viết riêng giúp lỗi ở bên nào cũng lộ ra.

**c. Không bảo đảm được gì.** `verify.py` chứng minh code làm đúng đặc tả và kết quả hợp lý về vật lý. Nó không chứng
minh: (1) đặc tả là lựa chọn tốt nhất: ngưỡng 50 %, `MIN_OBS` = 5, bỏ tháng GSOM thiếu ngày là đánh đổi (mục 3–4);
(2) sản phẩm NASA không có sai số: IMERG lệch ở vùng núi, GLDAS phụ thuộc mưa đầu vào; (3) mọi tháng đều đúng: A1 so
từng ô trên 6 tháng mẫu, các tháng khác chạy cùng code nên chỉ lỗi phụ thuộc dữ liệu của riêng một tháng mới có thể lọt
(A2 và phần B, C dùng mọi tháng).

## 8. Giới hạn đã biết

- GLDAS là mô hình dùng mưa vệ tinh làm đầu vào: không độc lập với IMERG khi so sánh.
- GSOM chưa đồng nhất hoá (trạm dời chỗ, đổi thiết bị); so sánh trạm với lưới để ở bước Contradiction Hunter.
- Các nguồn có chiều dài khác nhau (GPCC → 2020, SeaWiFS → 2010, SMAP từ 04/2015, IMERG → 09/2025): bước xu hướng
  phải tính trên khoảng thời gian chung hoặc ghi rõ khoảng của từng nguồn.
- **SMAP sau lọc chất lượng chỉ phủ 60 % diện tích đất liền**: rừng nhiệt đới không có lượt nào đạt chất lượng khuyến
  nghị (Amazon 0 % lượt, 07/2020), nên không có dữ liệu; Mekong có 41 % lượt đạt nhưng rải rác, đa số ô 0,5° không đủ
  `MIN_OBS` hoặc 50 % điểm mẫu (trung vị 0 tháng có dữ liệu). Ở các vùng này dùng GLDAS, hoặc nới lọc và ghi rõ.
- Xu hướng T2M của MERRA-2 (0,18 °C/thập kỷ, 2001–2025) ở cận dưới các ước lượng công bố (~0,2–0,3).
