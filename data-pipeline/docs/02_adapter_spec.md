# 02 — Adapter Specification cho Giovanni/AppEEARS

> **Adapter là gì?** Một "bộ chuyển đổi", giống ổ cắm du lịch. Pipeline lấy dữ liệu từ **hai nguồn rất khác nhau**:
> - **AppEEARS** trả **ảnh raster gốc** (NetCDF-4 theo vùng, hoặc CSV theo điểm). Ta phải tự nhân scale factor, bỏ fill, lọc mây theo QA rồi lấy trung bình vùng.
> - **Giovanni qua Harmony** trả hai thứ:
>   - **Lưới gốc toàn cầu** của từng biến qua dịch vụ HOSS (NetCDF, mỗi tháng một file).
>   - **Chuỗi trung bình vùng** đã xử lý sẵn (CSV).
>
>   Giovanni đã bỏ fill và QA bên trong. Ta chỉ cần đọc, gộp lưới về 1°, kiểm tra đơn vị và đổi đơn vị.
>
> Mỗi nguồn có một adapter. Cả hai adapter đều đổ ra **cùng hai định dạng chung**:
> - **Cube lưới toàn cầu 1°** (mục 2b): nền của mọi tính năng trên web.
> - **Bảng `observations`** (mục 2): cho vùng mẫu và cho dữ liệu point trước khi vào cube.
>
> Mọi bước sau (trend, Contradiction Hunter, lớp `api.py`, web) **không cần biết** một giá trị đến từ nguồn nào.

---

## 1. Hợp đồng chung

### 1.1 Giao diện adapter

**Quyết định:** dùng một `Protocol` nhỏ gồm 2 hàm, `fetch` và `normalize`.
**Tại sao:** có **hai** cài đặt thật (AppEEARS, Giovanni), nên một giao diện chung là đáng: `pipeline/run.py` chỉ cần lặp qua danh sách adapter. Hai hàm được tách riêng vì **tốc độ và tần suất chạy khác hẳn nhau**:

| Hàm | Làm gì | Tốc độ | Chạy khi nào |
|---|---|---|---|
| `fetch(reqs, raw_dir)` | Gửi request lên NASA, chờ, tải file về `data/raw/<source>/<request_id>/` | Chậm (phút → giờ) | **Một lần** (có cache) |
| `normalize(reqs, raw)` | Đọc file thô → bảng chung | Nhanh (giây) | **Nhiều lần** (mỗi lần đổi ngưỡng QA, sửa lỗi…) |

**Code:** [`pipeline/schema.py`](../pipeline/schema.py) → `Region`, `FetchRequest`, `SourceAdapter` (test: `tests/test_schema_adapters.py`)

### 1.2 Vùng phải là hình chữ nhật (bbox)

- **Quyết định:** mọi vùng đều là **bbox** `[W, S, E, N]`, ở bất kỳ đâu trên thế giới:
  - vùng người dùng vẽ trên web (`api.analyze_region`, `api.compare_regions`);
  - vùng mẫu trong `config/regions.geojson`. Hiện có 3 vùng Việt Nam (ĐBSCL, Tây Nguyên, Hà Nội) làm ví dụ để **kiểm chứng**, không phải phạm vi phân tích.
- **Tại sao:** Giovanni area-average chỉ nhận **BBox**. Nếu AppEEARS dùng polygon hình tỉnh còn Giovanni dùng bbox, hai nguồn đo **hai vùng khác nhau** và không so sánh được. Vì vậy ta gửi **cùng một bbox** cho cả hai: AppEEARS nhận nó dưới dạng polygon 5 đỉnh.
- **Kiểm chứng:** ✅ notebook chính thức của GES DISC chỉ dùng `BBox`. ⚠️ `harmony-py` có tham số `shape`, nhưng chưa rõ Giovanni có lấy trung bình theo shape được không, nên chưa dùng.

### 1.3 Quy tắc cache (bắt buộc)

**Code:** [`pipeline/schema.py`](../pipeline/schema.py) → `request_id()` (test: `tests/test_schema_adapters.py`)

- `fetch` kiểm tra `data/raw/<source>/<request_id>/manifest.json`. **Nếu file đã có thì không gọi API.**
- Thư mục raw là **bất biến**: không sửa hay ghi đè file đã tải. Muốn dữ liệu khác thì tạo request khác, tức `request_id` khác.
- **Tại sao:** chạy lại pipeline không bao giờ tốn thêm giờ chờ NASA hay thêm quota Giovanni, và luôn truy ngược được một con số về đúng file gốc.

---

## 2. Schema chung: `observations.parquet`

Mỗi dòng là **1 vùng (hoặc điểm lưới) × 1 biến × 1 tháng**. Cả hai adapter và cả hai đường (vùng/điểm) đều ra **cùng** schema này.

