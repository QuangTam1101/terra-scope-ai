# processed_data: dữ liệu đã xử lý của Terra-scope AI

Dữ liệu đã làm sạch, dùng được ngay cho các phần web/backend, AI Earth Detective, Contradiction Hunter và báo cáo. Folder này do nhánh `data-pipeline` tạo ra.

File này trả lời ba câu hỏi:
1. Có những dữ liệu gì, và tính chất của chúng ra sao.
2. Dữ liệu đã được xử lý thế nào.
3. Dùng như thế nào, và cần tránh những bẫy gì.

Lý do của từng quyết định nằm ở [`../docs/`](../docs/) (01 thiết kế pipeline, 02 adapter, 03 chuẩn hoá và QA).

## 1. Danh sách file

| File | Nội dung | Kích thước dữ liệu | Dung lượng |
|---|---|---|---|
| `grid/cube_precip.nc` | Lượng mưa tháng, toàn cầu | 288 tháng × 180 × 360 ô | 53 MB |
| `grid/cube_soil_moisture.nc` | Độ ẩm đất 0–10 cm, đất liền | như trên | 16 MB |
| `grid/cube_tair_land.nc` | Nhiệt độ không khí, đất liền | như trên | 16 MB |
| `grid/cube_evap_gldas.nc` | Bốc thoát hơi, đất liền | như trên | 18 MB |
| `grid/cube_t2m.nc` | Nhiệt độ không khí 2 m, toàn cầu | như trên | 45 MB |
| `regions/observations.parquet` | Chuỗi tháng của 3 vùng mẫu ở Việt Nam: NDVI, LST ngày/đêm. ET/PET sẽ thêm khi NASA xử lý xong request R3 | 1 dòng = vùng × biến × tháng (hiện 2.592 dòng) | < 1 MB |

- **Cube lưới (`grid/`) là dữ liệu chính của app**: bản đồ nhiệt xu hướng, phân tích vùng người dùng vẽ ở bất kỳ đâu, Contradiction Hunter.
- **Vùng mẫu (`regions/`) chỉ để kiểm chứng phương pháp**, không phải phạm vi phân tích của app.

## 2. Quy ước chung cho mọi file

- **Thời gian:** theo tháng, từ 01/2001 đến 12/2024, đủ **288 tháng**.
  - Nhãn là ngày đầu tháng: `2001-01-01` nghĩa là "tháng 1/2001".
  - Không có ngày hay giờ nào khác.
- **NaN nghĩa là không có dữ liệu.** Có hai trường hợp:
  - Nằm ngoài vùng phủ của nguồn, ví dụ ô biển với biến GLDAS.
  - Bị loại vì chất lượng, ví dụ mây.

  Pipeline không nội suy và không điền 0. **Đừng `fillna(0)`**: sẽ tạo ra số giả.
- **Toạ độ:** độ, EPSG:4326. Giá trị là tâm ô 1°:
  - `lat` tăng dần từ −89.5 đến 89.5.
  - `lon` từ −179.5 đến 179.5 (không dùng hệ 0–360).
- **Đơn vị đã chuẩn hoá**, ghi trong thuộc tính `units` (cube) hoặc cột `unit` (parquet).
- **Truy được nguồn:** mỗi cube có thuộc tính `source`, `dataset`, `source_variable`; parquet có các cột cùng tên, thêm `request_ref`.

## 3. Lưới toàn cầu: `grid/cube_<biến>.nc`

### 3.1 Tính chất

Mỗi file là một `xarray.DataArray` kiểu **float32**, chiều `(time: 288, lat: 180, lon: 360)`. Tên DataArray trùng tên biến (`precip`, `soil_moisture`…).

Ô nào đã có dữ liệu thì có **đủ 288 tháng**, không có tháng trống giữa chuỗi. Các con số dưới đây đo trực tiếp trên file.

