# 04 — Kế hoạch triển khai pipeline khi hackathon bắt đầu

> **Sản phẩm:** web **Terra-scope AI**, gồm 5 tính năng chính:
> 1. Bản đồ xu hướng toàn cầu.
> 2. Engine phân tích trend cho vùng bất kỳ.
> 3. Contradiction Hunter.
> 4. AI Earth Detective.
> 5. Evidence report.
>
> Phần Data cung cấp dữ liệu lưới và lớp hàm phân tích cho cả 5 tính năng (01, mục 7).
>
> **Khung thời gian:** nộp bài mở **thứ Bảy 14/11, 9:00** và đóng **Chủ nhật 15/11, 23:59** (giờ địa phương), tổng **~39 giờ**.
>
> **Phạm vi:** **toàn thế giới**. Các vùng trong `config/regions.geojson` chỉ là vùng mẫu để kiểm chứng.
>
> **Nguồn dữ liệu:**
> - **AppEEARS** cho MODIS.
> - **Giovanni qua Harmony** cho mưa, ẩm đất, nhiệt độ không khí, bốc hơi. Lưới toàn cầu dùng dịch vụ HOSS của Harmony (team chốt 13/11). Chi tiết ở 02.
>
> **Nguyên tắc lập kế hoạch:**
> 1. **Việc chậm nhất (chờ NASA xử lý, tải lưới toàn cầu) bắt đầu sớm nhất**, ngay tối 13/11.
> 2. **Giao dữ liệu cho frontend / backend sớm và nhiều lần**, kể cả dữ liệu giả đúng schema, để không ai phải ngồi chờ.
> 3. **Mọi tính năng chia mức ưu tiên**; hết giờ thì cắt từ dưới lên, không bao giờ cắt P0.

---

## 1. Mức ưu tiên

| Mức | Nội dung | Vì sao ở mức này |
|---|---|---|
| **P0 (bắt buộc)** | Lưới toàn cầu 1° (HOSS) cho `precip`, `soil_moisture`, `tair_land`, `t2m` → `cube_<biến>.nc` → đủ 4 hàm `trend_map`, `analyze_region`, `compare_regions`, `find_contradictions` chạy trên dữ liệu thật → JSON mặc định cho web + `evidence_report` | Đủ cho cả 5 tính năng chính với các biến ví dụ chính của web (mưa, ẩm đất, nhiệt độ). Không có P0 thì không có bài |
| **P1 (nên có)** | NDVI, LST ngày/đêm, ET/PET trên lưới (AppEEARS point tại tâm ô đất liền 1°); `evap_gldas`; **vùng mẫu kiểm chứng** (AppEEARS area 1 km R1–R4 + Giovanni area-average) so với lưới; câu giải thích template cho cặp mâu thuẫn; Contradiction loại C | Thêm biến bề mặt và bằng chứng rằng lưới 1° đáng tin; phụ thuộc AppEEARS xử lý kịp |
| **P2 (nếu còn giờ)** | Vòng kiểm định hoán vị toàn lưới (05, mục 5); Contradiction loại B, D; lưới 0.5°; LST Aqua (MYD11A2) | Làm đẹp thêm, không ảnh hưởng tính hoàn chỉnh |

---

## 2. Việc làm ngay tối nay (13/11, trước giờ G)

> ⚠️ **Đọc lại luật Space Apps về chuẩn bị trước sự kiện.** Tối nay ưu tiên **chuẩn bị tài khoản, môi trường và gửi request dữ liệu** (dữ liệu công khai của NASA).

