# Terra-scope AI: Hợp đồng Frontend ↔ Backend

> **Dành cho:** agent AI hỗ trợ Phú (frontend).
> **Chủ sở hữu backend:** Hưng (FastAPI).
> **Trạng thái:** **v0.2** (13/11/2026). Mọi thay đổi phải được Hưng xác nhận trước khi sửa file này.
> **Nguồn sự thật cuối cùng:** `GET /openapi.json` của backend đang chạy. Nếu file này và OpenAPI khác nhau → **OpenAPI thắng**, rồi báo lại để cập nhật file này.

### Cập nhật v0.2.1 (13/11/2026, tối): chuyển sang BẢN ĐỒ TOÀN CẦU
| # | Thay đổi | Lý do |
|---|---|---|
| A | Backend mặc định đọc **5 cube lưới 1° toàn cầu** của Long (`data-pipeline/processed_data/grid/`): `imerg_precip`, `gldas_soil_moisture_0_10cm`, `gldas_air_temperature`, `gldas_evapotranspiration`, `merra2_air_temperature_2m`, 2001-01 → 2024-12 | Đội chốt bản đồ toàn cầu thay vì chỉ vùng Mekong |
| B | `limits.max_bbox_area_deg2 = 64800` (cả thế giới); preset mới **`global`** ("Whole world", `[-180,-90,180,90]`) là vùng demo; `mekong_region`, `mekong_delta`… vẫn có | Đề: "chọn vùng, có thể là toàn cầu" |
| C | `/variables` thêm `parameter`, `parameter_name`, `dataset_name` → UI chọn theo thứ tự **biến môi trường → dataset → thời gian → vị trí** (vd. Air temperature → GLDAS (land only) hoặc MERRA-2 (land and sea)) | Yêu cầu của đội |
| D | Endpoint mới **`GET /values/grid`**: heatmap GIÁ TRỊ (trung bình kỳ chọn, tuỳ chọn `month=1..12`). `GET /trends/grid` là bản đồ XU HƯỚNG phân kỳ (divergence map) | Yêu cầu của đội: heatmap + divergence map |
| E | Response được nén **gzip**; backend tính sẵn bản đồ xu hướng toàn kỳ khi khởi động (`WARM_UP=1`). Bản đồ toàn cầu không `bbox` ~8 MB JSON (trước nén) → **frontend nên gửi `bbox` theo khung nhìn** | Hiệu năng |

`GET /values/grid?variable_id=&start=&end=&bbox=&month=` →
```json
{ "variable_id": "imerg_precip", "units": "mm/month", "start": "2001-01", "end": "2024-12", "stat": "mean", "month": null,
  "cell_size_deg": 1.0, "value_range": { "min": 0.0, "max": 1234.5, "p02": 0.0, "p98": 250.8 },
  "cells": [ { "lon": 105.5, "lat": 10.5, "value": 152.3, "valid_fraction": 1.0 } ], "warnings": [] }
```
Thang màu tuần tự nên dùng `p02`–`p98` (ô cực trị không làm nhạt cả bản đồ). Không có `bbox` → chỉ trả ô có dữ liệu.

### Thay đổi so với v0.1
| # | Thay đổi | Lý do |
|---|---|---|
| 1 | Lưới phân tích là **1°** (`cell_size_deg = 1.0`), không phải 0,1° | Cube thật của pipeline (Long) là lưới 1° toàn cầu |
| 2 | Độ ẩm đất dùng đơn vị **`m3/m3`**, không phải `kg/m2` | Đúng với `pipeline/api.py` |
| 3 | IMERG trả sẵn **`mm/month`** (backend đổi đơn vị) | Chốt câu hỏi mở số 5 |
| 4 | Vùng dùng **`preset`** hoặc **`bbox`**. `geojson` vẫn nhận để khớp frontend hiện tại: điểm → ô 1° chứa điểm, polygon → khung bao, luôn kèm `warnings` | Pipeline chỉ nhận bbox |
| 5 | Giới hạn vùng: phải chứa **ít nhất 1 tâm ô 1°**, diện tích **≤ 2500 deg²** (`limits.min_cells`, `limits.max_bbox_area_deg2`) | Lưới 1°; chốt câu hỏi mở số 2 |
| 6 | Ngưỡng `sufficient`: **≥ 10 năm có dữ liệu và ≥ 70% số tháng có dữ liệu** | Đúng với `trends.trend_one` của pipeline |
| 7 | Thêm trường `ci_method`, `p_value_autocorr_adjusted` cho `/trends`; `tau` thành tuỳ chọn | Pipeline tính Sen slope + Seasonal MK, CI từ OLS trên anomaly, p hiệu chỉnh tự tương quan bằng Hamed-Rao |
| 8 | Thêm trường `available` cho `/variables`; backend có thể trả **nhiều hơn 2 biến** | Pipeline có 10 biến |
| 9 | `/explain` nhận thêm `context.variable_id`, `context.region`, `context.period` (tuỳ chọn) | Frontend đã gửi các trường này |
| 10 | Thêm quy tắc **R13** (không fallback dữ liệu giả âm thầm), **R14** (không ghi tên model khi không gọi model), **R15** (slope luôn theo thập kỷ) | Kết quả kiểm tra UI ngày 13/11 ([UI_CONTRACT_REVIEW.md](UI_CONTRACT_REVIEW.md)) |
| 11 | Chốt các câu hỏi mở 1–5 (xem mục 9) | |