| Biến | Ý nghĩa | Nguồn NASA (lưới gốc) | Đơn vị | Số ô có dữ liệu | p1 / trung vị / p99 |
|---|---|---|---|---|---|
| `precip` | Tổng lượng mưa trong tháng | GPM IMERG V07 tháng, `GPM_3IMERGM.07` (0,1°) | mm/tháng | 64.800 / 64.800 (cả biển) | 0 / 33,6 / 426 (max 2.660) |
| `soil_moisture` | Độ ẩm đất lớp 0–10 cm | GLDAS Noah 2.1 tháng, `SoilMoi0_10cm_inst` (0,25°) | m³/m³ | 17.284 (đất liền, 55,5°S–83,5°N) | 0,048 / 0,25 / 1,0 |
| `tair_land` | Nhiệt độ không khí gần mặt đất | GLDAS Noah 2.1, `Tair_f_inst` (0,25°) | °C | 17.392 (đất liền) | −32 / 13,1 / 34,5 |
| `evap_gldas` | Bốc thoát hơi, **tốc độ trung bình ngày** của tháng | GLDAS Noah 2.1, `Evap_tavg` (0,25°) | mm/ngày | 17.284 (đất liền) | −0,007 / 0,78 / 4,9 |
| `t2m` | Nhiệt độ không khí 2 m | MERRA-2, `M2IMNXASM` `T2M` (0,5° × 0,625°) | °C | 64.800 / 64.800 (cả biển) | −59,5 / 10,5 / 30,7 (min −73,7) |

Ghi chú:
- **GLDAS chỉ có đất liền, từ 60°S trở lên.** Ô biển và Nam Cực luôn là NaN với `soil_moisture`, `tair_land`, `evap_gldas`. Muốn có nhiệt độ cả trên biển thì dùng `t2m`.
- **Hai biến nhiệt độ khác nguồn:** `tair_land` là mô hình mặt đất GLDAS, `t2m` là tái phân tích MERRA-2. Đừng ghép chúng thành một chuỗi.
- **`evap_gldas` có đơn vị mm/ngày.** Muốn đổi ra mm/tháng thì nhân với số ngày của tháng: `cube * cube.time.dt.days_in_month`.
- Bản trong folder được **nén zlib, không mất dữ liệu**. Đọc lại giống hệt bản gốc (đã kiểm tra bằng `xr.testing.assert_identical`), và xarray tự giải nén khi đọc.

### 3.1b Tám cube 1° thêm ngày 15/11/2026 (cho web)

Làm từ sản phẩm 0,5° đã làm sạch của `preprocess/clean.py` (repo data pipeline riêng): trung bình khối 2 × 2 ô (bỏ NaN), cùng lưới và
quy ước toạ độ như trên. Ẩm đất: ô có lúc > 0,6 m³/m³ (ven băng) bị bỏ **trước** khi gộp. Trục thời gian chỉ gồm các tháng có dữ liệu,
vì backend đọc khoảng thời gian từ trục `time`, nên số tháng khác nhau.

| File | Nội dung | Thời gian | Đơn vị | Dung lượng |
|---|---|---|---|---|
| `grid/cube_precip_gpcc.nc` | Mưa, trạm đo GPCC Full Data v2022 (không phải NASA) | 2001-01 → 2020-12 | mm/tháng | 17 MB |
| `grid/cube_precip_cru.nc` | Mưa, trạm đo CRU TS 4.10 (không phải NASA) | 2001-01 → 2025-12 | mm/tháng | 13 MB |
| `grid/cube_sm_surface_smap.nc` | Ẩm đất lớp mặt SMAP SPL3SMP (chỉ ô chất lượng tốt) | 2015-04 → 2025-12 | m³/m³ | 4 MB |
| `grid/cube_sm_10_40cm_gldas.nc` | Ẩm đất GLDAS 10–40 cm | 2001-01 → 2025-12 | m³/m³ | 15 MB |
| `grid/cube_sm_40_100cm_gldas.nc` | Ẩm đất GLDAS 40–100 cm | 2001-01 → 2025-12 | m³/m³ | 15 MB |
| `grid/cube_sm_100_200cm_gldas.nc` | Ẩm đất GLDAS 100–200 cm | 2001-01 → 2025-12 | m³/m³ | 14 MB |
| `grid/cube_rootmoist_gldas.nc` | Nước trong đất vùng rễ GLDAS (độ sâu đổi theo lớp thực vật, không chia cho độ dày cố định) | 2001-01 → 2025-12 | kg/m² | 16 MB |
| `grid/cube_chlor_a_seawifs.nc` | Chlorophyll-a mặt biển SeaWiFS (vệ tinh ngừng cuối 2010) | 2001-01 → 2010-12 | mg/m³ | 12 MB |

