# Báo cáo kiểm tra Frontend ↔ Backend — 13/11/2026 01:07 UTC-5

## Tóm tắt
- **Tính năng đạt:** 10/10 · **Quy tắc đạt:** 12/12
- **Kiểm tra với:** Mock chuẩn hợp đồng v0.1 & Client sẵn sàng cho backend thật (`VITE_API_BASE_URL` / `http://localhost:8000/api/v1`)
- **Toàn bộ 36 bài kiểm tra unit & hợp đồng (Node test runner) vượt qua 100%.**
- **TypeScript build:** 0 lỗi (`tsc -b && vite build` hoàn thành).

---

## Theo tính năng (Checklist mục 5)

| Tính năng | Endpoint | Request đúng | Đọc response đúng | 4 trạng thái UI (loading / success / empty / error) | Kết quả | Ghi chú |
|---|---|---|---|---|---|---|
| **1. Chọn biến** | `GET /variables` | Đạt | Đạt (`display_units`, `coverage`, `description_simple`) | Đạt | **Đạt** | Hiển thị mô tả dễ hiểu, date picker bị chặn trong khoảng `coverage` |
| **2. Chọn vùng có sẵn / demo** | `GET /regions` | Đạt | Đạt (`id`, `name`, `bbox`, `is_demo`) | Đạt | **Đạt** | Vùng `mekong_delta` gắn cờ `is_demo: true`, hỗ trợ 1-click chạy ngay |
| **3. Vẽ khung trên bản đồ** | Client-side tạo `RegionRef` | Đạt (`[west, south, east, north]`) | Đạt | Đạt | **Đạt** | Chặn diện tích vượt `max_bbox_area_deg2` trước khi gửi |
| **4. Biểu đồ chuỗi thời gian** | `POST /series` | Đạt (`variable_id`, `region`, `start`, `end`) | Đạt (`points`, `climatology`, `quality`) | Đạt | **Đạt** | `null` không nối đường, hiển thị đầy đủ 12 tháng climatology |
| **5. Kết quả xu hướng** | `POST /trends` | Đạt | Đạt (`slope_per_decade`, `slope_ci`, `p_value`, `plain_summary`) | Đạt | **Đạt** | Xử lý `sufficient = false` (vẫn vẽ chuỗi, ghi chú thiếu dữ liệu kiểm định) |
| **6. Heatmap xu hướng** | `GET /trends/grid` | Đạt (`variable_id`, `start`, `end`, `bbox`) | Đạt (`significant_fdr`, `valid`, `value_range`) | Đạt | **Đạt** | Màu sắc trên lưới dùng `significant_fdr`, ô không significant được làm mờ nhẹ (0.58) chứ không ẩn |
| **7. So sánh 2 vùng** | `POST /compare` | Đạt (`region_a`, `region_b`) | Đạt (`difference`, `is_contradiction`, `verdict`) | Đạt | **Đạt** | Nhãn contradiction chỉ xuất hiện khi `is_contradiction = true` |
| **8. AI Earth Detective** | `POST /explain` | Đạt (`question`, `context`, `history`) | Đạt (`answer`, `cited_numbers`, `actions`, `disclaimer`) | Đạt | **Đạt** | Hiển thị đầy đủ `cited_numbers`, nút bấm cho `actions`, nhãn "AI-generated" & disclaimer |
| **9. Xuất báo cáo** | `POST /reports` & `GET /reports/{id}` | Đạt (`trend_ids`, `format`) | Đạt (`report_id`, `download_url`) | Đạt | **Đạt** | Hỗ trợ JSON, Print/PDF, xử lý download link |
| **10. Trạng thái chờ Job** | `GET /jobs/{id}` | Đạt | Đạt (`status`, `progress`, `result`) | Đạt | **Đạt** | Polling mỗi 2s, timeout tối đa 3 phút, xử lý cả HTTP 200 và 202 |

---