| # | Việc | Ai | Thời lượng | Trạng thái / vì sao |
|---|---|---|---|---|
| T-1 | **Liên kết GES DISC với tài khoản Earthdata:** urs.earthdata.nasa.gov → Profile → Applications → Authorized Apps → Approve More Applications → **NASA GESDISC DATA ARCHIVE** → Approve (chấp nhận điều khoản nếu được hỏi) | Data (tự làm trên web) | 5' | ✅ Xong 13/11. Nguyên nhân `403` đã xác nhận: Earthdata đòi authorize đúng app GES DISC; link trực tiếp: https://urs.earthdata.nasa.gov/approve_app?client_id=e2WVk8Pw6weeLUKZYOxvTQ |
| T-2 | Cài thư viện vào `.venv` có sẵn (mục 7) | Data | 20' | ✅ đã cài |
| T-3 | `sh download_appeears.sh`: gửi R1–R4 vùng mẫu (mục 3c) | Data | 5' (+ vài giờ NASA xử lý) | ✅ đã gửi 13/11; **R4 đã tải xong** (21 MB; nhờ file thật mà sửa được 3 lỗi đọc file area, xem README); R1, R3 đang `processing`; R2a, R2b `pending` |
| T-4 | Sau T-1: chạy `download_grid.py` nền (mục 3a), tải lưới toàn cầu 5 biến Giovanni | Data | 5' (+ vài giờ tải) | ⏳ 5 job Harmony (mỗi biến 288 tháng) chạy từ 13/11 ~04:00 (giờ máy). Tiến trình chờ của harmony-py chết lần đầu vì lỗi `/jobs/status` (02 §4.7), đã sửa và nối lại đúng 5 job đó. Log: `data/raw/harmony_grid/log_<VAR_ID>.txt`. Tổng ≈ 3 GB. Cấu trúc file HOSS đã ✅ trên job thử 1 tháng |
| T-5 | Gửi thử **1 batch point** AppEEARS nhỏ (~100 điểm, 1 năm, NDVI) | Data | 15' (+ chờ) | Xác nhận tên cột CSV point, thời gian xử lý, và dò **giới hạn số điểm** (API không công bố) |

---

## 3. Request dữ liệu

### 3a. Lưới toàn cầu qua Harmony HOSS (T-4, P0)

| # | Biến | Collection (concept ID) | Tên biến HOSS | Thời gian | Ưu tiên |
|---|---|---|---|---|---|
| H1 | `precip` | GPM_3IMERGM.07 (`C2723754851-GES_DISC`) | `Grid/precipitation` | 2001-01 → 2024-12 | P0 |
| H2 | `soil_moisture` | GLDAS_NOAH025_M.2.1 (`C1342986036-GES_DISC`) | `SoilMoi0_10cm_inst` | như trên | P0 |
| H3 | `tair_land` | như H2 | `Tair_f_inst` | như trên | P0 |
| H4 | `t2m` | M2IMNXASM.5.12.4 (`C1276812823-GES_DISC`) | `T2M` | như trên | P0 |
| H5 | `evap_gldas` | như H2 | `Evap_tavg` | như trên | P1 |

**Lệnh:**

```bash
nohup .venv/bin/python -u download_grid.py > data/raw/harmony_grid/log.txt 2>&1 &
```

- Mỗi biến một job, không bbox (cả Trái Đất), chỉ lấy đúng biến cần, ra NetCDF mỗi tháng một file.
- Tải xong thì `build_cube` gộp về ô 1° và đổi đơn vị → `data/processed/cube_<biến>.nc`.
- Chạy lại an toàn: không tải lại file đã có, bỏ qua biến đã có cube.

✅ *Đã kiểm chứng (13/11, Harmony `/capabilities`):* cả 3 collection có dịch vụ `sds/HOSS-geographic` (cắt biến, cắt bbox, cắt thời gian, ra NetCDF-4). Tên biến HOSS ở bảng trên lấy từ danh sách biến của chính endpoint đó.

### 3b. AppEEARS point trên lưới đất liền 1° (gửi trưa thứ Bảy, P1)

- **Danh sách điểm:**
  - Lấy các ô 1° có giá trị trong cube GLDAS (GLDAS chỉ có đất liền, từ 60°S lên), ghi CSV theo đợt bằng `write_grid_points(land, path, batch_size)`.
  - Không cần task MCD12Q1 riêng để lọc biển. Khoảng 15.000 điểm ⚠️ ước tính.
- **Layer:** như R1–R3 (NDVI + VI_Quality; LST ngày/đêm + QC; ET/PET + ET_QC).
- **Lệnh mỗi đợt:** `appeears.py point grid_G1.csv <layers> 01-01-2001 12-31-2024 data/raw/appeears/G1`.
- **Cái giá:** mỗi ô được đại diện bởi **một pixel 1 km mẫu**, không phải trung bình ô (vùng mẫu ở mục 3c dùng để đo sai lệch này).
- **Kiểm chứng:** ⚠️ cỡ đợt chọn theo kết quả T-5.