| Cột | Kiểu | Ví dụ | Ý nghĩa / lý do có cột này |
|---|---|---|---|
| `region_id` | str | `mekong_delta`, `g_10.0_105.0` | Khoá vùng/điểm |
| `geom_type` | str | `polygon` | `polygon` = trung bình vùng; `point` = giá trị tại điểm |
| `variable` | str | `ndvi`, `precip` | ID chuẩn (khớp `config/variables.yaml`) |
| `time` | date | `2024-01-01` | **Luôn là ngày đầu tháng**, UTC |
| `value` | float64 | `0.6123` | Giá trị **đã ở đơn vị chuẩn**; NaN nếu bị loại |
| `unit` | str | `1`, `degC`, `mm/month` | Đơn vị chuẩn, ghi kèm để không ai phải đoán |
| `source` | str | `appeears` / `giovanni` | Hệ thống cung cấp dữ liệu |
| `dataset` | str | `MOD13A3.061`, `GPM_3IMERGM.07` | Product + version: **trích dẫn khoa học bắt buộc** |
| `source_variable` | str | `_1_km_monthly_NDVI`, `GPM_3IMERGM_07_precipitation` | Tên gốc, để truy vết |
| `agg` | str | `area_mean` | `area_mean` (vùng) hoặc `pixel` (điểm) |
| `n_valid` | Int64 | `48210` | Số pixel hợp lệ sau QA (AppEEARS). **Null** với Giovanni |
| `valid_frac` | float | `0.81` | Tỷ lệ hợp lệ; `< 0.3` → `value = NaN`. **Null** với Giovanni |
| `qa_policy` | str | `modland_good`, `giovanni_preprocessed` | Chính sách QA đã áp |
| `request_ref` | str | AppEEARS `task_id` / Harmony `job_id` | Truy ngược về request gốc |
| `pipeline_version` | str | `0.1.0` | Bảng được sinh từ phiên bản code nào |

**Khoá duy nhất:** (`region_id`, `variable`, `time`). Trùng khoá là lỗi.

**Tại sao Giovanni để `n_valid`/`valid_frac` trống:** Giovanni không trả số pixel hợp lệ. Điền một con số bịa (ví dụ 1.0) sẽ khiến frontend và Contradiction Hunter tin nhầm rằng dữ liệu đó "đầy đủ chắc chắn".

Hàm kiểm tra hợp đồng. **Mọi đầu ra của adapter phải qua hàm này:**

**Code:** [`pipeline/schema.py`](../pipeline/schema.py) → `REQUIRED`, `validate()`; thêm `rows()` dựng dòng đúng thứ tự cột (test: `tests/test_schema_adapters.py`)

**Phạm vi dùng bảng này:** vùng mẫu (AppEEARS area, Giovanni area-average) và dữ liệu AppEEARS point trước khi chuyển thành cube (`points_to_cube`). Phân tích trên web đọc **cube** (mục 2b).

**Tại sao kiểm tra miền giá trị ở đây:** đây là "lưới an toàn" cuối cho lỗi scale factor và lỗi đổi đơn vị. Các trường hợp như sau đều bị chặn trước khi lên biểu đồ:
- NDVI = 6523: quên nhân scale.
- Lượng mưa 0.12 mm/tháng: quên đổi từ mm/giờ.
- ET = 3276 mm: lọt lớp fill đặc biệt.

## 2b. Định dạng chung: cube lưới toàn cầu `cube_<biến>.nc`

| Thành phần | Quy ước |
|---|---|
| Kiểu | `xarray.DataArray`, `name` = ID biến chuẩn (`precip`, `ndvi`…), lưu NetCDF ở `data/processed/grid/cube_<biến>.nc` |
| Chiều | `(time, lat, lon)` = `(288, 180, 360)` |
| `time` | ngày đầu tháng, 2001-01-01 → 2024-12-01 |
| `lat`, `lon` | tâm ô 1°: −89.5 … 89.5 và −179.5 … 179.5 (`grid.global_coords()`) |
| Giá trị | đơn vị chuẩn (mục 4.2, 3.5 bước 7); NaN = không có dữ liệu (biển với GLDAS / MODIS, Nam Cực, tháng bị loại do QA) |
| `attrs` | `units`, `source`, `dataset`, `source_variable`, `grid` (`1deg_block_mean` cho HOSS; 1 pixel tại tâm ô cho AppEEARS point) |

**Code:** [`pipeline/grid.py`](../pipeline/grid.py) → `bin_to_grid()`, `points_to_cube()`, `global_coords()`; [`pipeline/giovanni_adapter.py`](../pipeline/giovanni_adapter.py) → `build_cube()` (test: `tests/test_grid.py`, `tests/test_api.py`)

---

## 3. Adapter AppEEARS

### 3.1 Tóm tắt nguồn

| Mục | Giá trị | |
|---|---|---|
| Base URL | `https://appeears.earthdatacloud.nasa.gov/api` | ✅ |
| Xác thực | `POST /login` (Basic auth Earthdata) → Bearer token. Tài khoản đọc từ `.env` (`EARTHDATA_USER` / `EARTHDATA_PASS`, hàm `load_env()` trong `appeears.py`) | ✅ |
| Biến | `ndvi`, `lst_day`, `lst_night`, `et`, `pet` (+ `et_pet_ratio` tính sau) | ✅ `/api/product` 13/11 |
| Thuộc tính tĩnh | lớp phủ đất `LC_Type1`, độ cao `SRTMGL3_DEM` (~60°N–56°S ⚠️) | ✅ |
| Dữ liệu trả về | Raster NetCDF-4 (area) hoặc CSV (point) | ✅ |
| Adapter phải tự làm | decode scale/fill, lọc QA, trung bình vùng, gộp về tháng, đổi đơn vị | |

### 3.2 Bảng layer: scale, fill, QA