---

## 0. Nhiệm vụ của agent

Bạn là agent kiểm tra frontend của Terra-scope AI. Với **mỗi tính năng** trong mục 5, hãy:

1. Xác định màn hình/component nào thực hiện tính năng đó.
2. Kiểm tra request frontend gửi đi **khớp đúng** endpoint, method, tên trường, kiểu dữ liệu ở mục 3–4.
3. Kiểm tra frontend **đọc đúng** các trường response (tên, kiểu, trường có thể `null`).
4. Kiểm tra đủ 4 trạng thái UI: **loading · thành công · rỗng/không đủ dữ liệu · lỗi**.
5. Kiểm tra các **quy tắc bắt buộc** ở mục 2.
6. **Kiểm tra màn hình thật sự dùng dữ liệu từ API**, không chỉ là "có hàm gọi API". Một tính năng chỉ đạt khi component hiển thị đúng dữ liệu trả về từ endpoint.
7. Ghi kết quả theo mẫu báo cáo ở mục 8.

**Không được:** tự đổi hợp đồng API, tự thêm endpoint, hay sửa code backend. Nếu thấy thiếu hoặc vô lý → ghi vào mục "Câu hỏi cho Hưng" trong báo cáo.

---

## 1. Kiến trúc tổng quan

```
React (Phú)  ──HTTP/JSON──▶  FastAPI (Hưng)  ──▶  pipeline/api.py (Long)  ──▶  cube lưới 1° (NetCDF, tính sẵn từ NASA)
                                   │
                                   ├──▶  Trend engine trong pipeline (Seasonal MK + Sen, Hamed-Rao, OLS CI, FDR)
                                   ├──▶  Cache kết quả
                                   └──▶  LLM: CHỈ gọi từ backend
```

- Frontend **chỉ nói chuyện với backend**. Không gọi NASA, không gọi LLM trực tiếp.
- Mọi phép thống kê được tính ở backend/pipeline. Frontend **chỉ hiển thị**.
- Dữ liệu NASA đã được tải và đưa về **lưới 1° toàn cầu** trước; request của người dùng chỉ đọc cube, không tải từ NASA lúc chạy.

---

## 2. Quy tắc bắt buộc (agent phải kiểm tra từng điều)

| # | Quy tắc | Cách kiểm tra |
|---|---|---|
| R1 | Không có API key, token nào trong code frontend hay biến `VITE_*`/`NEXT_PUBLIC_*` | Tìm `key`, `token`, `secret`, `GEMINI`, `OPENAI`, `sk-` trong `src/` và file `.env*` được commit |
| R2 | Frontend không tự tính slope, p-value, CI, significance, contradiction, trung bình vùng | Không có code hồi quy/kiểm định/lấy trung bình slope trong `src/` |
| R3 | Đơn vị luôn lấy từ API (`units`, `display_units`), không hardcode | Tìm chuỗi `mm`, `°C`, `m³/m³` hardcode cạnh số liệu |
| R4 | Màu "significant" trên **bản đồ lưới** dùng `significant_fdr`, không dùng `p_value < 0.05`, không fallback sang `significant` chưa hiệu chỉnh | Xem code tô màu heatmap |
| R5 | Màu "significant" cho **một vùng** dùng trường `significant` do backend trả | Không tự so sánh `p_value` |
| R6 | Mọi `warnings[]` từ backend được hiển thị cho người dùng | Có component hiện cảnh báo |
| R7 | Câu trả lời của AI luôn hiển thị kèm `cited_numbers` và `disclaimer` | Xem component chat |
| R8 | Toàn bộ chữ trên giao diện bằng **tiếng Anh** (quy định nộp bài) | Quét chuỗi hiển thị |
| R9 | Mọi request có timeout và xử lý lỗi theo `error.code` (mục 4.11), không chỉ theo HTTP status | Xem lớp API client **và** lớp gọi nó |
| R10 | Base URL đọc từ biến môi trường (`VITE_API_BASE_URL`), không hardcode `localhost` | Xem config |
| R11 | Trường hợp `direction = "no_trend"` hoặc `significant = false` vẫn được trình bày như **kết quả có giá trị**, không như lỗi | Xem câu chữ UI |
| R12 | Có nút/ví dụ demo bấm-là-chạy cho người mới | Màn hình đầu tiên |
| **R13** | Khi `VITE_API_BASE_URL` được đặt: lỗi backend phải **hiện ra như lỗi**, **không** âm thầm thay bằng dữ liệu giả. Chế độ dữ liệu giả chỉ bật khi không có `VITE_API_BASE_URL` (hoặc công tắc "Demo mode"), và luôn có nhãn **"Simulated data"** nhìn thấy được | Tìm `catch` trả mock; xem banner |
| **R14** | Câu trả lời AI soạn sẵn/offline **không** được ghi tên model thật (ví dụ `gemini-…`). Dùng `model: "offline-template"` và nhãn "Offline example" | Xem `explainQuery` |
| **R15** | Slope luôn hiển thị **theo thập kỷ** đúng như `slope_per_decade`; **không** chia 10 để ra "/năm". Nhãn đơn vị: `` `${units} per decade` `` | Tìm `/ 10`, `/year` |