### 3c. Vùng mẫu để kiểm chứng (P1)

**AppEEARS area 1 km (đã gửi ở T-3):**

| # | Task | Layer | Ngày |
|---|---|---|---|
| R1 | `R1_mvp_MOD13A3` | `_1_km_monthly_NDVI`, `_1_km_monthly_VI_Quality` | 01-01-2001 → 12-31-2024 |
| R2a | `R2a_mvp_MOD11A2_day` | `LST_Day_1km`, `QC_Day` | như trên |
| R2b | `R2b_mvp_MOD11A2_night` | `LST_Night_1km`, `QC_Night` | như trên |
| R3 | `R3_mvp_MOD16A2GF` | `ET_500m`, `ET_QC_500m`, `PET_500m` | như trên |
| R4 | `R4_static` | MCD12Q1.061 `LC_Type1` + SRTMGL3_NC.003 `SRTMGL3_DEM` | 01-01-2000 → 12-31-2024 (SRTM chụp 02/2000) |

- **Vùng:** các bbox trong `config/regions.geojson`. Hiện có 3 vùng ví dụ (ĐBSCL, Tây Nguyên, Hà Nội); thêm vùng ở châu lục khác chỉ cần thêm bbox và gửi request mới.
- **Định dạng:** output `netcdf4` + projection `native`.
- **Theo dõi:** log ở `data/raw/appeears/R*/log.txt`. Mất kết nối thì chạy `appeears.py fetch TASK_ID OUT_DIR`.
- **Độ bền:** từ 13/11, vòng chờ bỏ qua phản hồi lỗi tạm thời. R2b đã từng dừng vì một phản hồi không phải JSON.

✅ *Giới hạn đã gặp (13/11):* AppEEARS từ chối request có quá nhiều file đầu ra. R2 gộp 4 layer 8 ngày × 24 năm × 3 vùng vượt giới hạn 31,4%, nên được tách thành R2a / R2b. Khi thêm vùng hoặc layer, tách request theo layer hoặc theo giai đoạn.

**Giovanni area-average (tuỳ chọn):**
- Mỗi (vùng mẫu × biến) một job, CSV 288 dòng; 3 vùng × 5 biến = 15 job.
- Mục đích: đối chiếu `region_series` của cube với trung bình vùng do Giovanni tự tính (03 §I2).
- Trước mỗi đợt chạy `quota_guard()`.

### 3d. Contradiction Hunter: danh sách việc

**Định nghĩa (team chốt):** tự tìm các khu vực có xu hướng biến đổi trái ngược nhau (ví dụ khu vực A lượng mưa tăng, khu vực B giảm), rồi so sánh và kiểm định xem sự khác biệt có thực sự đáng tin cậy không. Khu vực **không cho trước**: chúng là các điểm nóng tự gom từ lưới toàn cầu. Phương pháp: 05, loại A.

| # | Việc | Mức | Khi nào | Trạng thái |
|---|---|---|---|---|
| CH-1 | Tự tìm khu vực: gom ô significant cùng chiều, liền kề thành điểm nóng (`hotspot_regions`) | P0 | — | ✅ code có, test đạt |
| CH-2 | Kiểm định khác biệt từng cặp điểm nóng tăng × giảm (`find_opposite_trends`), gói trong `hunt_global` / `find_contradictions` | P0 | — | ✅ code có, test đạt |
| CH-3 | Chạy `find_contradictions` trên cube thật cho `precip`, `soil_moisture`, `tair_land`, `t2m` → `contradictions_<biến>.json` | P0 | Thứ Bảy 20:00 | ☐ chờ cube (T-1, T-4) |
| CH-4 | So sánh hai vùng người dùng chọn (`compare_regions`) | P0 | — | ✅ code có, test đạt |
| CH-5 | Câu giải thích theo template, chỉ dùng số trong bảng kết quả, ví dụ "Lượng mưa ở A tăng 12, ở B giảm 10 mm/tháng/thập kỷ; khác biệt 22 (CI 95%: 15–29), đáng tin cậy" (05, mục 6) | P0 | Chủ nhật 07:00 | ☐ chưa có code |
| CH-6 | Tự đối chiếu top 5 cặp mỗi biến với sự kiện thật (05, mục 5; 03, K15). Điểm nóng được chọn **vì** significant, nên p của khác biệt gần như chắc chắn nhỏ → dựa thêm vào CI, độ ổn định hai nửa và CH-8 | P0 | Chủ nhật 08:00 | ☐ |
| CH-7 | Cùng quy trình cho biến MODIS khi có cube từ AppEEARS point | P1 | Chủ nhật 11:00 | ☐ |
| CH-8 | Vòng kiểm định hoán vị toàn lưới (05, mục 5); loại C "song sinh"; loại B, D | P1–P2 | Nếu còn giờ | ◐ có hàm thành phần |