| Biến chuẩn | Product | Layer giá trị | Scale | Fill | Layer QA | Đơn vị chuẩn |
|---|---|---|---|---|---|---|
| `ndvi` | MOD13A3.061 (tháng, 1 km) | `_1_km_monthly_NDVI` | 0.0001 | -3000 | `_1_km_monthly_VI_Quality` (bit 0–1 MODLAND) | `1` |
| `lst_day` | MOD11A2.061 (8 ngày, 1 km) | `LST_Day_1km` | 0.02 K | 0 | `QC_Day` | `degC` |
| `lst_night` | MOD11A2.061 | `LST_Night_1km` | 0.02 K | 0 | `QC_Night` | `degC` |
| `et` | MOD16A2GF.061 (8 ngày, 500 m) | `ET_500m` | 0.1 mm/8 ngày | 32767 (raw > 32700 là fill đặc biệt) | `ET_QC_500m` | `mm/month` |
| `pet` | MOD16A2GF.061 | `PET_500m` | 0.1 mm/8 ngày | 32767 (như trên) | `ET_QC_500m` | `mm/month` |
| (tĩnh) | MCD12Q1.061 (năm, 500 m) | `LC_Type1` | — | 255 | `QC` | lớp 1–17 |
| (tĩnh) | SRTMGL3_NC.003 (90 m) | `SRTMGL3_DEM` | — | -32768 | — | m |

> ⚠️ **Bẫy QC fill:** AppEEARS khai `_FillValue = 0` cho `QC_Day`/`QC_Night`, nhưng **QC = 0 nghĩa là chất lượng tốt nhất** (mọi bit = 0). Nếu che QA theo fill, ta vứt đúng những pixel tốt nhất. Quy tắc:
> - Luôn đọc layer QA ở **dạng số thô** (`mask_and_scale=False`).
> - Nhận biết pixel LST thiếu bằng **LST raw = 0**, tức fill của chính layer LST.

### 3.3 Endpoint dùng đến

| Endpoint | Mục đích | Cần đăng nhập |
|---|---|---|
| `GET /product`, `GET /product/{id}` | Danh mục product/layer, scale, fill, valid range | Không ✅ |
| `GET /quality/{product}/{qa_layer}[/{value}]` | Giải mã bit QA | Không ✅ |
| `GET /spatial/proj` | Danh sách projection (`native`, `geographic`…) | Không ✅ |
| `POST /task` | Gửi request | Có |
| `GET /task/{task_id}` | Trạng thái `pending` / `processing` / `done` / `error` | Có |
| `GET /bundle/{task_id}`, `GET /bundle/{task_id}/{file_id}` | Danh sách file / tải từng file | Có |

### 3.4 fetch: tạo request, chờ, tải

**Quyết định:**
- **Mỗi product một task, mọi vùng trong cùng một task** (FeatureCollection nhiều feature).
  - Tại sao: các task chạy song song trên máy chủ, một task lỗi không kéo theo task khác. AppEEARS xuất file theo product × feature nên vẫn tách được vùng.
- **Luôn xin kèm layer QA tương ứng.**
  - Tại sao: thiếu QA thì không lọc mây được, và phải tải lại mất vài giờ.
- **Area: `netcdf4` + projection `native`.**
  - Tại sao: NetCDF có trục thời gian và attrs để decode tự động. `native` (sinusoidal) là lưới **diện tích bằng nhau**, nên trung bình vùng không cần trọng số và không bị reproject nearest-neighbor làm méo.
  - ✅ Tài liệu API chính thức ghi: *file_type must be one of geotiff or netcdf4*.

| # | Product | Layer | Ngày |
|---|---|---|---|
| R1 | MOD13A3.061 | `_1_km_monthly_NDVI`, `_1_km_monthly_VI_Quality` | 01-01-2001 → 12-31-2024 |
| R2a | MOD11A2.061 | `LST_Day_1km`, `QC_Day` | 01-01-2001 → 12-31-2024 |
| R2b | MOD11A2.061 | `LST_Night_1km`, `QC_Night` | 01-01-2001 → 12-31-2024 |
| R3 | MOD16A2GF.061 | `ET_500m`, `ET_QC_500m`, `PET_500m` | 01-01-2001 → 12-31-2024 |
| R4 | MCD12Q1.061 + SRTMGL3_NC.003 | `LC_Type1`, `SRTMGL3_DEM` | 01-01-2000 → 12-31-2024 (SRTM chụp 02/2000) |
| G1, G2… | như R1–R3, dạng **point** | như trên | tâm các ô đất liền 1° (mục 3.6), mỗi đợt `batch_size` điểm |

R1–R4 (vùng mẫu) đã có sẵn trong `download_appeears.sh`. Lệnh `sh download_appeears.sh` gửi song song cả 5 request (R2 tách R2a/R2b vì AppEEARS từ chối request quá nhiều file), mỗi request ghi một log. Đã gửi 13/11.

Task JSON mẫu (area):

```json
{
  "task_type": "area",
  "task_name": "R1_mvp_MOD13A3",
  "params": {
    "dates": [{"startDate": "01-01-2001", "endDate": "12-31-2024"}],
    "layers": [
      {"product": "MOD13A3.061", "layer": "_1_km_monthly_NDVI"},
      {"product": "MOD13A3.061", "layer": "_1_km_monthly_VI_Quality"}
    ],
    "output": {"format": {"type": "netcdf4"}, "projection": "native"},
    "geo": {"type": "FeatureCollection", "features": ["<<các bbox từ config/regions.geojson>>"]}
  }
}
```

Task JSON mẫu (point, một đợt grid):

```json
{
  "task_type": "point",
  "task_name": "G1_ndvi",
  "params": {
    "dates": [{"startDate": "01-01-2001", "endDate": "12-31-2024"}],
    "layers": [{"product": "MOD13A3.061", "layer": "_1_km_monthly_NDVI"},
               {"product": "MOD13A3.061", "layer": "_1_km_monthly_VI_Quality"}],
    "coordinates": [{"id": "g_10.5_105.5", "category": "grid", "latitude": 10.5, "longitude": 105.5}]
  }
}
```