---

## 3. Quy ước chung

| Mục | Quy ước |
|---|---|
| Base URL | `${VITE_API_BASE_URL}/api/v1` |
| Định dạng | JSON, UTF-8, tên trường `snake_case` |
| Thời gian | Theo tháng: chuỗi `"YYYY-MM"` (ví dụ `"2001-01"`). Thời điểm: ISO 8601 UTC |
| Toạ độ | Kinh độ trước, vĩ độ sau (chuẩn GeoJSON). `bbox = [west, south, east, north]` |
| Số thiếu | `null` (không dùng `NaN`, `-9999`) |
| Slope | Luôn theo **đơn vị / thập kỷ** (`slope_per_decade`) |
| Mức tin cậy | `ci_level = 0.95`, `alpha = 0.05` (mặc định) |
| Lưới phân tích | **1° × 1°**, tâm ô ở `x.5` (ví dụ `105.5, 10.5`) |
| Kiểu TypeScript | Sinh tự động từ OpenAPI: `npx openapi-typescript $VITE_API_BASE_URL/openapi.json -o src/api/schema.d.ts` |

### 3.1 Kiểu dùng chung

```ts
type MonthString = string;              // "YYYY-MM"
type BBox = [number, number, number, number]; // [west, south, east, north]

type RegionRef =
  | { type: "preset"; id: string }                       // vùng có sẵn từ /regions
  | { type: "bbox"; bbox: BBox }                         // khung người dùng vẽ
  | { type: "geojson"; geometry: object };               // tạm nhận (khớp frontend hiện tại):
  //   geometry.type "Point"/"point"     → ô 1° chứa điểm: [floor(lon), floor(lat), floor(lon)+1, floor(lat)+1]
  //   geometry.type "Polygon"/"polygon" → khung bao của polygon (chưa cắt đúng hình)
  //   Cả hai đều có câu giải thích trong warnings[]. Kiểu khác → 422 VALIDATION_ERROR.

type Direction = "increasing" | "decreasing" | "no_trend";

type TrendMethod = "seasonal_mk";          // P0 chỉ có một phương pháp

interface DataSource {
  product: string;        // ví dụ "GPM_3IMERGM"
  version: string;        // ví dụ "07"
  provider: string;       // ví dụ "NASA GES DISC"
  url: string;            // trang dataset
  citation?: string;
}

interface Quality {
  n_months: number;           // số tháng có dữ liệu
  missing_months: number;
  coverage_fraction: number;  // 0–1, trung bình tỉ lệ ô có dữ liệu hợp lệ trong vùng
  sufficient: boolean;        // ≥ 10 năm có dữ liệu VÀ ≥ 70% số tháng có dữ liệu (backend quyết định)
}
```

---

## 4. Endpoints

> Ký hiệu: 🟢 đồng bộ (trả kết quả ngay) · 🟡 có thể trả `202` + job (mục 4.8).
> Vì dữ liệu đã tính sẵn thành cube, ở P0 mọi endpoint dự kiến trả **`200` ngay**. Frontend vẫn phải xử lý được `202`.

### 4.1 `GET /health` 🟢
```json
{ "status": "ok", "version": "0.2.0", "available_variables": ["imerg_precip", "gldas_soil_moisture_0_10cm"] }
```

> **Trạng thái backend (13/11/2026, nhánh `backend`):** đã có `/health`, `/variables`, `/regions`, `/series`, `/trends`, `/trends/grid`, `/compare`, `/explain` (bản template, chưa có LLM, `model = "template-v1 (no language model)"`), `/jobs/{id}` (luôn 404 vì mọi endpoint trả ngay). **Chưa có:** `/reports`. Response `/trends` có thêm `start`, `end`.

