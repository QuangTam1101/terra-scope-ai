# pipeline/: code của tài liệu 01, 02, 03, 05

Mọi code từng nằm trong `docs/02`, `docs/03`, `docs/05` đã chuyển ra đây, mỗi phần một file. Tài liệu chỉ còn dòng **Code:** trỏ tới file + hàm.

Script ở gốc dự án:
- `appeears.py`: client AppEEARS (gửi task, poll bằng `task_status`, tải). `appeears_adapter.py` gọi nó.
- `download_appeears.sh`: gửi các request vùng mẫu R1–R4.
- `build_regions.py`: thư mục thô AppEEARS R1–R3 → `normalize_area` → `validate` → `data/processed/regions/observations.parquet`, in sanity, `trend_ready` và kiểm tra chéo LST với cube GLDAS Tair (02 §3.5). Request chưa tải xong thì bỏ qua; chạy lại được.
- `build_extra_cubes.py`: file thô ở `data/raw/` của thư mục dự án (GRACE, GLDAS SWE, MERRA-2 sol khí, CRU tmx/tmn, MiCASA, FIRMS, GRACE-DA) → `processed_data/grid/cube_<id>.nc` 1°, trục tháng liền (processed_data/README.md §3.1c).
- `download_grid.py`: tải lưới toàn cầu qua Harmony HOSS → `data/raw/harmony_grid/<VAR_ID>/` → `data/processed/grid/cube_<biến>.nc` (02 §4.6). Cần tài khoản đã authorize app GES DISC (docs/04, T-1; xong 13/11).

Luồng chính của web: **cube lưới 1° toàn cầu** (`grid.py`) → `api.py` (hàm cho backend và cho AI) → `report.py`. Bảng `observations` (`schema.py`) dùng cho vùng mẫu và dữ liệu point trước khi thành cube.

| File | Mục tài liệu | Todo | Hàm / hằng chính | Test |
|---|---|---|---|---|
| `schema.py` | 02 §1–2 | Data Adapter Interface + common schema | `Region`, `FetchRequest`, `SourceAdapter`, `request_id`, `REQUIRED`, `validate`, `rows` | `test_schema_adapters.py` |
| `appeears_adapter.py` | 02 §3 (3.4–3.6) | AppEEARS + CSV/NetCDF; point/polygon extraction | `AppeearsAdapter`, `write_locations`, `normalize_area`, `normalize_points` | `test_schema_adapters.py` |
| `giovanni_adapter.py` | 02 §4 (4.6 HOSS); 03 §G (parse) | Giovanni qua Harmony: lưới HOSS → cube; area-average CSV | `HOSS_VARIABLES`, `harmony_grid`, `read_grid_file`, `convert_cube`, `build_cube`, `GiovanniAdapter`, `harmony_area_csv`, `parse_giovanni_area_csv`, `normalize_area_csv`, `edl_token`, `quota_guard`, `point_series`, `with_retries` | `test_schema_adapters.py`, `test_grid.py` |
| `grid.py` | 01 S5–S8b; 02 §2b; 03 §E, §J | Cube lưới 1° toàn cầu; trend cả lưới; điểm nóng | `bin_to_grid`, `global_coords`, `write_grid_points`, `points_to_cube`, `grid_trend`, `shape_mask`, `region_series`, `hotspot_regions`, `hotspot_obs` | `test_grid.py` |
| `qa.py` | 03 §C, C2, D, D2 | QA masking, missing values, scale factors | `ensure_scaled`, `scale_et`, `FILL`, `mask_fill`, `bits`, `ndvi_good`, `lst_ok`, `lst_valid`, `QA_POLICY`, `VALID` | `test_qa.py` |
| `aggregate.py` | 03 §E, §F; 01 S2–S6 | Raster → regional time series; xarray / rasterio / rioxarray | `decode_layer`, `region_mask`, `raster_to_series`, `zonal_mean`, `composites_to_monthly`, `series_to_monthly` | `test_aggregate.py` |
| `units.py` | 03 §G; 02 §4.2 | Đổi đơn vị có assert | `GIOVANNI_UNITS`, `giovanni_unit`, `convert_units`, `kelvin_to_c` | `test_units.py` |
| `checks.py` | 03 §H, §I, §J; 01 S7 | Kiểm tra sau chuẩn hoá | `SANITY`, `sanity_report`, `cross_check_temp`, `cross_check_et`, `trend_ready` | `test_trends.py` |
| `trends.py` | 01 S8; 05 (FDR) | Xu hướng | `anomaly`, `trend_one`, `bh_fdr`, `trends_table` | `test_trends.py` |
| `contradictions.py` | 05; 01 S8b | Anomaly detection / clustering (Contradiction Hunter) | `hunt_global`, `monthly_z`, `scan_type_a`, `pair_difference_test`, `find_opposite_trends`, `twins_type_c`, `anomaly_events_type_b`, `permute_years`, `sen_slope_per_year` | `test_contradictions.py`, `test_grid.py` |
| `forecast.py`, `indices.py` | 05 §7 | Dự báo 1–18 tháng: khoảng 80% (conformal), xác suất tercile, co về khí hậu, giải thích, năm tương tự; 9 chỉ số NOAA | `fit`, `forecast_region`, `forecast_map`, `load_model`, `latest_origin`, `indices.download` | `test_forecast.py` |
| `api.py` | 01 mục 7 | Lớp phân tích cho web và AI Detective: trả dict JSON gồm số liệu + nguồn + phương pháp + giới hạn | `VARIABLES`, `LIMITATIONS`, `load_cube`, `list_variables`, `trend_map`, `analyze_region`, `compare_regions`, `find_contradictions` | `test_api.py` |
| `report.py` | 01 mục 7 (tính năng 5) | Evidence report Markdown từ kết quả `api` | `evidence_report` | `test_api.py` |

Reprojection: không có hàm riêng. Đường area xin AppEEARS lưới `native` (sinusoidal, pixel đều diện tích), còn `region_mask` chiếu bbox EPSG:4326 sang CRS của raster thay vì chiếu lại raster.

## Chạy test

```bash
.venv/bin/python -m pytest -q tests
```

55 test, chỉ dùng file giả, không gọi mạng. Các chi tiết API chưa xác nhận trên file thật được đánh dấu `# ⚠️` trong code (tên cột CSV point, dạng JSON của `/quota`, tên khoá đơn vị trong CSV Giovanni, cấu trúc nhóm / thứ tự chiều / `units` của file HOSS).

## Chưa làm

- Template câu giải thích cho cặp mâu thuẫn (`explanation_vi`, docs/04 CH-5).
- Lưới điểm MODIS thật (`write_grid_points` → AppEEARS point → `points_to_cube`): cube GLDAS đã có (13/11, 17.284 ô đất liền); chờ kết quả thử batch (T-5).
- Backend HTTP bọc `api.py`: thuộc phần web, không nằm trong `pipeline/`.
- Contradiction loại D (giữa các biến): P2.
- Vòng kiểm định hoán vị (đếm cặp thật so với cặp khi xáo năm): mới có các khối `permute_years` + `sen_slope_per_year`, chưa có hàm chạy cả vòng.
