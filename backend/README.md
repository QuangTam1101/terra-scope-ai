# Terra-scope AI: Backend (FastAPI)

Phase 3 adds optional backend-only Gemini enhancement to `/api/v1/chat`.
Without a key, the deterministic Template Mode remains available.
See [PHASE_3_GEMINI.md](notes/PHASE_3_GEMINI.md) for configuration, grounding constraints,
Windows startup/test commands and limitations. `/api/v1/explain` remains unchanged.

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
| **Toàn cầu (mặc định, đội chốt 13/11)** | Long chia sẻ trong git (`data-pipeline/download_grid.py`) | `data-pipeline/processed_data/grid/` | 1°, 5 biến gốc (IMERG, MERRA-2: 2001–2024; 3 biến GLDAS: 2001-01 → 2026-07) + 8 biến thêm 15/11 |
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
| `GET /api/v1/variables` | `api.VARIABLES` + đọc trục thời gian cube | 18 biến (13 có cube trên máy dev từ 15/11: thêm GPCC, CRU TS, SMAP, SeaWiFS, GLDAS vùng rễ và 3 tầng sâu); `available`, `coverage` lấy từ **trục thời gian** cube, nên cube của sản phẩm ngắn hơn 2001–2025 (GPCC đến 2020-12, SMAP từ 2015-04, SeaWiFS đến 2010-12, nay thay bằng MODIS-Aqua 2002-07 → 2025-12) phải là bản cắt, không phải symlink tới file `data/processed/grid` (trục luôn 2001–2025) |
| `GET /api/v1/regions` | `config/regions.geojson` | + `global` (demo, cả thế giới), `mekong_region` (`[94, 8, 110, 35]`) , `northern_vietnam` (frontend dùng) và 4 vùng ví dụ của Home: `central_chile`, `southern_amazon`, `europe`, `mediterranean` |
| `POST /api/v1/series` | `grid.region_series`, `trends.anomaly` | Chuỗi tháng, anomaly, climatology |
| `POST /api/v1/trends` | `trends.trend_one` | Seasonal MK + Sen; CI từ OLS trên anomaly; p Hamed-Rao. Biến đếm sự kiện (`ANNUAL_SLOPE`): `slope_method` = `sen_annual` (Sen trên trung bình năm) |
| `POST /api/v1/trends/sensitivity` | `service.trend_sensitivity` (gọi lại `bridge.trend_one` như `/trends`) | Cùng body với `/trends`. `points`: chạy lại đúng phép thử cho mỗi năm bắt đầu (tháng 1) còn ≥ 10 năm tới `end`, xếp từ chuỗi ngắn nhất; điểm cuối trùng `/trends` cả kỳ. `years_needed.estimate`: số năm thêm (ước lượng thô) để \|độ dốc OLS anomaly\| / sai số chuẩn ≥ 1,96, sai số tính từ SD phần dư và tự tương quan bậc 1; `null` khi đã có ý nghĩa. Cách tính ghi trong `basis`, giới hạn trong `caveat` |
| `GET /api/v1/trends/grid` | `grid.grid_trend` (cache) | Bản đồ xu hướng (divergence map). FDR Benjamini-Hochberg trên toàn lưới, rồi cắt theo `bbox` |
| `GET /api/v1/values/grid` | trung bình theo thời gian của cube | Heatmap giá trị; `month=1..12` để chỉ lấy một tháng |
| (lưới cực) | cube `(time, cell)` của băng biển | `/variables` ghi `grid: "polar"`; hai endpoint lưới trên thêm `hemi`/`row`/`col` cho từng ô và khối `polar` (số hàng/cột, mặt nạ đất base64) để web vẽ bản đồ cực; ô lat/lon không có ba trường này (`model_dump_json(exclude_unset=True)`). `/values/frames?hemi=N\|S` trả raster pixel của một cực (hàng từ dưới lên như khung lat/lon, khối k × k pixel khi pixel có dữ liệu × số tháng > `VALUE_BUDGET`; cả kỳ 2001–2025 là khối 50 km, ~5 MB sau gzip), `grid.polar` kèm `hemi`, `rows`, `cols`, `factor`, `land_b64` |
| `POST /api/v1/compare` | `contradictions.pair_difference_test` | `is_contradiction` khi ngược chiều **và** hiệu significant |
| `POST /api/v1/explain` | dùng lại kết quả `/trends` | Bản **template, chưa có LLM** (`model: "template-v1 (no language model)"`) |
| `POST /api/v1/chat` | dùng lại `/trends` + dịch vụ `/explain` | Chat typed, `mode: "template"`; không gọi LLM |
| `POST /api/v1/forecast` | `pipeline/forecast.py` | Dự báo khí hậu AI: `mode` = `outlook` (từ hôm nay, tối đa 18 tháng, chỉ dùng chỉ số NOAA) hoặc `satellite` (tối đa 12 tháng từ tháng cuối của cube). Trả giá trị, khoảng 80%, xác suất tercile, nhãn độ tin cậy, giải thích (đơn giản và khoa học), bảng backtest. Code ở `app/forecast_service.py` |
| `GET /api/v1/forecast/map` | `forecast.forecast_map` | Bản đồ triển vọng toàn cầu cho một tháng đích (`month=YYYY-MM`) |
| `GET /api/v1/forecast/status` | `forecast.latest_origin` | Dữ liệu đang dùng đến tháng nào (cube vệ tinh, từng chỉ số NOAA) |
| `GET /api/v1/forecast/reality-check` | `models/reality_check.json` | Dự báo trước đây so với số đo thật của NASA GISTEMP |
| `GET /api/v1/jobs/{id}` |: | Luôn `404`: mọi endpoint trả kết quả ngay |
| `POST /api/v1/reports` |: | **Chưa làm** (P2) |