**Chờ và tải** (đã có trong `appeears.py`; adapter chỉ bọc thêm cache và manifest):
- Poll `GET /task/{id}` mỗi 30 giây (`task_status()`). Trạng thái `error` → dừng và ghi log. Phản hồi lỗi tạm thời (rỗng, HTML, mất kết nối) → in `unknown (…, retrying)` rồi poll tiếp. Ngày 13/11, R2b đã từng dừng vì một phản hồi không phải JSON trước khi có xử lý này.
- Tải **toàn bộ** bundle, kể cả `*-Statistics.csv`, `*-request.json`, `*-granule-list.txt`, bảng QA lookup và README.
  - Tại sao: Statistics.csv dùng để kiểm tra chéo; request.json để tái tạo request; README để trích dẫn.
  - Đường dẫn file do server trả về được kiểm tra, **không cho ghi ra ngoài thư mục đích**.
- `task_id` được lưu ở `OUT_DIR/task_id.txt`. Mất kết nối thì chạy `appeears.py fetch TASK_ID OUT_DIR`, **không gửi lại task**.
- Ghi `manifest.json`: `{request_id, task_id, submitted_at, completed_at, files: [...]}`.

**Code:** [`pipeline/appeears_adapter.py`](../pipeline/appeears_adapter.py) → `AppeearsAdapter.fetch()`, `write_locations()` (test: `tests/test_schema_adapters.py`)

`write_locations` ghi bbox thành polygon GeoJSON (area), hoặc ghi CSV `id,category,latitude,longitude` (point). Hàm này chỉ vài dòng nên không ghi ở đây.

### 3.5 normalize, đường area: NetCDF-4 → bảng chung

| Bước | Chi tiết | Code |
|---|---|---|
| 1. Mở file | `xr.open_dataset(path, mask_and_scale=False)`. Đọc **số thô**, tự decode để kiểm soát bẫy QC fill. ✅ File thật (R4, 13/11): lưới `native` có chiều `xdim`/`ydim` (mét), CRS sinusoidal nằm trong **biến** `crs` (phải `set_coords("crs")` thì rioxarray mới đọc được); `time` dùng **lịch julian** (cftime), lấy nguyên ngày ghi trên nhãn | 03, mục B |
| 2. Fill | Che theo fill của **layer giá trị** (NDVI -3000, LST 0, ET/PET > 32700). Không che QA theo fill | 03, mục B |
| 3. Scale | `ensure_scaled()`: tự phát hiện file đã nhân scale hay chưa (⚠️ chưa biết AppEEARS NetCDF đã scale sẵn chưa) | 03, mục C |
| 4. QA | NDVI: `modland_good` (bit 0–1 = 00). LST: `modland_good_or_lst_err_le_2k`. ET/PET: `et_valid_only` (giải mã qua `/api/quality/MOD16A2GF.061/ET_QC_500m`) | 03, mục D |
| 5. Trung bình vùng | Mỗi `.nc` ứng với một feature → map sang `region_id`. ✅ Tên file là `<dataset>_<độ phân giải>_aid<NNNN>.nc`, `NNNN` = **thứ tự feature** (1, 2…) trong GeoJSON gửi đi; tên **không** chứa id vùng (`nc_files_for`). Lưới `native` có diện tích bằng nhau nên trọng số = 1. `n_valid` = số pixel còn lại; `valid_frac = n_valid / n_pixel_trong_vùng` | 01, S2–S6 |
| 6. Về tháng | NDVI: đã là tháng. LST: trung bình các composite 8 ngày có ngày bắt đầu trong tháng (`min_composites=2`). ET/PET: **cộng theo ngày** (`composites_to_monthly(how="sum")`), vì ET là tổng lượng nước cho 8 ngày chứ không phải giá trị tức thời | 03, mục F |
| 7. Đơn vị | NDVI giữ nguyên; LST K → °C (−273.15); ET/PET → mm/tháng; `et_pet_ratio = et / pet` tính sau cùng | 03, mục G |
| 8. Cột | `source="appeears"`, `geom_type="polygon"`, `agg="area_mean"`, `qa_policy` theo biến, `request_ref = task_id`; `valid_frac < 0.3` → `value = NaN` | mục 2 |

**Code:** [`pipeline/appeears_adapter.py`](../pipeline/appeears_adapter.py) → `normalize_area()`, `nc_files_for()` (test: `tests/test_aggregate.py`)

**Kiểm tra chéo `*-Statistics.csv`:** AppEEARS tự tính mean theo từng feature × ngày, nhưng **chưa lọc QA**. Tắt QA trong adapter, rồi so trung bình vùng tự tính với cột `Mean`: lệch < 1% là đường decode và trung bình vùng đúng. Bật QA lại thì chênh lệch phản ánh đúng phần mây đã bị loại.

### 3.6 normalize, đường point: CSV → bảng chung

Đường này đưa **biến MODIS lên lưới toàn cầu 1°** (P1): NDVI, LST, ET/PET cho heatmap, phân tích vùng và Contradiction Hunter.

- Task `point` trả về 1 CSV, mỗi dòng là 1 điểm × 1 ngày composite. ⚠️ Tên cột dạng `{PRODUCT}_{VERSION}_{layer}` (ví dụ `MOD13A3_061__1_km_monthly_NDVI`). Cần xác nhận trên file thật, kể cả giá trị đã scale hay chưa (T-5 trong 04).
- **Điểm lưới:**
  - Tâm các ô 1° có giá trị trong cube GLDAS (GLDAS chỉ có đất liền, từ 60°S lên), ghi CSV `id,latitude,longitude` theo đợt bằng `write_grid_points(land, path, batch_size)`. Khoảng 15.000 điểm (⚠️ ước tính).
  - Không cần task MCD12Q1 riêng để lọc biển.
