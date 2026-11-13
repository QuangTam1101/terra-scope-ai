# Báo cáo kiểm tra Frontend ↔ Backend: 13/11/2026

> Người kiểm tra: Hưng (backend), với hỗ trợ của AI (Claude).
> Đối tượng: nhánh `UI` (commit `3e5bf5c`), so với [FRONTEND_BACKEND_CONTRACT.md](FRONTEND_BACKEND_CONTRACT.md) v0.1.
> Cách kiểm tra: đọc code tĩnh (`src/lib/api.ts`, `src/lib/types.ts`, các component). Chưa chạy với backend thật vì backend chưa có.

## Tóm tắt
- **Lớp kiểu và hàm gọi API thấp (`fetchVariables`, `fetchSeries`, `fetchTrends`, `fetchTrendsGrid`, `fetchCompare`, `fetchExplain`, `fetchReports`, job polling, xử lý lỗi) viết đúng contract.**
- **Nhưng giao diện gần như không dùng các hàm đó.** Các màn hình gọi lớp "high-level" (`runAnalysis`, `getSeries`, `compareRegions`, `generateReportMetadata`): lớp này chủ yếu sinh **dữ liệu giả** từ `mockData.ts`, kể cả khi backend chạy.
- Vì vậy kết luận "10/10 tính năng, 12/12 quy tắc" trong `docs/API_CONTRACT_AUDIT.md` chỉ đúng ở mức *có hàm*, chưa đúng ở mức *UI dùng dữ liệu thật*.
- Ước tính thực tế: **Tính năng nối API thật: 1/10** (chỉ AI chat khi có backend) · **Quy tắc đạt: 7/12**.

## Theo tính năng
| Tính năng | Endpoint | Request đúng | Đọc response đúng | UI đang dùng gì | Kết quả |
|---|---|---|---|---|---|
| Chọn biến | `GET /variables` | ✅ (`fetchVariables`) | ✅ | `getVariables()` → hằng số `VARIABLE_META` trong code | ❌ chưa nối |
| Vùng có sẵn / demo | `GET /regions` | ✅ (`fetchRegions`) | ✅ | `getRegions()` → hằng số `REGION_META` | ❌ chưa nối |
| Vẽ khung |: | ⚠️ bbox đúng thứ tự; nhưng có thêm `point` và `polygon` |: | `GeographicSelection` | ⚠️ |
| Chuỗi thời gian | `POST /series` | ✅ | ✅ | `getSeries()` → `generateSeries()` giả, **theo năm**, không có `null`, không có anomaly | ❌ chưa nối |
| Kết quả xu hướng | `POST /trends` | ✅ | ⚠️ | `runAnalysis()` gọi `/trends` nhưng **bỏ phần lớn kết quả** (xem lỗi B1–B3) | ⚠️ một phần |
| Heatmap | `GET /trends/grid` | ✅ (`fetchTrendsGrid`) | ✅ | **Không được gọi**; lưới luôn là `generateGrid()` giả | ❌ chưa nối |
| So sánh 2 vùng | `POST /compare` | ✅ (`fetchCompare`) | ✅ | `compareRegions()` tự tính trung bình slope từ lưới giả, tự kết luận contradiction | ❌ chưa nối |
| AI chat | `POST /explain` | ✅ | ✅ cited_numbers, disclaimer, actions | Gọi thật nếu có `VITE_API_BASE_URL`; lỗi thì rơi về câu trả lời soạn sẵn | ⚠️ (lỗi B5) |
| Xuất báo cáo | `POST /reports` | ✅ (`fetchReports`) | ✅ | `generateReportMetadata()` dựng báo cáo tại chỗ từ dữ liệu giả | ❌ chưa nối |
| Trạng thái chờ | `GET /jobs/{id}` | ✅ poll 2s, tối đa 3 phút | ✅ | Có trong `fetchClient` | ⚠️ chưa có progress & nút huỷ |

## Lỗi quan trọng (cần sửa trước demo)
| # | File:dòng | Mô tả | Đề xuất |
|---|---|---|---|
| B1 | `src/lib/api.ts:532` | Có backend thật nhưng lưới bản đồ vẫn là `generateGrid()` giả → bản đồ hiện số liệu bịa cạnh kết quả thật | Gọi `fetchTrendsGrid` và vẽ từ `cells` |
| B2 | `src/lib/api.ts:547` | `significantCellsPercent: trendRes.significant ? 78 : 22`: **con số bịa** | Lấy từ `/trends/grid` (tỉ lệ ô `significant_fdr=true`) hoặc bỏ |
| B3 | `src/lib/api.ts:546` | Đổi `slope_per_decade / 10` sang "/năm"; toàn bộ UI dùng đơn vị `.../year` | Contract quy định hiển thị **theo thập kỷ**; dùng `slope_per_decade` và `units` từ API |
| B4 | `src/lib/api.ts:340, 388, 554, 833` | Mọi lỗi backend bị **nuốt im lặng** và thay bằng dữ liệu giả → giám khảo không phân biệt được số thật/giả; vi phạm R9 | Khi có `VITE_API_BASE_URL`: hiện lỗi theo `error.code`, không fallback. Chỉ dùng mock khi chạy chế độ demo rõ ràng |
| B5 | `src/lib/api.ts:882, 924, 960, 995…` | Câu trả lời AI soạn sẵn ghi `model: 'gemini-1.5-flash (FastAPI backend)'` dù **không gọi model nào** | Đổi thành `model: 'offline-template'` và hiện nhãn "Offline example" |
| B6 | `src/lib/api.ts:765` | Tự kết luận "contradiction" chỉ dựa vào dấu slope (vi phạm tinh thần R2, R5; contract 4.7 yêu cầu dùng `is_contradiction`) | Dùng `fetchCompare` → `is_contradiction`, `verdict`, `difference` |
| B7 | `src/lib/api.ts:670` | Biểu đồ dùng chuỗi **năm**, không phải tháng; không có khoảng trống `null`, không có bật/tắt anomaly, không có `climatology` | Dùng `fetchSeries` → `points[]` |