Khớp với frontend hiện tại:
- Vùng `{"type": "geojson", "geometry": {...}}` mà frontend gửi cho điểm/polygon được chấp nhận: điểm → ô 1° chứa điểm,
  polygon → khung bao; luôn kèm `warnings`.
- Vùng `{"type": "country", "id": "<tên Natural Earth>"}`: chỉ lấy ô có tâm nằm trong đường viền quốc gia
  (`data-pipeline/config/countries-110m.json`, world-atlas 2.0.2 1:110m, cùng file frontend vẽ; `grid.shape_mask`). Tên lạ →
  `404 NOT_FOUND`. Nước nhỏ hơn một ô (trên lưới 1°: Luxembourg, Síp, Bắc Síp, Jamaica, Palestine) dùng ô gần tâm khung bao, kèm
  warning. Chat (`tools.py`) nhận cả `country`; giới hạn 1000 độ² của agent vẫn tính theo khung bao.
- Vùng `{"type": "polar", "hemi": "N"|"S", "rows": [r0, r1], "cols": [c0, c1]}` (pixel NSIDC, gồm cả hai đầu; vẽ trên bản đồ cực):
  cube băng biển lấy đúng các pixel đó (`grid.PolarBox`); cube lat/lon lấy ô có tâm chiếu vào hình vuông (`polar_pixel`), nhỏ hơn
  một ô thì dùng ô gần tâm kèm warning. Ngoài lưới hoặc `r0 > r1` → 422. Chat nhận cả `polar` và không áp giới hạn diện tích.
- `details` của lỗi đi qua `jsonable_encoder` có bộ chuyển numpy (`errors._body`): số đọc từ cube (float32) từng làm chính lỗi
  `NO_DATA` thành 500.
- `/explain` nhận `context.period` dạng `"2005-2024"` hoặc `"2005-01/2024-12"`; thiếu vùng thì dùng vùng demo.

## Test

```bash
cd backend
python -m pytest -q tests
```
Test trên cube giả (lưới 1° và lưới 0,25°) (sinh ngẫu nhiên có xu hướng biết trước), gồm hợp đồng chat và tương thích `/explain`; không cần dữ liệu NASA thật, không gọi mạng.

## Chat foundation (Phase 2)