**Code:**
- [`pipeline/contradictions.py`](../pipeline/contradictions.py) → `hunt_global()`, `find_opposite_trends()`, `pair_difference_test()`.
- [`pipeline/grid.py`](../pipeline/grid.py) → `hotspot_regions()`.
- [`pipeline/api.py`](../pipeline/api.py) → `find_contradictions()`, `compare_regions()`.
- Test: `tests/test_contradictions.py`, `tests/test_grid.py`, `tests/test_api.py`.

---

## 4. Timeline trong hackathon

### Thứ Bảy 14/11

| Giờ | Việc của Data (bạn) | Phối hợp | Checkpoint / giao hàng |
|---|---|---|---|
| **09:00–10:00** | Kick-off: chốt biến, giai đoạn, **hợp đồng dữ liệu** (mục 5: tên hàm, JSON) với frontend / backend / AI | Cả team | Hợp đồng được chốt |
| **10:00–12:00** | Kiểm tra `download_grid.py` đã tải tới đâu. Song song: tạo **cube giả đúng định dạng** (sin + xu hướng) → chạy 4 hàm `api.py` → `web/data/*.json` giả | Frontend, backend nhận JSON giả | **CP1 (12:00):** frontend/backend dựng được giao diện và endpoint trên JSON đúng định dạng |
| 12:00–13:00 | Ăn trưa · `write_grid_points` từ cube GLDAS → **gửi các đợt point `G1…Gn`** (cỡ đợt theo T-5) | | |
| **13:00–16:00** | **Kiểm tra cube thật** `precip`, `soil_moisture`, `tair_land`, `t2m`: sanity range (03 §I), vẽ bản đồ trung bình nhìn bằng mắt (mùa mưa nhiệt đới, sa mạc khô), so 1 vùng với Giovanni web UI | — | **CP2 (16:00):** cube thật P0 |
| **16:00–19:00** | Backend bọc `api.py` thành endpoint; định nghĩa tool cho AI (01, mục 7); xuất `trend_map_<biến>.json` thật | Backend, AI | **CP3 (19:00):** web hiển thị heatmap thật + phân tích vùng bất kỳ |
| 19:00–20:00 | Ăn tối | | |
| **20:00–23:00** | Contradiction Hunter trên cube thật (CH-3) → `contradictions_<biến>.json` v0; nếu R1–R3 xong: đọc vùng mẫu (AppEEARS adapter) | — | `contradictions_*.json` v0 thật |
| 23:00–07:00 | Ngủ (luân phiên) · đợt point nào xong thì tải về (`appeears.py fetch`) | | |

### Chủ nhật 15/11

| Giờ | Việc của Data (bạn) | Phối hợp | Checkpoint / giao hàng |
|---|---|---|---|
| **07:00–09:00** | Câu giải thích template (CH-5); đối chiếu top cặp với sự kiện thật (CH-6) | — | `contradictions_*.json` v1 |
| **09:00–11:00** | Biến MODIS: parse CSV các đợt point (`normalize_points`) → QA → tháng → `points_to_cube` → `cube_ndvi.nc`, `cube_lst_day.nc`, … | | |
| **11:00–14:00** | Contradiction Hunter cho biến MODIS (CH-7); **kiểm chứng vùng mẫu**: cube so với AppEEARS area 1 km và Giovanni area-average; kiểm tra `evidence_report` hiển thị đúng | — | **CP4 (14:00):** đủ biến P1 |
| **14:00–16:00** | Sửa lỗi; P2 nếu dư giờ | Frontend tích hợp | **CP5 (16:00): ĐÓNG BĂNG DỮ LIỆU**, sau mốc này không đổi số liệu |
| **16:00–20:00** | Viết phần "Dữ liệu & Phương pháp" của bài nộp (nguồn, trích dẫn dataset, QA, giới hạn) | Pitch/video | |
| **20:00–22:00** | Hỗ trợ demo; kiểm tra số liệu trên web khớp file | | |
| **22:00–23:59** | Nộp bài; dự phòng sự cố | Cả team | **Nộp trước 23:00**, giữ 1 giờ đệm |