Muốn file vào container backend thì phải thêm tên file vào `.dockerignore` (danh sách cho phép từng file).

### 3.2 Đã xử lý thế nào

1. **Tải** qua NASA Harmony (dịch vụ HOSS của GES DISC). Mỗi biến gồm 288 file tháng NetCDF-4, toàn cầu, ở lưới gốc.
2. **Đọc:**
   - IMERG nằm trong nhóm `Grid` với chiều (time, lon, lat); được chuyển về (time, lat, lon).
   - Giá trị fill được đổi thành NaN.
3. **Gộp về ô 1° bằng trung bình khối:** lấy trung bình đều mọi ô gốc có tâm nằm trong ô 1°.
   - Số ô gốc mỗi ô 1°: IMERG 100, GLDAS 16, MERRA-2 2–4.
   - Bỏ qua NaN khi tính trung bình.
   - Không đặt trọng số diện tích bên trong một ô 1°, vì chênh lệch dưới 1%.
4. **Đưa về lưới chuẩn 180 × 360.** Phần dưới 60°S của GLDAS điền NaN.
5. **Chuẩn hoá nhãn thời gian về ngày đầu tháng.** IMERG ghi theo lịch julian; đã chuyển đổi.
6. **Đổi đơn vị.** Trước khi đổi, pipeline kiểm tra đơn vị nguồn; sai đơn vị thì dừng chứ không đổi bừa.

   | Biến | Đơn vị nguồn → chuẩn | Phép đổi |
   |---|---|---|
   | Mưa IMERG | mm/giờ → mm/tháng | × 24 × số ngày của tháng |
   | Ẩm đất | kg/m² → m³/m³ | ÷ 100 (lớp đất dày 10 cm) |
   | Evap | kg/m²/s → mm/ngày | × 86.400 |
   | Tair, T2M | K → °C | − 273,15 |
7. **Lưu dạng float32.**

Những việc **không** làm:
- Không nội suy.
- Không cắt giá trị về biên: số lạ nhưng có thật vẫn được giữ, xem §5.
- Không lọc QA thêm: đây là sản phẩm cấp 3 và đầu ra mô hình, không có lớp QA theo pixel.

## 4. Vùng mẫu: `regions/observations.parquet`

### 4.1 Tính chất

Bảng dạng dài: mỗi dòng là **1 vùng × 1 biến × 1 tháng**. Hiện có 3 vùng × 3 biến × 288 tháng = 2.592 dòng. Khi có ET/PET sẽ là 5 biến, 4.320 dòng.

**Các vùng** (bbox theo thứ tự Tây, Nam, Đông, Bắc, đơn vị độ):

| `region_id` | Vùng | bbox |
|---|---|---|
| `mekong_delta` | Đồng bằng sông Cửu Long | 104.4, 8.5, 106.9, 11.1 |
| `central_highlands` | Tây Nguyên | 107.2, 11.2, 109.0, 15.5 |
| `hanoi` | Hà Nội | 105.3, 20.5, 106.1, 21.4 |

**Các biến:**

| `variable` | Ý nghĩa | Sản phẩm MODIS (độ phân giải) | Đơn vị | Trung bình theo vùng |
|---|---|---|---|---|
| `ndvi` | Chỉ số thực vật (độ xanh) | MOD13A3.061, tháng (1 km) | không thứ nguyên, −0,2..1 | 0,55 (ĐBSCL) · 0,58 (Hà Nội) · 0,73 (Tây Nguyên) |
| `lst_day` | Nhiệt độ **bề mặt đất** ban ngày (~10:30) | MOD11A2.061, 8 ngày (1 km) | °C | 28–30 |
| `lst_night` | Nhiệt độ bề mặt đất ban đêm (~22:30) | MOD11A2.061, 8 ngày (1 km) | °C | 20–24 |
| `et` | Bốc thoát hơi thực tế | MOD16A2GF.061, 8 ngày (500 m) | mm/tháng | (cập nhật khi có R3) |
| `pet` | Bốc thoát hơi tiềm năng | MOD16A2GF.061, 8 ngày (500 m) | mm/tháng | (cập nhật khi có R3) |