- ⚠️ **AppEEARS không công bố giới hạn số điểm mỗi request.** Gửi G1 nhỏ trước; nếu bị từ chối thì giảm `batch_size`.
- Quy tắc decode/QA giống đường area (kể cả bẫy QC fill). Về tháng: `series_to_monthly()` cho từng điểm (bên trong gọi `composites_to_monthly`).
- Cột: `region_id = "g_{lat}_{lon}"` (tâm ô, ví dụ `g_10.5_105.5`), `geom_type="point"`, `agg="pixel"`, `n_valid` = số composite hợp lệ trong tháng, `valid_frac = n_valid / số composite của tháng`.
- Sau khi `validate()`: `points_to_cube(obs, biến)` → cube (mục 2b); ô không có điểm là NaN.
- Giá trị là **1 pixel**, không phải trung bình ô. Phương án thay thế vẫn trong AppEEARS: polygon nhỏ ~10 × 10 km quanh mỗi điểm, đi đường area, rồi lấy cột mean của `*-Statistics.csv` theo từng feature.

**Code:** [`pipeline/appeears_adapter.py`](../pipeline/appeears_adapter.py) → `normalize_points()`; [`pipeline/grid.py`](../pipeline/grid.py) → `write_grid_points()`, `points_to_cube()` (test: `tests/test_schema_adapters.py`, `tests/test_api.py`)

### 3.7 Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| `400` khi gửi task | Sai tên layer, sai ngày (phải MM-DD-YYYY), format không hợp lệ | Đọc message, sửa |
| `400` với point task lớn | Quá nhiều điểm (giới hạn không công bố) ⚠️ | Giảm `batch_size` |
| `401` | Sai mật khẩu trong `.env`, hoặc chưa đăng nhập web AppEEARS lần nào | Đăng nhập web một lần |
| `done` nhưng bundle rỗng | Không có granule khớp, hoặc toàn fill | Kiểm tra ngày/vùng |
| LST gần như toàn NaN sau QA | Dính bẫy QC fill (QA bị CF decode) | Mở file với `mask_and_scale=False` |
| ET có giá trị hàng nghìn mm | Lọt fill đặc biệt 32761–32766 | Che raw > 32700 |
| Chờ nhiều giờ | Hàng đợi đông | Gửi từ tối 13/11; không kịp thì dùng Statistics.csv (ghi chú "chưa lọc QA") |
| Tiến trình chờ chết với `JSONDecodeError` | Một phản hồi tạm thời không phải JSON (đã gặp 13/11) | Đã sửa trong `task_status()`; với tiến trình cũ: `appeears.py fetch TASK_ID OUT_DIR` |

> ℹ️ Banner trang AppEEARS (13/11/2026): **Suomi NPP ngừng cung cấp dữ liệu mới từ 2/11**. Không ảnh hưởng các biến chính (MODIS Terra).

---

## 4. Adapter Giovanni

### 4.1 Tóm tắt nguồn

| Mục | Giá trị | |
|---|---|---|
| Vai trò | Các biến khí hậu **AppEEARS không có**: lượng mưa, ẩm đất, nhiệt độ không khí, bốc hơi mô hình | |
| Lưới toàn cầu | **Harmony HOSS** (`sds/HOSS-geographic`): cắt biến, không bbox → lưới gốc cả Trái Đất, NetCDF-4 mỗi tháng một file (mục 4.6) | ✅ chạy được từ 13/11 sau khi authorize GES DISC |
| Trung bình vùng | Qua **Harmony** (dịch vụ xử lý trên cloud mà Giovanni dùng), thư viện `harmony-py` 1.8.0, `average="area"` → CSV | ✅ API; 13/11 lỗi `Failed validating bearer token` trước khi authorize GES DISC, chưa chạy lại ⚠️ |
| Chuỗi tại điểm | `GET https://api.giovanni.earthdata.nasa.gov/timeseries` + Bearer token Earthdata | ✅ endpoint có (trả 401 nếu thiếu token); ⚠️ định dạng response |
| Quota | `GET https://api.giovanni.earthdata.nasa.gov/quota` → tỷ lệ đã dùng 0..1 | ✅ endpoint có |
| Xác thực | Cùng tài khoản trong `.env` (`EARTHDATA_USER` / `EARTHDATA_PASS`) | |
| Adapter phải tự làm | Gửi job, đọc NetCDF / parse CSV, **gộp lưới về 1°**, **assert đơn vị**, đổi đơn vị, gán `time` về đầu tháng | |
| Không phải làm | Scale, fill, QA: GES DISC / Giovanni đã làm | |

**Quyết định (team chốt 13/11): Giovanni/Harmony cung cấp lưới toàn cầu (HOSS) cho heatmap, phân tích vùng bất kỳ và Contradiction Hunter; area-average dùng cho vùng mẫu.**
- **Tại sao:**
  - Heatmap toàn cầu cần dữ liệu dạng lưới, mà area-average chỉ trả một chuỗi cho mỗi bbox.
  - Gọi `/timeseries` từng điểm thì cần 15.000 điểm × 5 biến ≈ 75.000 lời gọi, chắc chắn vượt quota.
  - HOSS trả cả lưới trong **mỗi biến một job**, cùng tài khoản, cùng `harmony-py`, cùng collection.