## Vi phạm quy tắc
| Quy tắc | Kết quả | File:dòng | Ghi chú |
|---|---|---|---|
| R1 không có key | ✅ |: | Không thấy key/token trong `src/` |
| R2 không tự tính thống kê | ⚠️ | `api.ts:626–644, 701–766` | Tự tính slope trung bình vùng, `dominantTrend`, contradiction từ lưới giả |
| R3 đơn vị từ API | ❌ | `types.ts:50–191`; `App.tsx:118,136`; `TerraMap.tsx:1098–1116`; `ComparisonView.tsx`; `TrendChart.tsx` | Đơn vị hardcode trong `VARIABLE_META` (`mm/month/year`, `m³/m³/year`) |
| R4 heatmap dùng `significant_fdr` | ⚠️ | `heatmapRenderer.ts:145` | Có ý đúng nhưng fallback `?? m.significant` (p < 0.05 chưa hiệu chỉnh); dữ liệu chưa đến từ API |
| R5 significance một vùng từ backend | ⚠️ | `App.tsx:183`, `api.ts:733–738` | Có chỗ tự so `p` với 0.05, lấy trung bình p-value các ô (không hợp lệ về thống kê) |
| R6 hiện `warnings` | ✅ | `App.tsx:508`, `ComparisonView.tsx:356` | |
| R7 AI có `cited_numbers` + `disclaimer` | ✅ | `AIEarthDetective.tsx:225, 308` | |
| R8 giao diện tiếng Anh | ✅ |: | Chỉ có tiếng Việt trong comment |
| R9 timeout + xử lý theo `error.code` | ⚠️ | `api.ts:223` | Client đúng (15s), nhưng lớp trên nuốt lỗi (B4) |
| R10 base URL từ env | ✅ | `api.ts:62` | |
| R11 `no_trend` là kết quả hợp lệ | ✅ | `App.tsx:113, 183` | Câu chữ trình bày tốt |
| R12 demo 1 cú bấm | ✅ | `App.tsx:356`, `OnboardingGuide.tsx:94` | |

## Lệch hợp đồng / lệch dữ liệu thật
| Mục | Frontend dùng | Contract | Dữ liệu thật (`pipeline/api.py`) | Bên sửa |
|---|---|---|---|---|
| Lưới heatmap | 0.1° / 0.25° | `cell_size_deg: 0.1` (ví dụ) | **1°** | Phú (đọc `cell_size_deg` từ API) + Hưng (sửa ví dụ contract) |
| Đơn vị độ ẩm đất | `m³/m³` (UI), `kg/m2` (mock contract) | `kg/m2` | `m3/m3` | Hưng sửa contract → `m3/m3` |
| Đơn vị slope | `/year` | `/decade` | `/decade` | Phú |
| Bbox Mekong Delta | `[104.65, 9.2, 106.85, 11.45]` | `[104.4, 8.5, 106.9, 11.1]` |: | Phú lấy từ `/regions` |
| Vùng dạng `point`, `polygon` | Có | Chỉ `preset`, `bbox`, `geojson` | Pipeline chỉ nhận **bbox** | Thống nhất: P0 chỉ `preset` + `bbox` |
| Vùng phủ dữ liệu | Chỉ Đông Nam Á (`isBoundsWithinCoverage`) |: | Cube **toàn cầu** | Phú bỏ giới hạn khi nối API thật |
| Biến có sẵn | 2 biến | 2 biến | 10 biến (`precip`, `soil_moisture`, `tair_land`, `t2m`, `ndvi`…) | Có thể mở rộng sau P0 |
| `/explain` context | Gửi thêm `variable_id`, `period` | Chỉ `trend_ids` |: | Hưng chấp nhận thêm vào contract |
| Hiển thị `trend_id` | Không lưu `trend_id` để gửi `/explain`, `/reports` | Cần |: | Phú |

## Câu hỏi cho Hưng / việc Hưng cần làm
1. Cập nhật contract lên v0.2: `cell_size_deg = 1`, độ ẩm đất `m3/m3`, P0 chỉ hỗ trợ `preset` + `bbox`, nhận thêm `variable_id`/`period` trong `/explain`.
2. Backend chạy xong `/variables`, `/regions` sớm nhất có thể để Phú bỏ hằng số `VARIABLE_META`, `REGION_META`.
3. Thống nhất với Phú: khi có backend thì **không** fallback sang dữ liệu giả; nếu cần chế độ offline thì có công tắc "Demo mode" hiển thị rõ.

## Đề xuất thứ tự sửa cho Phú
1. B4 + B5 (tách bạch thật/giả): quan trọng nhất cho tiêu chí Validity.
2. Nối `/variables`, `/regions`, `/trends`, `/series` (P0).
3. Nối `/trends/grid` cho heatmap, đọc `cell_size_deg`, `value_range`, `significant_fdr`, `valid`.
4. Đổi toàn bộ đơn vị sang `slope_per_decade` + `units` từ API.
5. Nối `/compare` (P1), `/reports` (P2).