LST là nhiệt độ của **mặt đất**, không phải của không khí. Ban ngày, LST cao hơn nhiệt độ không khí vài độ.

**Các cột:**

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `region_id`, `variable`, `time` | str, str, datetime | Khoá của dòng. Không có hai dòng trùng khoá |
| `value` | float64 | Giá trị tháng theo đơn vị ở cột `unit`. NaN = tháng bị loại |
| `unit` | str | `1`, `degC` hoặc `mm/month` |
| `geom_type`, `agg` | str | `polygon`, `area_mean`: trung bình mọi pixel trong bbox |
| `n_valid` | int | Số pixel hợp lệ. Với LST/ET là tổng qua các ảnh 8 ngày trong tháng |
| `valid_frac` | float | Tỷ lệ pixel hợp lệ trên tổng số pixel trong vùng. Với LST/ET là trung bình các ảnh trong tháng. **Dùng để biết độ tin cậy của tháng đó** |
| `qa_policy` | str | Luật lọc chất lượng đã áp (§4.2, bước 5) |
| `source`, `dataset`, `source_variable` | str | `appeears`, ví dụ `MOD13A3.061`, `_1_km_monthly_NDVI` |
| `request_ref` | str | Mã task AppEEARS, để truy ngược đúng request đã tải |
| `pipeline_version` | str | Phiên bản code tạo ra dòng này (`0.1.0`) |

**Độ phủ** (tỷ lệ tháng có số) và **đủ điều kiện chạy xu hướng hay chưa** (`trend_ready`: ≥ 70% tháng có số, mỗi tháng trong năm có ≥ 10 năm dữ liệu):

| Vùng | `ndvi` | `lst_day` | `lst_night` | `et` | `pet` |
|---|---|---|---|---|---|
| Tây Nguyên | 99% ✅ | 96% ✅ | 84% ✅ | — | — |
| Hà Nội | 70% ❌ | 84% ✅ | 89% ✅ | — | — |
| ĐBSCL | 69% ❌ | 56% ❌ | 42% ❌ | — | — |

ĐBSCL thiếu nhiều nhất vì mây mùa mưa: LST tháng 5–10 gần như trống.

### 4.2 Đã xử lý thế nào

1. **Tải** qua NASA AppEEARS, dạng area request:
   - Định dạng NetCDF-4, lưới gốc sinusoidal. Lưới này có pixel đều diện tích nên không cần trọng số.
   - Khoảng thời gian 2001–2024.
2. **Đọc số thô** (`mask_and_scale=False`), để tự kiểm soát giá trị fill và QA thay vì để thư viện tự che.
3. **Đổi giá trị fill thành NaN:**
   - NDVI: −3000.
   - LST: 0.
   - ET/PET: mọi giá trị > 32.700. Các mã 32.761–32.767 đánh dấu nước, đô thị, đất trống, băng hoặc fill, không phải số đo.
4. **Nhân hệ số scale:** NDVI × 0,0001; LST × 0,02 (ra K); ET/PET × 0,1 (ra mm/8 ngày). File gốc lưu số nguyên.
5. **Lọc chất lượng (QA), chủ yếu là lọc mây:**
   - **NDVI** (`modland_good`): chỉ giữ pixel "good", tức bit 0–1 của `VI_Quality` bằng 00.
   - **LST** (`modland_good_or_lst_err_le_2k`): giữ pixel "good"; hoặc pixel "chất lượng khác" nhưng sai số ≤ 2 K (bit 0–1 = 01 và bit 6–7 ≤ 01).
     - Bẫy: QC khai giá trị fill = 0, nhưng QC = 0 lại là **tốt nhất**. Vì vậy không bao giờ che QC theo fill.
   - **ET/PET** (`et_valid_only`): không lọc QA thêm. MOD16A2GF là bản đã lấp khoảng trống (gap-filled); lọc theo QA sẽ bỏ đúng phần đã được lấp.