`POST /api/v1/chat` nhận `message` (1–2000 ký tự sau khi bỏ khoảng trắng đầu/cuối),
`context` và `history` (tối đa 24 lượt, chỉ role `user`/`assistant`).
`context.variable_id` dùng ID từ `/variables`; `dataset_id` là `source.product` chính xác,
ví dụ `imerg_precip` + `GPM_3IMERGM`. Vùng dùng schema `RegionRef` hiện có;
`start`/`end` phải được cung cấp cùng nhau, dạng `YYYY-MM`.

PowerShell, khi backend đang chạy trên cổng 8000:

```powershell
$body = @{
    message = 'What is the rainfall trend in the Mekong Delta?'
    context = @{
        variable_id = 'imerg_precip'
        dataset_id = 'GPM_3IMERGM'
        region = @{ type = 'preset'; id = 'mekong_delta' }
        start = '2001-01'
        end = '2024-12'
    }
    history = @()
} | ConvertTo-Json -Depth 8
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/api/v1/chat' -ContentType 'application/json; charset=utf-8' -Body $body
```

Response có `answer`, `mode: "template"`, `evidence`, `warnings`, `actions`, `disclaimer`.
`analysis_id` chỉ xuất hiện khi có kết quả thật. Mỗi evidence chứa nguyên `TrendResponse`
(nguồn, phương pháp, CI, chất lượng, null nếu thiếu số liệu) và `cited_numbers` từ `/explain`.
Warnings có `code`/`message`; actions điều hướng tới Explore có params typed: biến, vùng, start/end.

Có thể gửi `context.trend_id` để dùng lại kết quả trong bộ nhớ. Context kèm theo phải khớp kết quả đó;
sai trả 409 `CONTEXT_MISMATCH`. ID hết hạn có thể được tính lại nếu cung cấp đầy đủ context;
nếu không, trả 404. Dataset không khớp trả 422 `UNSUPPORTED_DATASET`.
Lỗi biến/vùng/dữ liệu/thời gian giữ nguyên định dạng lỗi hiện có.

Template hỗ trợ câu hỏi xu hướng quá khứ và glossary tiếng Anh nhỏ (p-value, Sen's slope, confidence interval).
Không tự trích địa danh/biến/thời gian từ câu hỏi hoặc history; context tường minh là nguồn lựa chọn duy nhất.
Thiếu context không tự dùng vùng toàn cầu. Câu hỏi ngoài phạm vi trả limitation, không tạo số liệu hay analysis ID.
Lịch sử chỉ ở React store của phiên trang, còn khi chuyển trang và mất khi reload; backend chưa suy luận hội thoại.
Không thêm model provider, khóa API hoặc dependencies mới; `/explain` giữ nguyên hợp đồng.

## Việc còn lại
- Nhận cube thật từ Long, chạy thử với frontend.
- `/explain` gọi LLM (chưa chọn nhà cung cấp; key chỉ đặt ở `.env` của backend).
- `/reports` (có thể dùng `pipeline/report.py`).
- Deploy + domain CORS.

## Ghi chú về AI
Code trong `backend/` được viết với sự hỗ trợ của AI (Claude Code); đội kiểm tra và chịu trách nhiệm nội dung.

## Current Phase 4 contract

Phase 6 audit and approval gate: [Scientific audit](notes/PHASE_6_SCIENTIFIC_AUDIT.md),
[pending correction proposal](notes/PHASE_6_CORRECTION_PROPOSAL.md), and [partial QA/manual browser checklist](notes/PHASE_6_QA.md).
No production statistical correction is approved or active.

Phase 5 adds a reference-only scientific method advisor, deterministic trust assessment and optional
`scientific_advice` in chat evidence. See [PHASE_5.md](notes/PHASE_5.md) for the actual method audit,
known statistical limitations, validation record and current commands. Original numeric results and `/explain` are unchanged.

See [PHASE_4.md](notes/PHASE_4.md) for the current architecture, limits, validation record and Windows commands.
The Phase 2 section above describes the legacy path. Add `use_tools: true` to `/api/v1/chat`
to use deterministic conversational selection, the six safe tools, and optional bounded Gemini
function calling. The default remains `false` for existing clients. `/api/v1/explain` is unchanged.
Template Mode supports these tools without a Gemini key. No new dependencies are required beyond Phase 3.