### 4.2 `GET /variables` 🟢
Danh sách biến người dùng chọn được. Backend có thể trả **nhiều hơn 2 biến**; chỉ cho chọn biến có `available = true`.
```json
{
  "variables": [
    {
      "id": "imerg_precip",
      "name": "Precipitation",
      "category": "water",
      "description_simple": "How much rain falls each month.",
      "description_technical": "GPM IMERG Final Run monthly precipitation, averaged onto a 1° grid.",
      "units": "mm/month",
      "display_units": "mm/month",
      "temporal_resolution": "monthly",
      "spatial_resolution_deg": 1.0,
      "native_resolution_deg": 0.1,
      "coverage": { "start": "2001-01", "end": "2025-12" },
      "available": true,
      "source": {
        "product": "GPM_3IMERGM", "version": "07",
        "provider": "NASA GES DISC",
        "url": "https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGM_07/summary"
      }
    },
    {
      "id": "gldas_soil_moisture_0_10cm",
      "name": "Soil moisture (0–10 cm)",
      "category": "water",
      "description_simple": "How wet the top layer of soil is.",
      "description_technical": "GLDAS Noah land surface model, volumetric soil moisture 0–10 cm, averaged onto a 1° grid.",
      "units": "m3/m3",
      "display_units": "m³/m³",
      "temporal_resolution": "monthly",
      "spatial_resolution_deg": 1.0,
      "native_resolution_deg": 0.25,
      "coverage": { "start": "2001-01", "end": "2025-12" },
      "available": true,
      "source": { "product": "GLDAS_NOAH025_M", "version": "2.1", "provider": "NASA GES DISC", "url": "https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_M_2.1/summary" }
    }
  ]
}
```
- `coverage` là khoảng thời gian **thật của cube**; giá trị trên chỉ là ví dụ.
- `spatial_resolution_deg` = cỡ ô của cube backend đang dùng, **đọc từ cube**; `native_resolution_deg` = độ phân giải gốc của sản phẩm NASA, chỉ để hiển thị thông tin.
- `extent` = `[W, S, E, N]` vùng có dữ liệu. **Từ 13/11/2026 đội tập trung vùng Mekong**: backend dùng cube lưới gốc khung `[94, 8, 110, 35]` (2001–2024) → IMERG `spatial_resolution_deg = 0.1`, GLDAS `0.25`. Vùng demo đổi thành `mekong_region` (cùng khung này); `mekong_delta` vẫn còn, không còn là demo. Vùng ngoài `extent` → `404 NO_DATA`; vùng lấn một phần → chạy được, kèm `warnings`.

**Frontend phải:** hiển thị `description_simple` cho người mới; giới hạn date picker trong `coverage`; dùng `display_units` khi hiển thị; ẩn hoặc làm mờ biến `available = false`.

### 4.3 `GET /regions` 🟢
Vùng có sẵn (dùng cho demo và nút "thử ngay").
```json
{
  "regions": [
    {
      "id": "mekong_delta",
      "name": "Mekong Delta, Vietnam",
      "bbox": [104.4, 8.5, 106.9, 11.1],
      "is_demo": true
    },
    {
      "id": "northern_vietnam",
      "name": "Northern Vietnam",
      "bbox": [104.5, 20.1, 107.25, 22.25],
      "is_demo": false
    }
  ],
  "limits": { "max_bbox_area_deg2": 2500, "min_cells": 1, "cell_size_deg": 1.0 }
}
```
Backend hiện trả 4 vùng: `mekong_delta` (demo), `central_highlands`, `hanoi` (vùng mẫu của pipeline) và `northern_vietnam`.

`limits.cell_size_deg` = cỡ ô **lớn nhất** trong các cube đang có (dùng để cảnh báo sớm vùng quá nhỏ). Cỡ ô chính xác của từng biến xem `spatial_resolution_deg` ở `/variables`.

**Frontend phải:** lấy bbox vùng có sẵn từ đây (không hardcode); chặn vẽ khung có diện tích `> max_bbox_area_deg2`; nên chặn vùng nằm hẳn ngoài `extent` của biến đang chọn. Vùng quá nhỏ (không chứa tâm ô nào) backend trả `REGION_TOO_SMALL`. Không còn giới hạn "chỉ Đông Nam Á": cube phủ **toàn cầu**.

### 4.4 `POST /series` 🟡
Chuỗi thời gian trung bình theo vùng (trung bình có trọng số cos vĩ độ trên lưới 1°).

Request:
```json
{
  "variable_id": "imerg_precip",
  "region": { "type": "preset", "id": "mekong_delta" },
  "start": "2001-01",
  "end": "2025-12"
}
```
Response `200`:
```json
{
  "variable_id": "imerg_precip",
  "region": { "type": "preset", "id": "mekong_delta", "name": "Mekong Delta, Vietnam", "bbox": [104.4, 8.5, 106.9, 11.1] },
  "units": "mm/month",
  "points": [
    { "t": "2001-01", "value": 12.4, "anomaly": -3.1, "valid_fraction": 1.0 },
    { "t": "2001-02", "value": null, "anomaly": null, "valid_fraction": 0.0 }
  ],
  "climatology": [15.5, 8.2, 20.1, 60.3, 180.2, 210.4, 230.0, 240.7, 280.3, 250.1, 140.6, 45.2],
  "quality": { "n_months": 299, "missing_months": 1, "coverage_fraction": 0.98, "sufficient": true },
  "source": { "product": "GPM_3IMERGM", "version": "07", "provider": "NASA GES DISC", "url": "…" },
  "warnings": []
}
```
**Frontend phải:** vẽ chuỗi **theo tháng** từ `points`; tuỳ chọn bật/tắt `anomaly`; để khoảng trống (không nối đường) ở điểm `null`; `climatology` có đúng 12 phần tử (tháng 1→12).