6. **Trung bình vùng:**
   - Lấy các pixel có tâm nằm trong bbox (bbox được chiếu sang lưới sinusoidal), trọng số bằng nhau.
   - Ảnh nào có dưới 30% pixel hợp lệ thì cho giá trị NaN.
7. **Đưa về theo tháng:**
   - **NDVI:** sản phẩm đã theo tháng, chỉ chuẩn hoá nhãn.
   - **LST:** giá trị mỗi ảnh 8 ngày được trải đều cho các ngày ảnh đó phủ; giá trị tháng là **trung bình theo ngày**. Cần ít nhất 2 ảnh hợp lệ trong tháng.
   - **ET/PET:** lượng của mỗi ảnh 8 ngày chia đều cho từng ngày, rồi **cộng** trong tháng. Tháng phải đủ mọi ngày và có ít nhất 2 ảnh hợp lệ. Ảnh cuối năm chỉ phủ 5–6 ngày.
8. **Đổi đơn vị:** LST từ K sang °C.
9. **Cắt về 01/2001–12/2024.** AppEEARS trả thêm ảnh bắt đầu ngày 26/12/2000.
10. **Tháng có `valid_frac` < 0,3 thì cho `value` = NaN.**
11. **Kiểm tra cuối (`validate`):** đủ cột, không trùng khoá, nhãn là đầu tháng, đúng đơn vị, giá trị nằm trong khoảng hợp lệ. Sai bất kỳ điều kiện nào thì dừng, không ghi file.

## 5. Bẫy cần biết trước khi phân tích

1. **NaN là "không biết", không phải 0.** Tính trung bình thì bỏ NaN (mặc định của xarray/pandas). Đừng điền 0 và đừng nội suy.
2. **Ẩm đất trên ô băng:**
   - 563 ô (3,3% đất liền: Greenland, đảo Bắc Cực…) có `soil_moisture` = 1,0 cố định suốt 24 năm. Xu hướng ra 0, nhưng thực chất là không có số liệu.
   - Thêm 391 ô ven băng (63–82°N) có giá trị trộn khoảng 0,77.
   - Từ 15/11/2026 `pipeline.api.load_cube` tự che cả ô có lúc > 0,6 m³/m³ (khoảng `SANITY`) ở mọi biến m³/m³, đúng 954 ô này trên `soil_moisture`. Đọc file trực tiếp bằng xarray thì vẫn thấy chúng: tự che bằng `sm.where(sm.max("time") <= 0.6)`.
3. **`evap_gldas` âm là có thật:** đó là ngưng tụ hoặc đọng sương giá. Chiếm khoảng 3% ô-tháng, 99% số đó nằm ở vĩ độ trên 50°.
4. **`t2m` dưới −70 °C ở Nam Cực là có thật:** 313 ô-tháng, đều ở phía nam 72,5°S.
5. **Chuỗi hằng số**, ví dụ mưa = 0 quanh năm ở sa mạc, làm kiểm định xu hướng trả về NaN. Thư viện `pymannkendall` sẽ in `RuntimeWarning: invalid value encountered in sqrt`; cảnh báo này là bình thường.
6. **Vùng ven biển:** IMERG và MERRA-2 phủ cả biển, còn GLDAS chỉ có đất liền. Cùng một bbox, các biến khác nhau có thể được trung bình trên những diện tích khác nhau.
7. **Ô 1° rộng khoảng 111 km.** Không dùng để kết luận cho cấp xã hay huyện. Bbox nhỏ hơn một ô thì `region_series` báo lỗi.
8. **LST chỉ đo được khi trời quang.** Tháng mùa mưa bị thiếu, và giá trị có xu hướng nghiêng về những ngày nắng hiếm hoi.
9. **Quỹ đạo vệ tinh Terra trôi những năm gần đây.** LST ban ngày (và ET, vốn dùng đầu vào từ Terra) có thể giảm nhẹ một cách giả tạo.
10. **NDVI chưa loại pixel nước.** Vùng nhiều sông, đầm có thể bị kéo thấp.
11. **Xu hướng là "xu hướng quan sát được", không khẳng định nguyên nhân.**