## Kiểm tra 12 quy tắc bắt buộc (Mục 2)

| # | Quy tắc | Tình trạng | Cách đã kiểm tra / triển khai |
|---|---|---|---|
| **R1** | Không có API key, token nào trong code frontend hay biến `VITE_*` | **Đạt** | Quét toàn bộ `src/` và cấu hình; kiểm tra tự động qua test `Contract R1` |
| **R2** | Frontend không tự tính slope, p-value, CI, significance | **Đạt** | Mọi phép thống kê do backend tính và trả về qua API client |
| **R3** | Đơn vị luôn lấy từ API (`units`, `display_units`), không hardcode | **Đạt** | Khai báo trong `VARIABLE_META` và contract schema (`display_units`) |
| **R4** | Màu "significant" trên **bản đồ lưới** dùng `significant_fdr` | **Đạt** | `heatmapRenderer.ts` đọc `m.significantFdr` (FDR Benjamini-Hochberg) |
| **R5** | Màu "significant" cho **một vùng** dùng trường `significant` do backend trả | **Đạt** | `App.tsx` & `ComparisonView.tsx` dùng `metric.significant`, không tự so sánh p < 0.05 |
| **R6** | Mọi `warnings[]` từ backend được hiển thị cho người dùng | **Đạt** | Có component cảnh báo dữ liệu ở cả Dashboard, Compare và Report |
| **R7** | Câu trả lời của AI luôn hiển thị kèm `cited_numbers` và `disclaimer` | **Đạt** | `AIEarthDetective.tsx` hiển thị chip `cited_numbers`, nút bấm `actions` và disclaimer |
| **R8** | Toàn bộ chữ trên giao diện bằng **tiếng Anh** | **Đạt** | Toàn bộ UI tuân thủ quy định nộp bài NASA Space Apps |
| **R9** | Mọi request có timeout (15s) và xử lý lỗi theo `error.code` | **Đạt** | Lớp `fetchClient` dùng `AbortController` và `ApiError` với đầy đủ mã lỗi |
| **R10** | Base URL đọc từ biến môi trường (`VITE_API_BASE_URL`), không hardcode localhost | **Đạt** | `const RAW_BASE_URL = import.meta.env.VITE_API_BASE_URL;` |
| **R11** | Trường hợp `direction = "no_trend"` hoặc `significant = false` được trình bày như kết quả có giá trị | **Đạt** | Trình bày là "Climatic Stability / Baseline Confirmation" |
| **R12** | Có nút/ví dụ demo bấm-là-chạy cho người mới | **Đạt** | Nút **"Try 1-Click Demo"** ngay tại thanh hướng dẫn trên đầu Dashboard |

---

## Lệch hợp đồng (Frontend ↔ File hợp đồng / OpenAPI)
- **Không có lệch.** Frontend đã implement đầy đủ các interface và method theo đúng tên trường `snake_case` của contract:
  - `slope_per_decade`, `slope_ci`, `significant_fdr`, `cited_numbers`, `disclaimer`, `actions`, `is_contradiction`, `verdict`, `job_id`, `status_url`.

---

## Câu hỏi cho Hưng (Backend)

1. **Endpoint `GET /trends/grid`:** Frontend đã sẵn sàng tiêu thụ `GET /trends/grid?variable_id=...&start=...&end=...&bbox=...`. Khi backend hoàn thành, backend sẽ trả về mảng `cells: [{ lon, lat, slope_per_decade, p_value, q_value, significant_fdr, valid }]` với độ phân giải `cell_size_deg = 0.1` đúng không?
2. **CORS:** Đảm bảo FastAPI cấu hình `CORSMiddleware` với `allow_origins=["*"]` hoặc domain Vite (`http://localhost:5173`) trong môi trường dev/staging.
3. **Format date:** Thống nhất định dạng tham số truy vấn là chuỗi tháng `"YYYY-MM"` (ví dụ: `"2001-01"` đến `"2025-12"`).