### 4.5 `POST /trends` 🟡
Phân tích xu hướng cho **một vùng**.

Request:
```json
{
  "variable_id": "imerg_precip",
  "region": { "type": "preset", "id": "mekong_delta" },
  "start": "2001-01",
  "end": "2025-12",
  "method": "seasonal_mk",
  "alpha": 0.05
}
```
Response `200`:
```json
{
  "trend_id": "tr_8f2c1a",
  "variable_id": "imerg_precip",
  "region": { "type": "preset", "id": "mekong_delta", "name": "Mekong Delta, Vietnam", "bbox": [104.4, 8.5, 106.9, 11.1] },
  "units": "mm/month",
  "method": "seasonal_mk",
  "slope_method": "sen_seasonal",
  "slope_per_decade": 4.2,
  "slope_ci": [1.1, 7.5],
  "ci_method": "ols_anomaly",
  "ci_level": 0.95,
  "p_value": 0.012,
  "p_value_autocorr_adjusted": 0.031,
  "z": 2.51,
  "tau": null,
  "alpha": 0.05,
  "significant": true,
  "direction": "increasing",
  "n": 299,
  "autocorrelation_adjusted": false,
  "trend_line": [ { "t": "2001-01", "value": 140.2 }, { "t": "2025-12", "value": 150.7 } ],
  "quality": { "n_months": 299, "missing_months": 1, "coverage_fraction": 0.98, "sufficient": true },
  "plain_summary": "Rainfall in the Mekong Delta increased by about 4.2 mm/month per decade (2001–2025). This trend is statistically significant (p = 0.012).",
  "source": { "product": "GPM_3IMERGM", "version": "07", "provider": "NASA GES DISC", "url": "…" },
  "warnings": []
}
```
**Ý nghĩa các trường thống kê:**
| Trường | Nguồn trong pipeline |
|---|---|
| `slope_per_decade` | Sen's slope của Seasonal Mann-Kendall |
| `p_value`, `z` | Seasonal Mann-Kendall |
| `significant` | `p_value < alpha` **và** `quality.sufficient` |
| `p_value_autocorr_adjusted` | Hamed-Rao MK trên anomaly (hiệu chỉnh tự tương quan): hiển thị ở lớp chuyên sâu |
| `slope_ci`, `ci_method = "ols_anomaly"` | CI 95% của slope OLS trên anomaly |
| `tau` | Có thể `null` |

**Quy tắc hiển thị:**
- `quality.sufficient = false` → `significant`, `p_value`, `slope_ci` có thể là `null`. Hiển thị "Not enough data to test significance", **vẫn** vẽ chuỗi thời gian.
- `trend_line` có thể chỉ có 2 điểm (đầu, cuối) → vẽ đường thẳng nối 2 điểm.
- Hiển thị `slope_ci` dạng khoảng (ví dụ "4.2 [1.1 – 7.5]"), ghi chú nhỏ "CI from linear fit on anomalies".
- **Lưu `trend_id`** để dùng cho `/explain` và `/reports`.

### 4.6 `GET /trends/grid` 🟢 *(đã chốt: JSON danh sách ô, không dùng vector tiles)*
Dữ liệu cho **heatmap xu hướng** trên bản đồ, **tính sẵn** từ cube 1°.

Query: `?variable_id=imerg_precip&start=2001-01&end=2025-12&bbox=102,8,110,24`
- `bbox` tuỳ chọn; bỏ trống = toàn cầu (có thể vài chục nghìn ô → nên gửi bbox theo khung nhìn).
- FDR (Benjamini-Hochberg) được tính trên **toàn bộ lưới** của biến, rồi mới cắt theo `bbox`.

Response `200`:
```json
{
  "variable_id": "imerg_precip",
  "units": "mm/month",
  "cell_size_deg": 1.0,
  "fdr_method": "benjamini_hochberg",
  "alpha": 0.05,
  "value_range": { "min_slope": -12.3, "max_slope": 15.8 },
  "cells": [
    { "lon": 105.5, "lat": 10.5, "slope_per_decade": 4.8, "p_value": 0.004, "q_value": 0.03, "significant_fdr": true, "valid": true },
    { "lon": 106.5, "lat": 10.5, "slope_per_decade": null, "p_value": null, "q_value": null, "significant_fdr": null, "valid": false }
  ],
  "precomputed": true,
  "warnings": []
}
```
**Frontend phải:** đọc `cell_size_deg` từ response (không hardcode); `lon/lat` là **tâm ô**, ô trải từ `lon − cell_size_deg/2` đến `lon + cell_size_deg/2`; ô `valid=false` tô màu "no data"; ô có `significant_fdr=false` tô nhạt hoặc gạch chéo (xem mục 6); thang màu đối xứng quanh 0 dùng `value_range`.