- **Đã bỏ:** drill-down Giovanni cho top cặp. Lượng mưa / ẩm đất / nhiệt độ đã có sẵn trên lưới nên không cần nữa.

### 4.2 Bảng biến, đơn vị và phép đổi

| Biến chuẩn | ID biến Giovanni ✅ | Dataset (concept ID ✅ CMR) | Đơn vị Giovanni (cần assert) | Đổi sang | Phạm vi |
|---|---|---|---|---|---|
| `precip` | `GPM_3IMERGM_07_precipitation` | GPM_3IMERGM.07 (`C2723754851-GES_DISC`), 0.1° | `mm/hr` ⚠️ | `mm/month` = × 24 × số ngày trong tháng | toàn cầu |
| `soil_moisture` | `GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst` | GLDAS_NOAH025_M.2.1 (`C1342986036-GES_DISC`), 0.25° | `kg/m^2` | `m3/m3` = ÷ 100 (lớp dày 0.1 m, 1 kg/m² nước = 1 mm) | đất liền, 60°S–90°N |
| `tair_land` | `GLDAS_NOAH025_M_2_1_Tair_f_inst` | GLDAS_NOAH025_M.2.1 | `K` | `degC` = − 273.15 | đất liền, 60°S–90°N |
| `evap_gldas` | `GLDAS_NOAH025_M_2_1_Evap_tavg` | GLDAS_NOAH025_M.2.1 | `kg/m^2/s` | `mm/day` = × 86400 | đất liền; **kiểm tra chéo** với ET của MODIS |
| `t2m` | `M2IMNXASM_5_12_4_T2M` | M2IMNXASM.5.12.4 (`C1276812823-GES_DISC`), 0.5° × 0.625° | `K` | `degC` = − 273.15 | toàn cầu (cả biển) |

Ví dụ kiểm tra tay:
- Mưa 0.3 mm/giờ trong tháng 7 (31 ngày) → 0.3 × 24 × 31 = **223.2 mm/tháng**.
- Ẩm đất 32 kg/m² → 32 / 100 = **0.32 m³/m³**.
- Bốc hơi 3e-5 kg/m²/s → 3e-5 × 86400 = **2.59 mm/ngày**.

Tên biến khi gọi HOSS (lấy từ Harmony `/capabilities`, ✅ 13/11): `Grid/precipitation`, `SoilMoi0_10cm_inst`, `Tair_f_inst`, `Evap_tavg`, `T2M` (`HOSS_VARIABLES`). Đơn vị đọc từ thuộc tính `units` của NetCDF và được assert bằng cùng danh sách ở bảng trên (`convert_cube`).

**Tại sao assert đơn vị trước khi đổi:** nếu Giovanni đổi đơn vị (ví dụ IMERG trả `mm/month` thay vì `mm/hr`), nhân thêm 24 × 31 sẽ cho số sai gấp 744 lần mà không ai biết. Có assert thì pipeline **dừng ngay** và báo rõ lý do.

**Code:** [`pipeline/units.py`](../pipeline/units.py) → `GIOVANNI_UNITS`, `convert_units()` (gộp `UNIT_RULES` cũ, khoá theo ID biến Giovanni) (test: `tests/test_units.py`)

### 4.3 fetch, trung bình vùng (Harmony)

**Code:** [`pipeline/giovanni_adapter.py`](../pipeline/giovanni_adapter.py) → `CONCEPT_IDS`, `harmony_area_csv()`, `GiovanniAdapter.fetch()` (test: `tests/test_schema_adapters.py`)

✅ Tên và chữ ký `Client.submit(request)`, `wait_for_processing(job_id)`, `download_all(job_id, directory, overwrite)` (trả về các `Future`, nên phải gọi `.result()`) đã được kiểm tra trực tiếp trên `harmony-py` 1.8.0 ngày 13/11. Còn ⚠️: nội dung CSV thật, xác nhận bằng T-4.

### 4.4 Parse CSV trung bình vùng

CSV của Giovanni có **phần đầu là metadata**: tên biến, đơn vị, bbox… Phần metadata **kết thúc ở một dòng chỉ có dấu `,`**, sau đó là bảng 2 cột `time, mean_<VAR>`.

**Code:** [`pipeline/giovanni_adapter.py`](../pipeline/giovanni_adapter.py) → `parse_giovanni_area_csv()` (nhận đường dẫn hoặc chuỗi), `normalize_area_csv()` (test: `tests/test_schema_adapters.py`)

`normalize` cho mỗi file:
1. `parse_giovanni_area_csv`.
2. Lấy đơn vị từ `meta`, rồi gọi `convert_units`.
3. Gán `time` về đầu tháng. Giovanni ghi mốc đầu tháng; dòng `to_period("M")` ở trên vẫn đảm bảo điều đó dù Giovanni ghi giữa tháng.
4. Điền cột: `source="giovanni"`, `geom_type="polygon"`, `agg="area_mean"`, `n_valid=None`, `valid_frac=None`, `qa_policy="giovanni_preprocessed"`, `request_ref = job_id`.
5. **Điền đủ 288 tháng** bằng `reindex`. Tháng thiếu thành NaN, không bị bỏ dòng.

⚠️ **Chưa rõ:** Giovanni area-average có trọng số cos(vĩ độ) không? Ở vùng nhỏ gần xích đạo thì chênh lệch không đáng kể. Với bbox lớn, hoặc ở vĩ độ cao (Siberia, Canada), không có trọng số thì các ô gần cực bị tính quá tay.

### 4.5 Chuỗi tại điểm (dự phòng), token, quota, retry