## 6. Cách dùng

```python
import pandas as pd
import xarray as xr

# Lưới toàn cầu
cube = xr.open_dataarray("processed_data/grid/cube_precip.nc")    # (time, lat, lon), mm/tháng
cube.sel(time="2020-07")                                           # bản đồ tháng 7/2020
cube.sel(lat=slice(8, 23), lon=slice(102, 110))                    # cắt vùng; lat tăng dần nên viết slice(nam, bắc)
cube.sel(lat=21.0, lon=105.8, method="nearest").to_series()        # chuỗi 288 tháng của ô chứa Hà Nội

# Chuỗi trung bình vùng, có trọng số cos(vĩ độ)
from pipeline.grid import region_series
value, frac = region_series(cube, (102, 8, 110, 23))               # bbox = (Tây, Nam, Đông, Bắc)

# Vùng mẫu
obs = pd.read_parquet("processed_data/regions/observations.parquet")
s = obs.query("region_id == 'hanoi' and variable == 'ndvi'").set_index("time")["value"]
```

**Hàm phân tích có sẵn** trong [`pipeline/api.py`](../pipeline/api.py). Mỗi hàm trả về dict JSON gồm số liệu, nguồn, phương pháp và giới hạn. Backend chỉ cần bọc thành endpoint; AI Detective gọi như tool.

| Hàm | Dùng cho |
|---|---|
| `list_variables()` | Danh sách biến, đơn vị, nguồn |
| `trend_map(variable, start, end)` | Bản đồ nhiệt xu hướng toàn cầu: mỗi ô cho độ dốc mỗi thập kỷ và q-value (FDR) |
| `analyze_region(variable, bbox, start, end)` | Vùng người dùng vẽ: chuỗi tháng, xu hướng, chất lượng dữ liệu |
| `compare_regions(variable, bbox_a, bbox_b, start, end)` | So sánh xu hướng hai vùng, có kiểm định khác biệt |
| `find_contradictions(variable, start, end)` | Contradiction Hunter: các cặp vùng có xu hướng ngược nhau |

`api.py` đọc cube theo đường dẫn tương đối `data/processed/grid/`. Trước khi gọi, chạy lệnh sau từ trong `data-pipeline/`:
```bash
mkdir -p data/processed && cp -r processed_data/grid data/processed/
```

## 7. Đã kiểm tra những gì

- **Cube:**
  - Mỗi biến đủ 288 file tháng.
  - Giá trị hợp lý ở các điểm thử: Hà Nội, Sahara, Amazon.
  - Trung bình theo vĩ độ đúng quy luật khí hậu.
  - Các giá trị ngoài khoảng kỳ vọng đều đã được giải thích (§5).
- **Vùng mẫu:**
  - Mask vùng lấy được 99,1–99,8% số pixel mà AppEEARS tự đếm.
  - LST ngày tương quan với GLDAS Tair: r = 0,88 (ĐBSCL), 0,77 (Tây Nguyên), 0,94 (Hà Nội). LST > Tair ở 100% số tháng, đúng kỳ vọng.
  - `validate` đạt; không có giá trị nào ngoài khoảng kỳ vọng.
- **Bản nén:** đọc lại giống hệt bản gốc.

## 8. Tạo lại dữ liệu

Chạy từ `data-pipeline/`, cần tài khoản NASA Earthdata trong `.env`:
- `download_grid.py`: tải lưới qua Harmony, rồi dựng `cube_<biến>.nc`.
- `download_appeears.sh`: gửi các request vùng mẫu.
- `build_regions.py`: tạo `observations.parquet`.

Pipeline ghi ra `data/processed/`, là thư mục không đưa lên git. Folder này là bản sao đã nén để chia sẻ.