### 4.7 `POST /compare` 🟡
So sánh xu hướng **hai vùng** (Contradiction hunter).

Request:
```json
{
  "variable_id": "imerg_precip",
  "region_a": { "type": "preset", "id": "mekong_delta" },
  "region_b": { "type": "bbox", "bbox": [105.0, 20.0, 107.0, 22.0] },
  "start": "2001-01",
  "end": "2025-12",
  "method": "seasonal_mk",
  "alpha": 0.05
}
```
Response `200`:
```json
{
  "compare_id": "cp_3b9e",
  "a": { "...": "giống response /trends" },
  "b": { "...": "giống response /trends" },
  "difference": {
    "slope_diff_per_decade": 7.9,
    "ci": [2.0, 13.8],
    "p_value": 0.009,
    "significant": true,
    "test": "mk_sen_on_anomaly_difference_block_bootstrap_ci"
  },
  "is_contradiction": true,
  "verdict": "opposite_significant",
  "plain_summary": "Rainfall is increasing in region A but decreasing in region B, and the difference is statistically significant.",
  "warnings": []
}
```
- `difference`: Hamed-Rao MK + Sen trên chuỗi hiệu anomaly A − B; CI bằng bootstrap khối 12 tháng.
- `difference.significant` = `p_value < alpha` **và** CI không chứa 0.
- `verdict` ∈ `"opposite_significant"` · `"opposite_not_significant"` · `"same_direction"` · `"insufficient_data"`.
- `is_contradiction = true` chỉ khi hai vùng **ngược chiều** **và** `difference.significant = true`.

**Frontend phải:** chỉ dán nhãn "Contradiction found" khi `is_contradiction = true`; hiển thị cả 2 chuỗi thời gian (gọi `/series` cho từng vùng) trên cùng biểu đồ hoặc 2 biểu đồ cạnh nhau; không tự kết luận từ dấu slope.

### 4.8 Job bất đồng bộ (áp dụng cho các endpoint 🟡)
Nếu dữ liệu chưa có trong cache, backend có thể trả `202`:
```json
{ "job_id": "job_51ac", "status": "queued", "status_url": "/api/v1/jobs/job_51ac" }
```
`GET /jobs/{job_id}`:
```json
{ "job_id": "job_51ac", "status": "running", "progress": 0.4, "result": null, "error": null }
```
`status` ∈ `"queued"` · `"running"` · `"done"` · `"error"`. Khi `done`, `result` chứa đúng body của response `200` tương ứng.

**Frontend phải:** poll mỗi 2 giây, tối đa 3 phút; hiển thị `progress`; cho phép huỷ; xử lý được **cả** `200` lẫn `202` từ cùng một endpoint.

### 4.9 `POST /explain` 🟢 (AI Earth detective)
Request:
```json
{
  "question": "Is it getting drier in the Mekong Delta?",
  "context": {
    "trend_ids": ["tr_8f2c1a"],
    "variable_id": "imerg_precip",
    "region": { "type": "preset", "id": "mekong_delta" },
    "period": "2001-01/2025-12"
  },
  "history": [ { "role": "user", "content": "…" }, { "role": "assistant", "content": "…" } ]
}
```
- Mọi trường trong `context` đều **tuỳ chọn**. Ưu tiên gửi `trend_ids` (số liệu đã tính); các trường còn lại giúp AI hiểu người dùng đang xem gì.
- `period` dạng `"YYYY-MM/YYYY-MM"`.
- Trả lời **một lần**, không stream.

Response `200`:
```json
{
  "answer": "Based on NASA GPM IMERG data (2001–2025), rainfall in the Mekong Delta has not decreased; it increased by about 4.2 mm/month per decade (p = 0.012). Soil moisture …",
  "cited_numbers": [
    { "label": "Rainfall trend", "value": 4.2, "units": "mm/month per decade", "source_field": "trends.tr_8f2c1a.slope_per_decade" }
  ],
  "actions": [
    { "type": "run_trend", "params": { "variable_id": "gldas_soil_moisture_0_10cm", "region": { "type": "preset", "id": "mekong_delta" }, "start": "2001-01", "end": "2025-12" } }
  ],
  "disclaimer": "AI-generated explanation based on the statistics above. Possible causes are suggestions, not proven findings.",
  "model": "<tên model backend dùng>",
  "warnings": []
}
```
`actions[].type` ∈ `"run_trend"` · `"run_series"` · `"run_compare"` · `"show_grid"`; `params` đúng body/query của endpoint tương ứng.