**Code:** [`pipeline/giovanni_adapter.py`](../pipeline/giovanni_adapter.py) → `edl_token()`, `quota_guard()` / `check_quota()`, `point_series()`, `with_retries()` (test: `tests/test_schema_adapters.py`)

- **Quota:** gọi `quota_guard()` trước mỗi đợt job. Khi đã dùng ≥ 95% thì **dừng hẳn**, không thử lại. Tại sao: hết quota giữa đêm thứ Bảy thì Chủ nhật không còn gọi được Giovanni, kể cả cho phân tích vùng mẫu lúc demo.
- **Retry:** chỉ thử lại lỗi mạng hoặc timeout, chờ tăng dần 10 → 20 → 40 giây. Lỗi `400` (sai ID biến, sai bbox) thì thử lại vô ích, nên dừng ngay.
- **Raw:** lưu **nguyên văn** response vào `data/raw/giovanni/<request_id>/`, sau đó mới parse. Tại sao: parser sai thì sửa parser và chạy lại `normalize`, không phải gọi lại API và tốn thêm quota.
- `point_series()` không nằm trong luồng chính sau khi có HOSS. Nó chỉ còn là phương án dự phòng: `geom_type="point"`, `agg="pixel"` (giá trị ô lưới chứa điểm).

### 4.6 Lưới toàn cầu qua Harmony HOSS → cube 1°

**Code:**
- [`pipeline/giovanni_adapter.py`](../pipeline/giovanni_adapter.py) → `HOSS_VARIABLES`, `harmony_grid()`, `read_grid_file()`, `convert_cube()`, `build_cube()`.
- [`pipeline/grid.py`](../pipeline/grid.py) → `bin_to_grid()`.
- Script: [`download_grid.py`](../download_grid.py).
- Test: `tests/test_grid.py`.

**Các bước:**
1. **Request:** `Request(collection=Collection(id=CONCEPT_IDS[dataset]), temporal={start, stop}, variables=[HOSS_VARIABLES[var_id]], format="application/x-netcdf4")`.
   - **Không truyền `spatial`**, nghĩa là cả Trái Đất.
   - Không `average`, nên Harmony chọn HOSS thay vì dịch vụ trung bình của Giovanni.
2. **Chờ + tải:** ghi `job_id.txt` ngay khi gửi; `wait_job()` hỏi trạng thái mỗi 30 s; rồi `download_all(job, directory=data/raw/harmony_grid/<VAR_ID>/, overwrite=False)`. Mỗi tháng một file, 288 file mỗi biến.
3. **Đọc:** `read_grid_file()` → `(time, lat, lon)`.
   - IMERG nằm trong nhóm `Grid` với chiều gốc `(time, lon, lat)`, `units = mm/hr`, `time` theo **lịch julian** (cftime).
   - GLDAS phẳng `(time, lat, lon)`, `units = kg m-2`, lưới 600 × 1440 (chỉ từ 60°S); MERRA-2 phẳng, `units = K`, lưới 361 × 576 (gồm cả ±90°).
4. **Gộp về ô 1°:** `bin_to_grid()` lấy trung bình mọi ô gốc có tâm trong ô 1°, bỏ NaN. Dùng chung cho IMERG 0.1°, GLDAS 0.25° và MERRA-2 0.5° × 0.625° (lưới này không chia hết cho 1°).
5. **Đơn vị:** `convert_cube()` assert thuộc tính `units` rồi đổi; `days_in_month` lấy từ trục `time`.
6. **Đủ lưới:** `reindex` về 180 × 360 ô (`global_coords`); ô không có dữ liệu (GLDAS dưới 60°S, biển) = NaN.
7. **Ghi:** `data/processed/grid/cube_<biến>.nc` (mục 2b).

**Lý do của các lựa chọn:**
- *Vì sao trung bình khối chứ không dùng dịch vụ regrid của HOSS:* `/capabilities` không ghi phương pháp nội suy của dịch vụ regrid. Lấy trung bình khối thì giá trị ô 1° đúng là trung bình mưa / ẩm đất trong ô (bảo toàn tổng lượng), dễ giải thích với giám khảo (03, K18).
- *Vì sao 1°:* 64.800 ô cho heatmap tính được trong ~4 s. Mỗi cube chỉ ~75 MB.

**Đã kiểm chứng (13/11):**
- ✅ `/capabilities` của cả 3 collection có `sds/HOSS-geographic` (bbox / biến / thời gian, NetCDF-4) và tên biến như trên.
- ✅ Request hợp lệ (`is_valid()`), job được tạo.
- ✅ Lỗi `403` trước đó là do tài khoản chưa authorize app GES DISC. Earthdata báo rõ khi gọi thẳng file trên `data.gesdisc.earthdata.nasa.gov`: *"Pre authorization required for this application"*, kèm link https://urs.earthdata.nasa.gov/approve_app?client_id=e2WVk8Pw6weeLUKZYOxvTQ. Authorize xong là chạy được.
- ✅ Job 1 tháng mất 50–85 s. File tháng nặng 7 MB (IMERG), 0,8 MB (GLDAS), 0,5 MB (MERRA-2), nên cả 288 tháng × 5 biến ≈ 3 GB.
- ✅ `build_cube` chạy trên file thật tháng 7/2010: mưa ĐBSCL 241 mm, nam Sahara 16 mm; ẩm đất ĐBSCL 0,36, Sahara 0,09 m³/m³.
- ⚠️ GLDAS gán ẩm đất **100 kg/m² cố định** (= 1,0 m³/m³) cho ô phủ băng (Greenland, Patagonia, Alaska…), vượt khoảng sanity 0–0,6. Chuỗi không đổi nên xu hướng = 0; chưa che (03, K22).