*Tại sao kiểm tra cube Giovanni trước MODIS:* lưới HOSS tải qua đêm nên sáng thứ Bảy đã sẵn sàng. Point AppEEARS mới gửi trưa thứ Bảy và cần nhiều giờ xử lý.

*Tại sao đóng băng dữ liệu lúc 16:00:* video demo, ảnh chụp màn hình và thuyết minh đều trích số liệu. Đổi số sau 16:00 thì các phần đó mâu thuẫn nhau. Giám khảo sẽ thấy, và tệ hơn, chính "Contradiction Hunter" của ta sẽ tự mâu thuẫn.

---

## 5. Hợp đồng với frontend / backend / AI

**Hàm (backend gọi trực tiếp hoặc bọc thành endpoint; AI gọi làm tool):**

| Hàm (`pipeline/api.py`) | Tham số | Có từ | Định nghĩa |
|---|---|---|---|
| `list_variables()` | — | CP1 | 01, mục 7 |
| `trend_map(biến, start, end)` | khoảng thời gian trọn năm | CP1 (cube giả), CP3 (thật) | 01, mục 6–7 |
| `analyze_region(biến, bbox, start, end)` | bbox `[W, S, E, N]`, ≥ 1 ô 1° | CP1, CP3 | 01, mục 6–7 |
| `compare_regions(biến, bbox_a, bbox_b, start, end)` | | CP1, CP3 | 01, mục 7; 05 |
| `find_contradictions(biến, start, end)` | | CP1, thứ Bảy 23:00 (thật) | 05, mục 6 |
| `report.evidence_report(kết quả)` | dict của `analyze_region` / `compare_regions` | CP1 | 01, mục 7 |

**File tĩnh cho lần tải trang đầu:** `web/data/variables.json`, `trend_map_<biến>.json`, `contradictions_<biến>.json` (01, mục 6).

**Quy tắc:** schema đã giao thì **không đổi tên/xoá trường**, chỉ được **thêm**. Tại sao: frontend code theo schema; đổi tên một trường lúc 2 giờ sáng là làm hỏng giao diện mà không ai biết.

---

## 6. Phương án dự phòng (Plan B)