**Frontend phải:** hiển thị `cited_numbers` cạnh câu trả lời; biến `actions` thành nút bấm (ví dụ "Run this analysis") → gọi endpoint tương ứng; luôn hiển thị `disclaimer`; gắn nhãn rõ "AI-generated"; tuân thủ R14 khi offline.

### 4.10 `POST /reports` 🟡 và `GET /reports/{report_id}`
Request:
```json
{ "trend_ids": ["tr_8f2c1a"], "compare_ids": [], "format": "md" }
```
`format` ∈ `"md"` · `"html"` · `"pdf"` (P0–P1 chỉ chắc chắn có `md`; `pdf` là P2). Response `200`/`202` → khi xong:
```json
{ "report_id": "rp_77", "status": "done", "download_url": "/api/v1/reports/rp_77/download", "expires_at": "2026-11-16T00:00:00Z" }
```

---

## 4.11 Lỗi (mọi endpoint)

Mọi lỗi trả về cùng một dạng:
```json
{ "error": { "code": "REGION_TOO_LARGE", "message": "Region area is 3200 deg²; the limit is 2500 deg².", "details": {}, "retryable": false } }
```

| HTTP | `code` | Ý nghĩa | Frontend làm gì |
|---|---|---|---|
| 422 | `VALIDATION_ERROR` | Request sai định dạng (kể cả gửi `geojson` ở P0) | Hiện lỗi cạnh trường nhập; là bug frontend nếu xảy ra |
| 400 | `REGION_TOO_LARGE` | Vùng vượt `max_bbox_area_deg2` | Nhắc người dùng thu nhỏ vùng |
| 400 | `REGION_TOO_SMALL` | Vùng không chứa tâm ô lưới nào (cỡ ô trong `details.cell_size_deg`) | Nhắc người dùng mở rộng vùng |
| 400 | `INVALID_TIME_RANGE` | Ngoài `coverage` hoặc `start > end` | Sửa date picker |
| 404 | `NOT_FOUND` | Sai `variable_id`, `region.id`, `trend_id`, `job_id` | Tải lại danh sách |
| 404 | `NO_DATA` | Vùng không có dữ liệu (ví dụ toàn biển với biến đất) | Gợi ý chọn vùng khác |
| 503 | `DATA_NOT_READY` | Biến có trong danh sách nhưng cube chưa có (`available = false`) | Báo "data not available yet", chọn biến khác |
| 200 + `quality.sufficient=false` |: | Có dữ liệu nhưng không đủ để kiểm định | Vẫn hiện chuỗi, ghi "not enough data" |
| 429 | `RATE_LIMITED` | Gọi quá nhiều | Chờ rồi thử lại |
| 502 | `UPSTREAM_ERROR` | LLM lỗi | Thông báo, nút thử lại (`retryable=true`) |
| 504 | `UPSTREAM_TIMEOUT` | LLM quá chậm | Như trên |
| 500 | `INTERNAL_ERROR` | Lỗi backend | Thông báo chung, báo Hưng |
|: | `NETWORK_ERROR` | **Chỉ frontend tự tạo**: không kết nối được backend / timeout phía client | Thông báo lỗi kết nối, app không trắng trang, **không** thay bằng dữ liệu giả (R13) |

---

## 5. Ma trận tính năng ↔ endpoint (checklist cho agent)