### 4.7 Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| `401` | Token hết hạn / sai tài khoản | Gọi lại `edl_token()` |
| HOSS: `WorkItem failed … 403 error retrieving … opendap.earthdata.nasa.gov` | Tài khoản chưa authorize app GES DISC (✅ nguyên nhân thật 13/11) | Mở https://urs.earthdata.nasa.gov/approve_app?client_id=e2WVk8Pw6weeLUKZYOxvTQ → Authorize (04, T-1) |
| Area-average: `Unauthorized: Failed validating bearer token` | Như trên ⚠️ | Như trên, rồi chạy lại |
| `harmony-py`: `Invalid format for Job ID 'status'` | `wait_for_processing` / `download_all` của harmony-py hỏi endpoint `/jobs/status`, Harmony thỉnh thoảng trả 400 (13/11: cả 5 job 288 tháng đều dính sau ~15 phút). Job trên máy chủ vẫn chạy tiếp | Đã sửa: `wait_job()` tự hỏi `client.status()` (`/jobs/<id>`); `job_id.txt` ghi ngay khi gửi, chạy lại `download_grid.py` sẽ nối tiếp job cũ |
| `FileNotFoundError … .harmony-xxxx` khi tải | Thư mục đích chưa tồn tại | Tạo thư mục trước (`download_grid.py` đã làm) |
| Job Harmony `failed` | Sai ID biến, bbox ngoài phạm vi (ví dụ GLDAS dưới 60°S) | Đọc message trong job |
| Assert đơn vị lỗi | Giovanni đổi đơn vị | Đối chiếu tài liệu dataset rồi cập nhật `GIOVANNI_UNITS` (`pipeline/units.py`) |
| CSV không có dòng `,` | Định dạng đổi | Mở file raw, sửa `parse_giovanni_area_csv` |
| Bbox ven biển, mưa/T2M lệch so với MODIS | IMERG/MERRA-2 tính cả ô biển trong bbox, còn MODIS chỉ có đất liền | Ghi rõ trong giới hạn; chọn bbox ít biển |

---

## 5. Tiêu chí chấp nhận (adapter "xong" khi…)

### AppEEARS

| # | Kiểm tra | Area | Point |
|---|---|---|---|
| A1 | `validate(df)` qua (schema, khoá, miền giá trị, đơn vị) | ☐ | ☐ |
| A2 | Chạy `fetch` lần 2 **không gọi API** | ☐ | ☐ |
| A3 | Đủ 288 tháng cho mỗi (vùng/điểm, biến); tháng thiếu là NaN nhưng vẫn có dòng | ☐ | ☐ |
| A4 | Tắt QA thì khớp cột `Mean` của `*-Statistics.csv` (< 1%) | ☐ | — |
| A5 | Bẫy QC fill: pixel/điểm có `QC_Day = 0` được **giữ lại** | ☐ | ☐ |
| A6 | ET: tổng 12 tháng = tổng các composite 8 ngày của năm (< 0.5%); không có giá trị > 3270 mm | ☐ | ☐ |
| A7 | Điểm ở tâm vùng và trung bình vùng đó cùng chu kỳ mùa (tương quan > 0.8, ⚠️ ngưỡng khởi đầu) | ☐ | ☐ |
| A8 | `request_ref` dẫn được về task gốc trên AppEEARS | ☐ | ☐ |

### Giovanni

| # | Kiểm tra | Kết quả |
|---|---|---|
| V1 | `validate(df)` qua; `n_valid`/`valid_frac` null, `qa_policy = giovanni_preprocessed` | ☐ |
| V2 | Chạy `fetch` lần 2 **không gọi API, không tốn quota** | ☐ |
| V3 | Assert đơn vị chạy cho cả 5 biến (cố ý đổi đơn vị giả thì phải báo lỗi) | ☐ |
| V4 | 1 vùng × 1 biến × 1 năm khớp con số tải tay từ **Giovanni web UI** (Time Series, Area-Averaged) | ☐ |
| V5 | Mưa tháng mùa mưa / mùa khô hợp lý cho vùng (ví dụ ĐBSCL mùa mưa 5–11 nhiều hơn rõ rệt) | ☐ |
| V6 | `evap_gldas` (GLDAS) và `et` (MODIS) cùng chu kỳ mùa ở cùng vùng (khác biên độ là bình thường vì một bên là mô hình, một bên là vệ tinh) | ☐ |
| V7 | `quota_guard` chặn được khi quota ≥ 0.95 (test bằng giá trị giả) | ☐ |

### Giovanni / HOSS (lưới toàn cầu)

| # | Kiểm tra | Kết quả |
|---|---|---|
| H1 | Mỗi biến đủ 288 file tháng; chạy `download_grid.py` lần 2 không tải lại | ☐ |
| H2 | Cube đúng chiều `(288, 180, 360)`, đúng tâm ô, `attrs.units` = đơn vị chuẩn | ☐ |
| H3 | Assert đơn vị chạy (cố ý đổi `units` giả thì báo lỗi) | ✅ test |
| H4 | `bin_to_grid` bảo toàn trung bình một khối, bỏ qua NaN | ✅ test |
| H5 | `region_series` của cube trên một vùng mẫu khớp Giovanni area-average cùng bbox (chênh do lưới 1° nhỏ) | ☐ |
| H6 | Bản đồ trung bình nhìn hợp lý: mưa nhiều ở dải hội tụ nhiệt đới, ít ở Sahara; GLDAS NaN trên biển | ☐ |