| Sự cố | Dấu hiệu | Plan B | Cái giá phải trả |
|---|---|---|---|
| HOSS vẫn `403` sau T-1 | `download_grid.py` báo `WorkItem failed … 403` | (1) Gọi thẳng một file trên `data.gesdisc.earthdata.nasa.gov`: nếu Earthdata trả `error_msg` kèm `resolution_url`, mở link đó (13/11 là https://urs.earthdata.nasa.gov/approve_app?client_id=e2WVk8Pw6weeLUKZYOxvTQ). (2) Nếu Giovanni area-average chạy được: phân tích vùng gọi Giovanni trực tiếp cho bbox người dùng vẽ (1–5 phút/lần, có cache); heatmap toàn cầu chỉ còn biến MODIS (mục 3b) | Mất heatmap toàn cầu cho mưa / ẩm đất / nhiệt độ không khí |
| Tải IMERG quá chậm / quá nặng | Sáng thứ Bảy chưa xong H1 | Dùng trước các biến đã xong (GLDAS, MERRA-2 nhỏ hơn nhiều); chạy riêng H1 bằng `download_grid.py GPM_3IMERGM_07_precipitation` | Lượng mưa vào web muộn hơn |
| AppEEARS point chưa xong lúc 11:00 Chủ nhật | Nhiều đợt còn `processing` | Biến MODIS chỉ hiển thị cho các đợt đã xong (vài châu lục), ghi rõ vùng phủ | Ít phủ hơn |
| Đợt point bị từ chối vì quá nhiều điểm | `Task rejected` khi gửi | Chia nhỏ đợt (theo dải vĩ độ) | Nhiều task hơn để theo dõi |
| AppEEARS area (vùng mẫu) chưa xong / QA khó | Task `processing`, code QA lỗi | Kiểm chứng chỉ bằng Giovanni area-average; hoặc dùng `*-Statistics.csv` (chưa lọc mây, ghi rõ) | Thiếu bằng chứng cho biến MODIS |
| Backend chưa kịp chạy `api.py` | Endpoint chưa có lúc CP3 | Web đọc thẳng `web/data/*.json` (heatmap mặc định + contradictions mặc định); phân tích vùng tuỳ ý tạm tắt | Mất tính năng chọn vùng / thời gian tuỳ ý |
| Hết quota Giovanni | `quota_guard` báo ≥ 95% | Dừng area-average vùng mẫu; lưới HOSS đã tải xong thì không cần gọi lại | Thiếu một lớp kiểm chứng |
| Cài rasterio/GDAL lỗi | ImportError | Bỏ rasterio: đọc NetCDF chỉ cần `xarray` + `netCDF4`/`h5netcdf` | — |

---

## 7. Môi trường

Project đã có `.venv` (Python 3.14, tạo bằng `uv`). Môi trường này **không có `pip`**, nên cài thư viện bằng `uv`:

```bash
uv pip install --python .venv/bin/python -r requirements.txt
```

**Đăng nhập (cả hai nguồn):**
- `EARTHDATA_USER` / `EARTHDATA_PASS` lấy từ biến môi trường; nếu không có thì lấy từ file `.env` ở thư mục project (hàm `load_env()` trong `appeears.py`).
- File `.env` đã nằm trong `.gitignore`, quyền `600`. Không bao giờ commit hay gửi file `.env`.
- Giovanni / Harmony dùng **cùng tài khoản**: `harmony-py` nhận `auth=(user, pass)`; `/timeseries` và `/quota` nhận Bearer token sinh từ cùng tài khoản đó.
- Tài khoản phải được **liên kết GES DISC** (T-1).

**Lệnh:**

```bash
sh download_appeears.sh                                         # AppEEARS area vùng mẫu R1–R4
nohup .venv/bin/python -u download_grid.py > data/raw/harmony_grid/log.txt 2>&1 &   # lưới toàn cầu HOSS
.venv/bin/python appeears.py fetch TASK_ID OUT_DIR              # tiếp tục chờ / tải một task AppEEARS
.venv/bin/python -m pytest -q tests                             # test, không gọi mạng
```

---

## 8. Định nghĩa "xong" (Definition of Done) cho phần Data

- [ ] `cube_precip.nc`, `cube_soil_moisture.nc`, `cube_tair_land.nc`, `cube_t2m.nc` qua sanity range (03 §I) và đối chiếu Giovanni web UI ở 1 vùng
- [ ] 4 hàm `api.py` chạy trên cube thật; `trend_map` toàn cầu ≤ 5 s
- [ ] `web/data/variables.json`, `trend_map_<biến>.json`, `contradictions_<biến>.json` đã giao, frontend hiển thị đúng
- [ ] Test (`pytest`) đạt
- [ ] (P1) cube biến MODIS; vùng mẫu kiểm chứng xong
- [ ] Phần "Dữ liệu & Phương pháp" có:
  - tên + version từng dataset (GPM_3IMERGM.07, GLDAS_NOAH025_M.2.1, M2IMNXASM.5.12.4, MOD13A3.061, MOD11A2.061, MOD16A2GF.061, MCD12Q1.061, SRTMGL3_NC.003);
  - công cụ (Giovanni / Harmony gồm HOSS, AppEEARS);
  - cách gộp lưới 1°, chính sách QA;
  - phương pháp xu hướng (Seasonal MK + Sen, Hamed-Rao, OLS CI, FDR);
  - cách Contradiction Hunter tìm vùng và kiểm định khác biệt;
  - các giới hạn đã biết: lưới 1°; biến MODIS là pixel mẫu; GLDAS / MERRA-2 là mô hình; mây; Terra drift; ô ven biển lẫn biển (IMERG, MERRA-2); GLDAS không có dưới 60°S; chưa có chlorophyll.