| Tính năng (UI) | Endpoint | Ưu tiên | Kiểm tra riêng |
|---|---|---|---|
| Chọn biến | `GET /variables` | P0 | Danh sách lấy từ API, không hardcode; mô tả dễ hiểu; date picker theo `coverage`; ẩn `available=false` |
| Chọn vùng có sẵn / nút demo | `GET /regions` | P0 | bbox lấy từ API; có ít nhất 1 vùng `is_demo` chạy được bằng 1 cú bấm |
| Vẽ khung trên bản đồ |: (tạo `RegionRef` bbox) | P0 | Thứ tự `[west, south, east, north]`; chặn `< min_side_deg` và `> max_bbox_area_deg2`; điểm → bbox 1° |
| Biểu đồ chuỗi thời gian | `POST /series` | P0 | Theo **tháng**; khoảng trống ở điểm `null`; bật/tắt anomaly; đơn vị từ API |
| Kết quả xu hướng | `POST /trends` | P0 | Slope/**thập kỷ** + CI + p-value + `plain_summary`; xử lý `sufficient=false`; lưu `trend_id` |
| Heatmap xu hướng | `GET /trends/grid` | P0 | Dùng `significant_fdr`; ô `valid=false` = no data; `cell_size_deg` từ API; thang màu đối xứng |
| So sánh 2 vùng | `POST /compare` | P1 | Nhãn contradiction chỉ khi `is_contradiction=true`; không tự tính |
| AI chat | `POST /explain` | P1 | `cited_numbers`, `disclaimer`, nút từ `actions`; R14 |
| Xuất báo cáo | `POST /reports` | P2 | Xử lý job, link tải hết hạn |
| Trạng thái chờ | `GET /jobs/{id}` | P0 | Poll, progress, huỷ, timeout 3 phút |

---

## 6. Quy ước hiển thị (đề xuất: Phú quyết định cuối)

| Trạng thái | Màu gợi ý | Ghi chú |
|---|---|---|
| Tăng, significant | **Cam** đậm | Đội chốt 13/11/2026: tăng = cam |
| Giảm, significant | **Xanh dương** đậm | Đội chốt 13/11/2026: giảm = xanh |
| Không significant | Cùng màu nhưng nhạt + gạch chéo | **Không** dùng màu xám giống "no data" |
| Không có dữ liệu | **Xám** đặc, trung tính | Có chú thích "No data" |
| Không đủ dữ liệu để kiểm định | Viền nét đứt | Kèm tooltip giải thích |
| Dữ liệu giả (demo offline) | Banner vàng "Simulated data" | Bắt buộc theo R13 |

- Dùng bảng màu **thân thiện người mù màu** (tránh cặp đỏ–xanh lá).
- Ý nghĩa "tăng là tốt hay xấu" phụ thuộc biến (ví dụ nhiệt độ tăng ≠ mưa tăng) → để trung tính, không dùng đỏ = xấu.

---

## 7. Cách agent kiểm tra thực tế

1. **Khi backend chưa sẵn sàng:** dùng các ví dụ JSON trong file này làm **mock** (ví dụ MSW: Mock Service Worker) **ở tầng mạng**, không viết mock trong lớp gọi API. Mỗi endpoint cần mock cả `200`, `202 → done`, và ít nhất 2 mã lỗi.
2. **Khi backend chạy được** (mặc định `http://localhost:8000`):
   - Mở `http://localhost:8000/docs` (Swagger UI) để xem hợp đồng thật.
   - Sinh lại kiểu TS từ `/openapi.json` (mục 3) và chạy `tsc --noEmit`. Lỗi kiểu = lệch hợp đồng.
   - Chạy luồng demo: chọn `mekong_delta` → `imerg_precip` → 2001-01 đến 2025-12 → xem series, trend, heatmap.
3. **Kiểm tra các ca biên:**
   - Vùng toàn biển với biến độ ẩm đất → `NO_DATA`.
   - Khoảng thời gian 3 năm → `sufficient=false`.
   - Khung quá lớn → `REGION_TOO_LARGE`; khung không chứa tâm ô 1° nào → `REGION_TOO_SMALL`.
   - Backend tắt → thông báo lỗi kết nối, app không trắng trang, **không** hiện số liệu giả (R13).
4. **Quét quy tắc R1–R15** ở mục 2.

---

## 8. Mẫu báo cáo của agent

```markdown
# Báo cáo kiểm tra Frontend ↔ Backend: <ngày giờ>

## Tóm tắt
- Tính năng đạt (UI dùng dữ liệu API thật): X/10 · Quy tắc đạt: Y/15
- Kiểm tra với: mock | backend thật (<URL>, version <x>)

## Theo tính năng
| Tính năng | Endpoint | Request đúng | Đọc response đúng | UI dùng dữ liệu API | 4 trạng thái UI | Kết quả | Ghi chú |
|---|---|---|---|---|---|---|---|

## Vi phạm quy tắc
| Quy tắc | File:dòng | Mô tả | Đề xuất sửa |
|---|---|---|---|

## Lệch hợp đồng (frontend ≠ file này / OpenAPI)
| Endpoint | Trường | Frontend dùng | Hợp đồng | Bên nào cần sửa |
|---|---|---|---|---|

## Câu hỏi cho Hưng
- …
```

---

## 9. Câu hỏi mở

### Đã chốt ở v0.2
| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Heatmap: endpoint JSON hay vector tiles? | **`GET /trends/grid` trả JSON** danh sách ô, có tham số `bbox` |
| 2 | Giới hạn kích thước vùng? | Cạnh **≥ 1°**, diện tích **≤ 2500 deg²** |
| 3 | Ngưỡng `sufficient`? | **≥ 10 năm có dữ liệu và ≥ 70% số tháng** (theo pipeline; Đăng kiểm tra lại) |
| 4 | `/explain` stream hay không? | **Trả một lần**, không stream |
| 5 | Ai đổi đơn vị IMERG? | **Backend/pipeline**: trả sẵn `mm/month` |

### Còn mở
6. CORS: dev dùng `http://localhost:5173`; domain deploy là gì? (Hưng chốt khi chọn host)
7. Danh sách biến demo cuối cùng: chỉ 2 biến P0 hay mở thêm (`tair_land`, `t2m`, `ndvi`…) khi cube sẵn sàng? (Long xác nhận cube nào có)
8. Khoảng `coverage` thật của từng cube (Long cung cấp).

---

## Ghi chú
- File này viết với sự hỗ trợ của AI (Claude): ghi nhận trong phần khai báo sử dụng SI của bài nộp.
- Không ghi API key, token, link riêng tư vào file này.
