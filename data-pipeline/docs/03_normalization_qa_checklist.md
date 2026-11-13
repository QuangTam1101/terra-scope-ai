# 03 — Normalization & QA Checklist (kèm code)

> **Cách dùng:** đi từ A → K theo đúng thứ tự dữ liệu chảy qua pipeline. Mỗi bước gồm ba phần:
> 1. Ô ☐ để đánh dấu.
> 2. **"Vì sao"**, để người kiểm tra hiểu mình đang chặn lỗi gì.
> 3. **Code Python** viết riêng cho đặc tính của từng dataset.
>
> Mục K liệt kê các lựa chọn phương pháp pipeline đang dùng mặc định, kèm lý do và rủi ro.
>
> **Nguyên tắc chung:** khi không chắc, **dừng và báo lỗi**, đừng đoán. Một con số sai trông hợp lý nguy hiểm hơn nhiều so với một lỗi làm chương trình dừng.
>
> **Code trong tài liệu đã được chạy thử.** Toàn bộ 13 khối code được gom vào một script kiểm thử, chạy với dữ liệu giả lập kèm `assert` (ví dụ: ET tháng 7/2010 phải ra đúng 97 mm, giải mã 2116 phải ra đúng các bit). Kết quả: **13/13 đạt** ✅. Code dùng `numpy`, `pandas`, `xarray`.

---

## 0. Hai nguồn, hai kiểu QA: vì sao checklist này không đối xử chúng như nhau

| Đặc tính | **AppEEARS** (MODIS raster) | **Giovanni qua Harmony** (lưới / chuỗi đã xử lý) |
|---|---|---|
| Ta nhận được gì | Ảnh raster theo pixel (area: NetCDF-4) hoặc giá trị pixel tại điểm (point: CSV) | **Lưới gốc toàn cầu** mỗi tháng (HOSS, NetCDF-4) → cube 1°; hoặc một con số mỗi tháng (CSV area-average trên bbox vùng mẫu) |
| Scale factor / fill value | **Ta phải xử lý** (mục C) | Giovanni đã xử lý |
| Mây / chất lượng | **Ta phải giải mã bit QA** (mục D) | Không có layer QA; dữ liệu mô hình/tái phân tích (GLDAS, MERRA-2) không bị mây che, IMERG đã gộp nhiều nguồn |
| Tổng hợp không gian | **Ta tính** trung bình vùng (mục E) | Lưới: **ta gộp khối** về ô 1° (`bin_to_grid`, mục E; K18). Area-average: Giovanni tính sẵn (⚠️ có trọng số cos vĩ độ không? K9) |
| Bước thời gian gốc | NDVI tháng; LST, ET **8 ngày** → ta gộp về tháng (mục F) | Đã là tháng |
| Đơn vị | Sau scale: K, mm/8 ngày… | Đơn vị gốc của model (mm/hr, kg/m²/s, K…) → **ta đổi và assert** (mục G) |
| Lỗi hay gặp nhất | Quên QA, nhầm fill với dữ liệu tốt, cộng sai ET | Đổi đơn vị sai, đổi hai lần, lệch nhãn tháng |

**Hệ quả:** với AppEEARS, checklist đi đủ mọi bước C → J. Với Giovanni, ta bỏ qua C–D. Thay vào đó là gộp lưới về 1° (E), kiểm tra đơn vị (G), nhãn thời gian (F), khoảng hợp lý (I) và **kiểm tra chéo** (I2).

**Phạm vi:** mọi kiểm tra áp dụng cho **cả hai dạng đầu ra**: cube lưới toàn cầu `cube_<biến>.nc` (nền của web) và bảng `observations` của vùng mẫu (02 §2, §2b). Vùng Việt Nam trong ví dụ chỉ là vùng mẫu để kiểm chứng.

**Danh sách biến** (✅ AppEEARS `/api/product/{id}` và Giovanni `/configured-variables/`, 13/11/2026):

| Biến chuẩn | Nguồn | Dataset / layer | Bước gốc | Độ phân giải |
|---|---|---|---|---|
| `ndvi` | AppEEARS | MOD13A3.061 `_1_km_monthly_NDVI` + QA `_1_km_monthly_VI_Quality` | tháng | 1 km |
| `lst_day`, `lst_night` | AppEEARS | MOD11A2.061 `LST_Day_1km` / `LST_Night_1km` + `QC_Day` / `QC_Night` | 8 ngày | 1 km |
| `et`, `pet`, `et_pet_ratio` | AppEEARS | MOD16A2GF.061 `ET_500m` / `PET_500m` + `ET_QC_500m` | 8 ngày | 500 m |
| `land_cover`, `elevation` (tĩnh) | AppEEARS | MCD12Q1.061 `LC_Type1`; SRTMGL3_NC.003 `SRTMGL3_DEM` | năm / tĩnh | 500 m / 90 m |
| `precip` | Giovanni | `GPM_3IMERGM_07_precipitation` | tháng | 0.1° |
| `soil_moisture` | Giovanni | `GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst` | tháng | 0.25° (chỉ đất liền) |
| `tair_land` | Giovanni | `GLDAS_NOAH025_M_2_1_Tair_f_inst` | tháng | 0.25° (chỉ đất liền) |
| `evap_gldas` | Giovanni | `GLDAS_NOAH025_M_2_1_Evap_tavg` | tháng | 0.25° (chỉ đất liền) |
| `t2m` | Giovanni | `M2IMNXASM_5_12_4_T2M` (MERRA-2) | tháng | 0.5° × 0.625° (toàn cầu) |

---

## A. Trước khi gửi request

