# Terra-scope AI: Backend (FastAPI)

HTTP API cho frontend (nhánh `UI`), bọc các hàm phân tích của `data-pipeline/pipeline`.
Hợp đồng API: `FRONTEND_BACKEND_CONTRACT.md` v0.2. Nguồn sự thật khi chạy: `/openapi.json`.

```
React (UI)  ──/api/v1──▶  backend/app (FastAPI)  ──▶  data-pipeline/pipeline  ──▶  cube lưới 1° (NetCDF)
```

Backend **không tự tính thống kê**: xu hướng, p-value, CI, FDR, kiểm định khác biệt đều gọi hàm của pipeline
(`trends.trend_one`, `grid.grid_trend`, `grid.region_series`, `contradictions.pair_difference_test`).
Backend chỉ kiểm tra request, chọn vùng, cắt thời gian, đổi tên trường theo contract và viết câu tóm tắt.

## Chạy

```bash
conda activate spaceapps
cd backend
uvicorn app.main:app --reload --port 8000
```
- Swagger UI: http://localhost:8000/docs
- Frontend: đặt `VITE_API_BASE_URL=http://localhost:8000` trong `.env.local` của nhánh `UI`.

### Dữ liệu
Backend đọc cube `cube_<biến>.nc` (time, lat, lon). Có hai loại, backend tự đọc cỡ ô và vùng phủ từ cube:

| Loại | Tạo bằng | Thư mục | Cỡ ô |
|---|---|---|---|
| **Toàn cầu (mặc định, đội chốt 13/11)** | Long chia sẻ trong git (`data-pipeline/download_grid.py`) | `data-pipeline/processed_data/grid/` | 1°, 5 biến, 2001–2024 |
| Toàn cầu (tự tạo lại) | `data-pipeline/download_grid.py` | `data-pipeline/data/processed/grid/` | 1° |
| Vùng Mekong lưới mịn (tuỳ chọn) | `python scripts/download_region.py` | `data-pipeline/data/processed/regions/mekong/` | IMERG 0,1°, GLDAS 0,25°, khung `[94, 8, 110, 35]`; dùng bằng cách đặt `CUBE_DIR` |

`scripts/download_region.py` dùng lại hàm Harmony HOSS của pipeline, cắt theo khung, giữ lưới gốc; đăng nhập
Earthdata bằng file `.netrc`/`_netrc` (tài khoản phải đã authorize app GES DISC). Thư mục `data/` **không có trong git**.
Khi chưa có cube, các endpoint phân tích trả `503 DATA_NOT_READY` và `/variables` báo `available: false`.

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `PIPELINE_DIR` | `../data-pipeline` | Thư mục chứa package `pipeline` |
| `CUBE_DIR` | `$PIPELINE_DIR/processed_data/grid` nếu có cube, không thì `$PIPELINE_DIR/data/processed/grid` | Thư mục cube |
| `WARM_UP` | `1` | Tính sẵn bản đồ xu hướng toàn kỳ khi khởi động (~15 s/biến, chạy nền) |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Domain frontend, cách nhau bằng dấu phẩy |
| `MAX_BBOX_AREA_DEG2` | `64800` (cả thế giới) | Diện tích vùng tối đa |

## Endpoint

| Endpoint | Gọi pipeline | Ghi chú |
|---|---|---|
| `GET /api/v1/health` |: | Kèm danh sách biến đã có cube |
| `GET /api/v1/variables` | `api.VARIABLES` + đọc trục thời gian cube | 10 biến; `available`, `coverage` lấy từ cube thật |
| `GET /api/v1/regions` | `config/regions.geojson` | + `global` (demo, cả thế giới), `mekong_region` (`[94, 8, 110, 35]`) và `northern_vietnam` (frontend dùng) |
| `POST /api/v1/series` | `grid.region_series`, `trends.anomaly` | Chuỗi tháng, anomaly, climatology |
| `POST /api/v1/trends` | `trends.trend_one` | Seasonal MK + Sen; CI từ OLS trên anomaly; p Hamed-Rao |
| `GET /api/v1/trends/grid` | `grid.grid_trend` (cache) | Bản đồ xu hướng (divergence map). FDR Benjamini-Hochberg trên toàn lưới, rồi cắt theo `bbox` |
| `GET /api/v1/values/grid` | trung bình theo thời gian của cube | Heatmap giá trị; `month=1..12` để chỉ lấy một tháng |
| `POST /api/v1/compare` | `contradictions.pair_difference_test` | `is_contradiction` khi ngược chiều **và** hiệu significant |
| `POST /api/v1/explain` | dùng lại kết quả `/trends` | Bản **template, chưa có LLM** (`model: "template-v1 (no language model)"`) |
| `GET /api/v1/jobs/{id}` |: | Luôn `404`: mọi endpoint trả kết quả ngay |
| `POST /api/v1/reports` |: | **Chưa làm** (P2) |

Khớp với frontend hiện tại:
- Vùng `{"type": "geojson", "geometry": {...}}` mà frontend gửi cho điểm/polygon được chấp nhận: điểm → ô 1° chứa điểm,
  polygon → khung bao; luôn kèm `warnings`.
- `/explain` nhận `context.period` dạng `"2005-2024"` hoặc `"2005-01/2024-12"`; thiếu vùng thì dùng vùng demo.

## Test

```bash
cd backend
python -m pytest -q tests
```
17 test trên cube giả (lưới 1° và lưới 0,25°) (sinh ngẫu nhiên có xu hướng biết trước), không cần dữ liệu NASA thật, không gọi mạng.

## Việc còn lại
- Nhận cube thật từ Long, chạy thử với frontend.
- `/explain` gọi LLM (chưa chọn nhà cung cấp; key chỉ đặt ở `.env` của backend).
- `/reports` (có thể dùng `pipeline/report.py`).
- Deploy + domain CORS.

## Ghi chú về AI
Code trong `backend/` được viết với sự hỗ trợ của AI (Claude Code); đội kiểm tra và chịu trách nhiệm nội dung.