| ☐ | Kiểm tra | Vì sao |
|---|---|---|
| ☐ | Tên product/layer AppEEARS copy từ `appeears.py layers …`; ID biến Giovanni copy từ `/configured-variables/`, không gõ tay | Sai một ký tự = request bị từ chối sau khi đã chờ |
| ☐ | Mỗi layer AppEEARS có **layer QA đi kèm** trong cùng request (NDVI ↔ `_1_km_monthly_VI_Quality`, LST ngày ↔ `QC_Day`, LST đêm ↔ `QC_Night`, ET/PET ↔ `ET_QC_500m`) | Thiếu QA thì không lọc mây được, phải tải lại vài giờ |
| ☐ | Ngày AppEEARS dạng **MM-DD-YYYY**; thời gian Giovanni dạng ISO `YYYY-MM-DD` | Hai API dùng hai định dạng khác nhau |
| ☐ | Vùng mẫu: **cùng một bbox** cho cả AppEEARS và Giovanni (`config/regions.geojson`, mỗi vùng là hình chữ nhật) | Giovanni area-average chỉ nhận bbox ✅. Polygon khác hình dạng thì hai nguồn đo hai vùng khác nhau (01, S0) |
| ☐ | Lưới Giovanni (HOSS): tên biến lấy từ `HOSS_VARIABLES` (khớp `/capabilities`), **không truyền bbox**, không `average` | Có `average` thì Harmony chọn dịch vụ trung bình chứ không phải HOSS; có bbox thì mất phần còn lại của Trái Đất (02 §4.6) |
| ✅ | Tài khoản Earthdata đã authorize app GES DISC (https://urs.earthdata.nasa.gov/approve_app?client_id=e2WVk8Pw6weeLUKZYOxvTQ) | Chưa authorize → HOSS `403`, area-average `Failed validating bearer token` (04, T-1). Xong 13/11 |
| ☐ | Area request AppEEARS: `netcdf4` ✅ + projection `native` | `native` tránh nội suy lại pixel |
| ☐ | Lưới điểm AppEEARS (P1): tâm các ô đất liền 1° lấy từ cube GLDAS (~15.000 điểm ⚠️), chia thành **nhiều batch** (`write_grid_points`); gửi thử **1 batch nhỏ** trước | ⚠️ Số điểm tối đa mỗi point request chưa có trong tài liệu API |
| ☐ | Giovanni: gọi `/quota` trước; **dừng nếu ≥ 0.95** | Hết quota giữa chừng = thiếu dữ liệu đúng lúc cần |
| ☐ | Giai đoạn 01/2001 – 12/2024 cho mọi biến | Trend của các biến phải cùng giai đoạn mới so sánh được |
| ☐ | Lưu request (JSON / tham số Giovanni) vào `data/raw/.../manifest.json` | Tái tạo được, trích dẫn được |

## B. Sau khi tải

| ☐ | Kiểm tra | Vì sao |
|---|---|---|
| ☐ | AppEEARS: MOD13A3 có 288 tháng; MOD11A2 và MOD16A2GF có ~46 composite/năm × 24 | Phát hiện bundle thiếu trước khi xử lý |
| ☐ | Giovanni area-average: mỗi (vùng, biến) có **288 dòng** sau phần header | Giovanni bỏ qua tháng thiếu mà không báo |
| ☐ | HOSS: mỗi biến đủ **288 file tháng** trong `data/raw/harmony_grid/<VAR_ID>/`; cube ra đúng `(288, 180, 360)` | Thiếu một tháng giữa chuỗi thì `grid_trend` lệch mùa. Chạy lại `download_grid.py` không tải lại file đã có |
| ☐ | Point request: mỗi điểm có đủ ngày; `id` khớp file điểm đã gửi | Điểm rơi xuống biển hoặc ra ngoài phạm vi product sẽ trả toàn fill |
| ☐ | Checksum SHA-256 khớp (AppEEARS có cung cấp) | Phát hiện file tải hỏng |
| ☐ | Mở được 1 file; in `ds`, `.attrs`, **dtype** từng layer; in phần header CSV Giovanni | Xác nhận tên chiều, attrs, dtype (cần cho mục C) và **khoá chứa đơn vị** của Giovanni (cần cho mục G) |
| ✅ | HOSS: mở 1 file mỗi biến, in **nhóm** (IMERG có nhóm `Grid`), **thứ tự chiều**, thuộc tính `units` | 13/11: khớp giả định của `read_grid_file` (02 §4.6). Thêm phát hiện: IMERG dùng lịch julian; GLDAS chỉ có 600 hàng vĩ độ |
| ☐ | Ghi những gì quan sát được vào tài liệu 02 (đổi ⚠️ thành ✅) | Cả team cùng biết |

---

## C. Decode AppEEARS: scale factor (chỉ AppEEARS)

**Bảng tham số** (✅ `/api/product/{id}` ngày 13/11/2026):

| Product | Layer | Fill | Scale | Valid range (đã scale) | Valid range (thô) |
|---|---|---|---|---|---|
| MOD13A3.061 | `_1_km_monthly_NDVI` | -3000 | 0.0001 | -0.2 … 1.0 | -2000 … 10000 |
| MOD13A3.061 | `_1_km_monthly_VI_Quality` | 65535 | — | (bit field) | 0 … 65534 |
| MOD11A2.061 | `LST_Day_1km` / `LST_Night_1km` | 0 | 0.02 | 150 … 1310.7 K | 7500 … 65535 |
| MOD11A2.061 | `QC_Day` / `QC_Night` | 0 ⚠️ **(bẫy, mục D)** | — | (bit field) | 0 … 255 |
| MOD16A2GF.061 | `ET_500m` / `PET_500m` | 32767 | 0.1 | -3276.7 … 3270 kg/m²/8 ngày | -32767 … 32700 |
| MOD16A2GF.061 | `ET_QC_500m` | 255 | — | (bit field) | 0 … 254 |
| MCD12Q1.061 | `LC_Type1` | 255 | — | lớp 1 … 17 | 1 … 17 |
| SRTMGL3_NC.003 | `SRTMGL3_DEM` | -32768 | — | mét | — |

**Vì sao cần tự phát hiện "đã scale chưa":** chưa xác nhận được AppEEARS xuất số đã scale hay chưa. Ngoài ra, xarray có thể **tự** nhân scale nếu file có attr `scale_factor`. Nhân thêm một lần nữa là NDVI thành 0.00005.

**Code:** [`pipeline/qa.py`](../pipeline/qa.py) → `ensure_scaled()`, `scale_et()` (test: `tests/test_qa.py`)

- *Vì sao dùng phân vị 1%–99%, không dùng min/max:* vài pixel lỗi không làm hỏng việc phát hiện.
- *Vì sao NDVI và LST tự nhận biết được:* khoảng thật và khoảng thô **không chồng nhau**. NDVI thật nằm trong [-0.2, 1], thô trong [-2000, 10000]; LST thật ~250–320 K, thô ~12500–16000. Ví dụ: thô 15000 × 0.02 = 300 K = **26.85 °C** (300 − 273.15).
- *Vì sao ET phải theo dtype:* ở sa mạc, ET thô chỉ 0–50 (tức 0–5 mm), lọt hẳn vào "khoảng thật". Nhìn giá trị không phân biệt được, nên dựa vào kiểu dữ liệu: `int16` là còn thô (thô 250 × 0.1 = **25 mm/8 ngày**); số thực có `scale_factor` trong encoding là xarray đã áp scale.

| ☐ | Kiểm tra |
|---|---|
| ☐ | `ensure_scaled` chạy qua cho NDVI và LST; ET/PET dùng `scale_et` |
| ☐ | **Không áp scale cho layer QA, `LC_Type1`, DEM**: layer QA phải còn là số nguyên trước khi giải mã bit |

## C2. Fill value và giá trị đặc biệt (áp trên số **thô**, trước khi scale)

**Vì sao làm trên số thô:** fill -3000 nhân 0.0001 thành -0.3, trông giống NDVI nước. Sau khi scale thì không còn nhận ra đó là fill.

**Code:** [`pipeline/qa.py`](../pipeline/qa.py) → `FILL`, `ET_MAX_RAW`, `mask_fill()` (test: `tests/test_qa.py`)

- **ET: giá trị thô > 32700 không phải số đo.** Dải 32761–32766 là các **lớp đặc biệt** (nước, đô thị, đất trống, băng tuyết… nơi thuật toán không chạy). Nếu không loại, chúng thành "ET 3276 mm", tức gấp ~100 lần rừng nhiệt đới.

| ☐ | Kiểm tra |
|---|---|
| ☐ | Sau decode không còn giá trị nào bằng fill; ET không còn giá trị thô > 32700 |

---

## D. QA masking (chỉ AppEEARS)

**Bảng bit** (✅ AppEEARS `/api/quality/{product}/{layer}`, không cần đăng nhập):

`_1_km_monthly_VI_Quality` (MOD13A3):

| Bit | Tên | Giá trị dùng |
|---|---|---|
| 0–1 | MODLAND | `00` = VI produced, good quality · `01` = chất lượng khác · `10`/`11` = không tạo được |
| 2–5 | VI Usefulness | `0000` tốt nhất … `1111` không dùng được |
| 6–7 | Aerosol | `00` thấp nhất … `11` cao |
| 11–13 | Land/Water | `001` = chỉ đất liền |

*Ví dụ giải mã* **2116** = `0b100001000100`: bit 0–1 = `00` (tốt), bit 2–5 = `0001` (chất lượng thấp hơn mức cao nhất một bậc), bit 6–7 = `01` (aerosol thấp), bit 11–13 = `001` (đất liền) → **giữ** ✅ (đã có trong test).

`QC_Day` / `QC_Night` (MOD11A2, hai layer cùng cấu trúc):

| Bit | Tên | Giá trị |
|---|---|---|
| 0–1 | MODLAND | `00` tốt · `01` chất lượng khác · `10` không tạo được do mây · `11` lý do khác |
| 2–3 | Data quality | `00` tốt … |
| 4–5 | Emissivity error | `00` ≤ 0.01 … |
| 6–7 | LST error | `00` ≤ 1 K · `01` ≤ 2 K · `10` ≤ 3 K · `11` > 3 K |

`ET_QC_500m` (MOD16A2GF), ✅ từ `/api/quality/MOD16A2GF.061/ET_QC_500m`:

| Bit | Tên | Giá trị |
|---|---|---|
| 0 | MODLAND | `0` tốt (thuật toán chính) · `1` chất lượng khác (thuật toán dự phòng hoặc fill) |
| 1 | Sensor | `0` Terra · `1` Aqua |
| 2 | DeadDetector | `0` bình thường · `1` detector hỏng > 50% |
| 3–4 | CloudState | `00` trời quang · `01` có mây · `10` mây lẫn · `11` không xác định (coi như quang) |
| 5–7 | SCF_QC | `000` thuật toán chính, tốt nhất · `001` chính, bão hoà · `010`/`011` thuật toán thực nghiệm · `100` không tạo được |

**Chính sách mặc định** (K2, K5):

| Biến | Chính sách | Vì sao |
|---|---|---|
| NDVI | `ndvi_good` (+ `ndvi_land` nếu bật, K3) | Mây làm NDVI thấp giả tạo |
| LST ngày / đêm | `lst_ok`: MODLAND `00`, **hoặc** `01` với LST error ≤ 2 K | Giữ thêm dữ liệu mùa mưa mà sai số vẫn chấp nhận được |
| ET / PET | Giữ mọi giá trị hợp lệ (đã qua C2); `et_main_algorithm` chỉ dùng nếu muốn siết | MOD16A2GF đã **lấp khoảng trống (gap-filled)** chỗ mây. Lọc thêm theo mây là bỏ đúng phần sản phẩm đã sửa |

**Code:** [`pipeline/qa.py`](../pipeline/qa.py) → `bits()`, `ndvi_good()`, `ndvi_land()`, `lst_ok()`, `et_main_algorithm()`, `lst_valid()`, `QA_POLICY` (test: `tests/test_qa.py`)

| ☐ | Kiểm tra | Vì sao |
|---|---|---|
| ☐ | **BẪY QC fill của LST:** API báo FillValue của `QC_Day`/`QC_Night` là **0**, nhưng QC = 0 nghĩa là **chất lượng tốt nhất**. **Không bao giờ** che QC theo fill; pixel thiếu dữ liệu nhận biết bằng **`LST == 0`** (dùng `lst_valid`) | Che "QC == fill" xoá đúng những pixel tốt nhất, và dữ liệu còn lại chỉ là pixel kém. Lỗi này không báo gì, chỉ âm thầm làm sai kết quả |
| ☐ | Layer QA đọc ra là **số nguyên chưa scale** (dtype int/uint) | Phép dịch bit trên số thực là vô nghĩa |
| ☐ | In tỷ lệ pixel bị loại theo từng tháng trong năm | Mùa mưa của nơi đó phải bị loại nhiều hơn. Ngược lại thì chính sách QA đang sai |
| ☐ | So trung bình NDVI có và không lọc QA | NDVI sau lọc thường **cao hơn** (vì đã bỏ mây). Thấp hơn thì kiểm tra lại bit |

## D2. Valid range

**Code:** [`pipeline/qa.py`](../pipeline/qa.py) → `VALID`, `to_nan_outside()` (test: `tests/test_qa.py`)

| ☐ | Kiểm tra | Vì sao |
|---|---|---|
| ☐ | Giá trị ngoài valid range → NaN | Cắt về biên (ví dụ NDVI 1.3 → 1.0) là bịa ra một số đo không tồn tại |

---

## E. Tổng hợp không gian (AppEEARS)

**AppEEARS vùng mẫu (area, bbox):** trung bình các pixel có **tâm** nằm trong vùng.
**AppEEARS lưới điểm (point → cube):** giá trị ô 1° = **1 pixel** tại tâm ô (NDVI/LST 1 km, ET 500 m), không phải trung bình ô (K6). Hàm `zonal_mean` không áp dụng; `points_to_cube` chỉ đặt giá trị vào ô.
**Giovanni lưới (HOSS → cube):** `bin_to_grid` lấy **trung bình khối** mọi ô gốc có tâm trong ô 1°, bỏ NaN (K18).
**Giovanni area-average:** đã là trung bình bbox → không cần tính (⚠️ cách lấy trọng số của Giovanni: K9).
**Vùng người dùng chọn trên web:** `region_series(cube, bbox)` = trung bình trọng số cos(vĩ độ) các ô 1° có tâm trong bbox, kèm `valid_frac`.

**Code:** [`pipeline/aggregate.py`](../pipeline/aggregate.py) → `zonal_mean()`; raster → chuỗi vùng: `raster_to_series()`, `region_mask()`, `decode_layer()` (test: `tests/test_aggregate.py`). Lưới: [`pipeline/grid.py`](../pipeline/grid.py) → `bin_to_grid()`, `points_to_cube()`, `region_series()` (test: `tests/test_grid.py`)

- *Vì sao trọng số cos(vĩ độ):* trên lưới lat/lon, một ô 1 km ở 60° vĩ chỉ rộng bằng **một nửa** ô ở xích đạo (cos 60° = 0.5). Không có trọng số thì vùng gần cực bị đếm quá mức. Lưới MODIS `native` (sinusoidal) có diện tích pixel đều nên trọng số = 1.
- *Vì sao `valid_frac < 0.3` → NaN:* một tháng chỉ thấy 10% diện tích (90% bị mây) mà gọi là "trung bình vùng" thì không đại diện (01, S5; K1).

| ☐ | Kiểm tra | Vì sao |
|---|---|---|
| ☐ | Mọi vùng có `n_total > 0` | Không có tâm pixel nào trong vùng = sai polygon hoặc CRS |
| ☐ | Kiểm tra chéo với `*-Statistics.csv` của AppEEARS (QA tắt), sai lệch < 1% | Chứng minh đọc file, decode, clip đều đúng. ✅ Số pixel (R4 MCD12Q1, 13/11): mask tâm-pixel của ta lấy 99,8% / 99,7% / 99,1% số pixel AppEEARS đếm cho ĐBSCL / Tây Nguyên / Hà Nội; còn kiểm tra giá trị trung bình trên R1–R3 |
| ☐ | `bin_to_grid` bảo toàn trung bình một khối và bỏ qua NaN | ✅ test. Coi NaN là 0 thì ô ven biển của GLDAS bị kéo về 0 |
| ☐ | Bản đồ "số tháng có dữ liệu" của mỗi cube: GLDAS NaN trên biển và Nam Cực; IMERG, MERRA-2 phủ cả biển | Lộ lỗi đảo lat/lon, lệch kinh độ 0–360 / −180–180, hoặc đọc nhầm nhóm |
| ☐ | Lưới điểm AppEEARS: điểm rơi vào pixel nước, đô thị hoặc lớp đặc biệt ET → NaN cho ô đó (ghi lại số ô) | Điểm lấy từ ô đất liền GLDAS, nhưng tâm ô ven biển vẫn có thể rơi xuống nước |
| ☐ | Điểm ngoài phạm vi SRTM (~60°N – 56°S ⚠️) → độ cao = NaN, có cờ | Không gán độ cao 0 cho Siberia |

---

## F. Đồng bộ thời gian

| Nguồn / biến | Bước gốc | Cách đưa về tháng | Vì sao |
|---|---|---|---|
| NDVI (MOD13A3) | tháng | Giữ nguyên | Đã là tháng |
| LST (MOD11A2) | 8 ngày | **Trung bình theo số ngày phủ**, cần ≥ 2 composite hợp lệ | Nhiệt độ là đại lượng **cường độ**: trung bình mới có nghĩa. 1 composite (8/30 ngày) không đại diện cả tháng |
| ET, PET (MOD16A2GF) | 8 ngày | **Tổng**: mỗi composite chia đều lượng của nó cho từng ngày, rồi cộng các ngày trong tháng | ET là đại lượng **tích luỹ** (mm trong 8 ngày). Lấy trung bình thì ra mm/8 ngày, sai khoảng 4 lần |
| Mọi biến Giovanni (CSV và cube HOSS) | tháng | Giữ giá trị, **đổi nhãn về ngày đầu tháng** (`build_cube` làm cho cube) | Giovanni/MERRA-2 có thể ghi nhãn giữa tháng; lệch nhãn làm join lệch 1 tháng |

**Composite cuối năm:** composite bắt đầu ngày 361 chỉ dài **5 ngày** (năm nhuận **6 ngày**), vì composite không vượt qua 31/12. Code dùng số ngày thật, không mặc định 8 (K5).

**Code:** [`pipeline/aggregate.py`](../pipeline/aggregate.py) → `composite_days()`, `composites_to_monthly()`, `series_to_monthly()` (test: `tests/test_aggregate.py`)

**Ví dụ ET tháng 7/2010** (năm không nhuận, 1/7 = ngày 182). Test bắt buộc ✅: hàm trên cho đúng **97 mm**.

| Composite (ngày bắt đầu) | Khoảng ngày | Số ngày trong tháng 7 | ET (mm/8 ngày) | Đóng góp |
|---|---|---|---|---|
| 177 | 26/6 – 3/7 | 3 | 24 | 24 × 3/8 = 9 |
| 185 | 4/7 – 11/7 | 8 | 25 | 25 |
| 193 | 12/7 – 19/7 | 8 | 26 | 26 |
| 201 | 20/7 – 27/7 | 8 | 25 | 25 |
| 209 | 28/7 – 4/8 | 4 | 24 | 24 × 4/8 = 12 |
| **Tổng** | | **31** ✓ | | **97 mm/tháng** |

*Test thứ hai:* một năm toàn 1 mm/ngày cho tổng năm = **365**, tháng 1 = **31**, tháng 2 = **28**. Composite cuối năm có giá trị 5 mm vì chỉ dài 5 ngày.

| ☐ | Kiểm tra | Vì sao |
|---|---|---|
| ☐ | Mọi nhãn thời gian = **ngày đầu tháng** | Join giữa các biến, giữa hai nguồn không bị lệch |
| ☐ | Mỗi (vùng/điểm, biến) có đúng **288 dòng**, không trùng; mỗi cube có đúng **288 tháng**, tăng dần | Đủ lưới thời gian, kể cả tháng NaN. `grid_trend` cần trọn năm (tháng 1 → tháng 12) |
| ☐ | Tháng ET thiếu bất kỳ ngày nào → NaN (không cộng thiếu) | Tổng của 24 ngày không phải tổng tháng |

---

## G. Đơn vị

**AppEEARS** (sau mục C):

| Biến | Đơn vị sau scale | Đơn vị chuẩn | Công thức | Ví dụ kiểm tra |
|---|---|---|---|---|
| NDVI | 1 | `1` | — | 0.65 → 0.65 |
| LST ngày / đêm | K | `degC` | x − 273.15 | 300 K → **26.85 °C** |
| ET, PET (composite) | kg/m²/8 ngày | `mm/8day` | (đã × 0.1) | thô 250 → **25 mm/8 ngày** (1 kg nước/m² = lớp nước dày 1 mm) |
| ET, PET (tháng) | mm/8 ngày | `mm/month` | mục F | tháng 7/2010 → **97 mm** |
| ET/PET | — | `1` | ET_tháng ÷ PET_tháng (PET = 0 → NaN) | 40 ÷ 120 = 0.33 (thiếu nước) |

**Giovanni** (đơn vị đọc từ header CSV hoặc thuộc tính `units` của NetCDF HOSS, **assert** trước khi đổi):

| Biến | Đơn vị nguồn (kỳ vọng) | Đơn vị chuẩn | Công thức | Ví dụ kiểm tra | Giải thích |
|---|---|---|---|---|---|
| `precip` (IMERG) | mm/hr ⚠️ | `mm/month` | x × 24 × số_ngày_tháng | 0.3 mm/hr, tháng 1 → 0.3 × 24 × 31 = **223.2 mm** | Lượng mưa tháng IMERG là **tốc độ trung bình**, không phải tổng |
| `soil_moisture` (GLDAS) | kg/m² | `m3/m3` | x ÷ 100 | 32 kg/m² → **0.32 m³/m³** | 32 kg/m² = 32 mm nước nằm trong lớp đất dày 100 mm (0–10 cm) → 32/100 = 32% thể tích |
| `tair_land` (GLDAS) | K | `degC` | x − 273.15 | 300 K → 26.85 °C | |
| `evap_gldas` (GLDAS) | kg/m²/s | `mm/day` | x × 86400 | 3×10⁻⁵ → **2.59 mm/ngày** → × 31 = **80.4 mm/tháng** | 86400 = số giây trong một ngày |
| `t2m` (MERRA-2) | K | `degC` | x − 273.15 | 300 K → 26.85 °C | |

**Vì sao phải assert đơn vị:** cùng một con số 0.3 có thể là mm/hr (= 223 mm/tháng) hoặc mm/ngày (= 9.3 mm/tháng). Đổi nhầm thì sai 24 lần mà biểu đồ vẫn trông hợp lý. Đổi đơn vị trên số **đã đổi** (K → °C hai lần) thì lệch 273 độ.

**Code:** [`pipeline/giovanni_adapter.py`](../pipeline/giovanni_adapter.py) → `parse_giovanni_area_csv()`, `convert_cube()` (cube); [`pipeline/units.py`](../pipeline/units.py) → `giovanni_unit()`, `GIOVANNI_UNITS`, `convert_units()` (test: `tests/test_units.py`, `tests/test_grid.py`)

| ☐ | Kiểm tra | Vì sao |
|---|---|---|
| ☐ | Khi mở file Giovanni thật đầu tiên (CSV và NetCDF HOSS): xác nhận **tên khoá chứa đơn vị** và các cách viết đơn vị; cập nhật tập `accepted` | ⚠️ Chưa có file thật (bị chặn ở T-1). Code dừng nếu không tìm thấy, không đoán |
| ☐ | Số ngày trong tháng theo lịch thật (tính cả năm nhuận) | Tháng 2 có 28 hoặc 29 ngày |
| ☐ | Cột `unit` trong bảng = đơn vị chuẩn | Hợp đồng với frontend |
| ☐ | Mỗi công thức có test dùng ví dụ trong bảng (đã có: 223.2 mm; 0.32; 2.592 mm/ngày; 26.85 °C; 97 mm) | Chặn lỗi gõ nhầm công thức |

---

## H. Chính sách missing values

| Tình huống | Xử lý | Vì sao |
|---|---|---|
| Pixel fill / QA xấu / ngoài vùng / lớp đặc biệt ET | NaN **trước** khi tính trung bình | Một pixel -3000 kéo trung bình cả vùng xuống |
| Tháng `valid_frac < 0.3` | Giữ dòng, `value = NaN` | Có dòng thì frontend biết đó là khoảng trống |
| Tháng Giovanni bị thiếu | CSV: thêm dòng NaN để đủ 288. HOSS: tải lại file thiếu (B) | Cùng lưới thời gian với AppEEARS |
| Ô 1° không có ô gốc / điểm hợp lệ | NaN trong cube; heatmap để trống ô đó | Không tô màu nơi không có dữ liệu |
| Kiểm định xu hướng | **Không nội suy**; MK chạy trên giá trị có thật | Nội suy làm p-value nhỏ giả tạo |
| Chuỗi chưa sẵn sàng (mục J) | Cờ `insufficient_data`, không kết luận | Quá ít dữ liệu để kiểm định |
| Contradiction Hunter | Điểm có cờ `insufficient_data` bị loại khỏi quét | Không báo mâu thuẫn từ dữ liệu yếu (05) |

---

## I. Kiểm tra hợp lý toàn cầu (sanity checks)

Khoảng kỳ vọng **thô** để bắt lỗi lớn, không phải chuẩn khoa học. Đơn vị là đơn vị chuẩn:

| Biến | Khoảng | Dấu hiệu lỗi điển hình |
|---|---|---|
| `ndvi` | -0.2 … 1 (thực vật 0.2–0.9; sa mạc 0.05–0.15) | > 1 → chưa scale; âm cả vùng đất liền → lẫn nước hoặc fill |
| `lst_day` | -70 … 80 °C | ~300 → quên đổi K; ~15000 → chưa scale |
| `lst_night` | -80 … 50 °C; thường **< `lst_day`** cùng nơi, cùng tháng | Đêm nóng hơn ngày ở đa số điểm → nhầm layer |
| `et` | 0 … 350 mm/tháng (rừng nhiệt đới ~120–150) | Hàng nghìn → lọt lớp đặc biệt 3276x hoặc chưa scale |
| `pet` | 0 … 700 mm/tháng | |
| `et_pet_ratio` | 0 … 1.2 | > 1.2 nhiều nơi → sai công thức tổng tháng |
| `precip` | 0 … 3000 mm/tháng | ~0.1–1 cả năm → quên × 24 × số ngày (vẫn là mm/hr) |
| `soil_moisture` | 0 … 0.6 m³/m³ | ~20–40 → quên ÷ 100. Đúng 1,0 ở ô băng là giá trị cố định của GLDAS (K22), không phải lỗi đơn vị |
| `tair_land`, `t2m` | -70 … 50 °C | ~250–310 → quên đổi K |
| `evap_gldas` | 0 … 12 mm/ngày | ~10⁻⁵ → quên × 86400 |

**Code:** [`pipeline/checks.py`](../pipeline/checks.py) → `SANITY`, `sanity_report()`. Khoá theo tên biến docs/01: `tair_land`, `evap_gldas`, `et_pet_ratio` (test: `tests/test_trends.py`). Với cube: so `cube.min()`, `cube.max()` với cùng bảng `SANITY`.

| ☐ | Kiểm tra |
|---|---|
| ☐ | `sanity_report` rỗng, hoặc mọi dòng được giải thích |
| ☐ | Vẽ chuỗi từng (vùng, biến), nhìn bằng mắt: chu kỳ mùa có đúng hướng không? |
| ☐ | Vẽ bản đồ trung bình nhiều năm của mỗi cube: mưa nhiều ở dải hội tụ nhiệt đới, ít ở Sahara; nhiệt độ giảm dần về hai cực |
| ☐ | **Bán cầu:** điểm ở Bắc bán cầu có LST/T2M đỉnh khoảng tháng 6–8, Nam bán cầu khoảng tháng 12–2. Ngược lại thì nghi đảo lat/lon |
| ☐ | Không có bước nhảy đột ngột trùng mốc đổi sản phẩm hoặc cảm biến |

## I2. Kiểm tra chéo giữa hai nguồn

**Vì sao làm được:** có hai cặp biến đo những thứ **liên quan** từ hai nguồn độc lập. Nếu cả hai pipeline đúng, chúng phải đi cùng nhịp. Lệch nhịp mạnh nghĩa là một bên đang sai (lệch nhãn tháng, sai đơn vị, nhầm vùng).

- **LST ban ngày (MODIS)** và **nhiệt độ không khí (GLDAS `Tair` / MERRA-2 `T2M`)**: cùng nhịp mùa (r cao). Ban ngày, mặt đất nắng thường **nóng hơn** không khí. Không giống hệt nhau: LST là nhiệt độ **bề mặt**, đo lúc ~10:30 sáng, chỉ khi trời quang.
- **ET (MODIS MOD16A2GF)** và **Evap (GLDAS)**: hai mô hình khác nhau, cùng đại lượng. Kỳ vọng tương quan dương; tỷ số không nhất thiết bằng 1.

**Code:** [`pipeline/checks.py`](../pipeline/checks.py) → `cross_check_temp()`, `cross_check_et()` (test: `tests/test_trends.py`)

| ☐ | Kiểm tra | Kỳ vọng | Nếu không đạt |
|---|---|---|---|
| ☐ | r(LST ngày, Tair hoặc T2M) theo tháng, mỗi vùng | > 0.7 ở vùng có mùa rõ (nhiệt đới có thể thấp hơn) | Kiểm tra nhãn tháng, vùng, đơn vị |
| ☐ | Tỷ lệ tháng LST ngày > nhiệt độ không khí | > 0.8 (ngoại lệ: vùng tuyết, rừng rậm) | Kiểm tra đổi K → °C |
| ☐ | r(ET MODIS, Evap GLDAS) | > 0.5 | Kiểm tra cách cộng ET tháng (mục F) |
| ☐ | `region_series(cube, bbox vùng mẫu)` so với Giovanni area-average cùng bbox | Cùng nhịp, chênh nhỏ (do lưới 1° và K9) | Kiểm tra `bin_to_grid`, lệch kinh độ, đơn vị cube |
| ☐ | Trung vị tỷ số ET MODIS / Evap GLDAS | ~0.5 – 2 | Lệch 4–8 lần → lỗi trung bình/tổng hoặc mm/8 ngày |

---

## J. Sẵn sàng cho kiểm định xu hướng

**Vì sao cần kiểm tra trước:** Seasonal Mann-Kendall so **tháng 1 với tháng 1, tháng 7 với tháng 7** qua các năm. Nếu một tháng trong năm gần như luôn thiếu (ví dụ tháng 7 mùa mưa toàn mây), phép so cho tháng đó không có ý nghĩa.

**Code:** [`pipeline/checks.py`](../pipeline/checks.py) → `trend_ready()` (test: `tests/test_trends.py`)

| ☐ | Kiểm tra | Vì sao |
|---|---|---|
| ☐ | `trend_ready(...)["ready"]` cho mọi chuỗi được kiểm định; chuỗi không đạt → cờ `insufficient_data` | Chuỗi < 70% tháng có giá trị, hoặc có tháng trong năm < 10 năm dữ liệu, không đủ để kết luận |
| ☐ | **Test chuỗi giả lập:** 288 tháng = mùa (sin) + xu hướng biết trước (+0.3/thập kỷ) + nhiễu; `trends.py` tìm lại ≈ 0.3/thập kỷ | Xác nhận đơn vị `slope` của `pymannkendall.seasonal_test` (theo năm hay theo tháng) và công thức quy đổi |
| ☐ | **Test chuỗi không xu hướng:** chỉ mùa + nhiễu → p > 0.05 trong ~95% lần chạy | Xác nhận không báo xu hướng giả |
| ☐ | MK và OLS cùng dấu độ dốc trên các chuỗi thật | Khác dấu = dấu hiệu outlier hoặc chuỗi phi tuyến |
| ☐ | Báo cáo kèm q-value FDR (bắt buộc cho heatmap và điểm nóng: tới 64.800 ô mỗi biến; code BH ở 05) | 01, S8 |
| ☐ | `grid_trend` khớp `pymannkendall.seasonal_test` từng ô; chuỗi chỉ có nhiễu → 0 ô significant sau FDR | ✅ test (`tests/test_grid.py`). Bản vector hoá phải cho cùng kết quả với thư viện chuẩn |
| ☐ | Mỗi kết quả có `n_months` và giai đoạn | Người đọc biết kết luận dựa trên bao nhiêu dữ liệu |

---

## K. Các lựa chọn phương pháp đang dùng

Mỗi mục là một **lựa chọn có tính khoa học** mà pipeline đang dùng giá trị mặc định. Đổi mặc định thì sửa tham số / cấu hình, không cần sửa thiết kế. Các mục ảnh hưởng tới cách đọc kết quả được đưa vào phần Giới hạn của báo cáo (`api.LIMITATIONS`).

| # | Lựa chọn | Mặc định hiện tại | Lý do / rủi ro |
|---|---|---|---|
| K1 | Ngưỡng `valid_frac` loại tháng | 0.3 | Đánh đổi giữa số tháng giữ lại và độ đại diện |
| K2 | Mức chặt của QA cho NDVI/LST | NDVI: chỉ "good"; LST: good hoặc sai số ≤ 2 K | Chặt quá mất dữ liệu mùa mưa; lỏng quá lẫn mây |
| K3 | Loại pixel nước khỏi NDVI (bit 11–13)? | Đề xuất có | Vùng nhiều sông, đầm phá: NDVI nước âm kéo trung bình xuống |
| K4 | LST tháng = trung bình theo số ngày phủ, cần ≥ 2 composite | Có | Có nên đòi nhiều composite hơn ở vùng nhiều mây? |
| K5 | ET tháng = tổng theo ngày; composite cuối năm 5–6 ngày; ET không lọc mây (bản gap-filled) | Như mục C2, D, F | Cộng sai cho số sai khoảng 4 lần; lọc mây trên bản gap-filled có thể bỏ đúng phần đã sửa |
| K6 | **Độ đại diện của lưới điểm:** giá trị cube MODIS = 1 pixel tại tâm ô 1°, không phải trung bình ô | Mẫu tại điểm; phương án thay thế: polygon ~10×10 km quanh điểm, lấy `*-Statistics.csv` theo từng feature | Một pixel có thể rơi đúng ruộng, hồ hay khu đô thị |
| K7 | Quỹ đạo Terra trôi những năm gần đây → LST ngày có thể giảm giả tạo; MOD16A2GF cũng dùng đầu vào từ Terra | Dừng ở 2024, ghi chú | Kiểm tra chéo với Aqua (MYD11A2) và với T2M MERRA-2 (I2) |
| K8 | LST chỉ đo được khi trời quang (clear-sky bias) | Ghi chú | LST tháng mưa là trung bình của vài ngày nắng hiếm hoi |
| K9 | **Giovanni area-average có trọng số cos(vĩ độ) không?** | Chưa biết ⚠️ | Bbox lớn ở vĩ độ cao: không có trọng số thì giá trị lệch về phía cực, không khớp cách AppEEARS tính |
| K10 | Phương pháp xu hướng: Seasonal MK + Sen (chính), Hamed-Rao, OLS (phụ) | Như trên | Phù hợp dữ liệu có mùa, phi chuẩn, tự tương quan? |
| K11 | Hiệu chỉnh nhiều phép kiểm định | FDR Benjamini–Hochberg, q < 0.05 | Heatmap có tới 64.800 kiểm định mỗi biến; FDR tính riêng từng biến và từng khoảng thời gian |
| K12 | Các phép đổi đơn vị (mục G), đặc biệt IMERG mm/hr và ẩm đất ÷ 100 | Như bảng | Sai một hệ số là sai 24 lần hoặc 100 lần |
| K13 | Contradiction Hunter dùng **anomaly** (lệch so với khí hậu của chính nơi đó) | Có (05, mục 2) | Tránh "phát hiện" điều hiển nhiên như mùa ở hai bán cầu ngược nhau |
| K14 | Diễn đạt kết quả: "xu hướng quan sát được", **không** khẳng định nguyên nhân | Có | Tương quan/xu hướng ≠ nhân quả |
| K15 | Sự kiện đã biết để kiểm tra Contradiction Hunter | Nắng nóng Nga 7–8/2010; Úc 2019–20; lũ miền Trung Việt Nam 10/2020 | Có thể bổ sung sự kiện (05, mục 5) |
| K16 | **Phạm vi phủ của Giovanni:** GLDAS chỉ có **đất liền**, từ 60°S lên; IMERG và MERRA-2 phủ cả biển → cùng một bbox ven biển, các biến lấy trung bình trên **các diện tích khác nhau** | Ghi chú; chọn bbox ít biển | Vùng ven biển (ví dụ ĐBSCL) có thể bị lượng mưa trên biển kéo lệch |
| K17 | Ngưỡng kiểm tra chéo ở I2 (r > 0.7 nhiệt độ; r > 0.5 ET) | Như bảng I2 | Nhiệt đới và vùng tuyết có thể thấp hơn tự nhiên |
| K18 | **Gộp lưới Giovanni về 1°:** trung bình khối các ô gốc có tâm trong ô 1° (không trọng số diện tích trong ô) | `bin_to_grid`, thay vì dịch vụ regrid của HOSS (02 §4.6) | Trong một ô 1°, cos(vĩ độ) đổi rất ít; nhưng ô ven biển của IMERG lẫn mưa trên biển (K16) |
| K19 | **Chọn rồi mới kiểm định:** điểm nóng được chọn **vì** significant, nên p_diff của cặp tăng × giảm gần như luôn nhỏ | Báo cáo kèm CI, độ ổn định hai nửa giai đoạn và baseline hoán vị (P2) (05, mục 2) | Tránh trình bày p_diff như bằng chứng độc lập |
| K20 | **Định nghĩa điểm nóng:** ô có q < 0.05, cùng chiều, liền kề 8 hướng, ≥ 4 ô | `hotspot_regions(q=0.05, min_cells=4)` | Ngưỡng nhỏ thì nhiều điểm nóng nhiễu; lớn thì mất vùng nhỏ có thật |
| K21 | `grid_trend` **không hiệu chỉnh giá trị trùng** (ties) trong phương sai MK | Bỏ, vì làm p lớn hơn (thận trọng hơn) | Ảnh hưởng ô sa mạc có nhiều tháng mưa = 0 |
| K22 | **Ẩm đất GLDAS trên băng:** ô phủ băng có giá trị cố định 100 kg/m² (= 1,0 m³/m³), khoảng 1% ô đất liền (tháng 7/2010) | Giữ nguyên (xu hướng = 0) | Có nên che các ô này khỏi heatmap và trung bình vùng không? |
