# Terra-scope AI: Đặc tả wireframe cho frontend (bàn giao cho agent của Phú)

> **Nguồn:** trang **"Wireframes (detailed)"** trên canvas https://claude.ai/artifact/FZ8CQLGpToVoHeUK3eY8T9 (WF00–WF09), bản **toàn cầu**, ngày 13/11/2026.
> **Đi kèm:** [FRONTEND_BACKEND_CONTRACT.md](FRONTEND_BACKEND_CONTRACT.md) v0.2.1: khi file này và contract khác nhau → **contract (và `/openapi.json` của backend đang chạy) thắng**.
> **Phong cách hình ảnh** (màu, font, bo góc) KHÔNG nằm trong wireframe: đội đã chốt **v4: Cute** (trang "v4: Cute" trên canvas, và file Figma https://www.figma.com/design/IEWkci5P3UQ57PjGo7gc4o). **Bỏ v3.** Wireframe chỉ quy định **bố cục, thành phần, trạng thái, dữ liệu**.
> File này viết với sự hỗ trợ của AI (Claude): ghi nhận trong phần khai báo SI.

---

## 0. Cách agent dùng file này

1. Đọc mục 1 (khung chung) và mục 2 (luồng) trước.
2. Làm theo thứ tự màn hình WF01 → WF09. Mỗi màn có: **bố cục**, **bảng thành phần** (số = số đỏ trên wireframe), **dữ liệu/API**, **trạng thái**, **tương tác**.
3. Mọi số liệu phải lấy từ API. **Không tự tính thống kê, không dữ liệu giả khi đã có `VITE_API_BASE_URL`** (quy tắc R2, R13 trong contract).
4. Xong mỗi màn, chạy checklist ở mục 4.
5. Nếu có ảnh PNG của wireframe (mục 5) thì mở ảnh tương ứng để đối chiếu bố cục.

---

## 1. Khung chung (desktop 1440 × 900)

| Vùng | Kích thước | Ghi chú |
|---|---|---|
| Top bar | cao 56 | Logo · nhãn case · tab chế độ **Investigate / Compare / Detective / Report** · nút **Share case** |
| Workspace (bản đồ) | cao 696, full-bleed | Bản đồ thế giới equirectangular −180…180, −90…90 (tỉ lệ 2:1), ô 1° (`cell_size_deg` từ API) |
| Timeline dock | cao 120 | Chuỗi tháng + đường xu hướng + cửa sổ thời gian |
| Status bar | cao 28 | Nguồn dữ liệu NASA · "Preliminary · not yet validated" · "Design mockup · AI-assisted" (bỏ dòng cuối trong app thật) |

Các panel **nổi trên bản đồ**:
| Panel | Vị trí / rộng | Nội dung |
|---|---|---|
| Tool rail | x 24, rộng 48 | Select 1° cell · Draw box (bấm 2 góc) · Pan · Layers & legend · Reset view (cả thế giới). Nút 44×44, tooltip + `aria-label` |
| Set-up panel | x 84, rộng 300 | 4 bước cố định: **1 Biến môi trường → 2 Dataset → 3 Thời gian → 4 Vị trí** + nút **Run analysis**. Sau khi chạy: thu gọn thành tóm tắt 4 dòng, mỗi dòng có "Edit" |
| Layer switch | giữa, trên cùng | Segmented **Values \| Trend** (`aria-pressed`) |
| Legend | góc dưới trái | Đổi theo lớp; bật/tắt gạch chéo FDR, lưới kinh vĩ |
| Zoom + overview | góc dưới phải | 4 mức zoom; bản đồ nhỏ có khung vùng đang xem |
| Results drawer | x 1016, rộng 400 | Kết quả / So sánh / Chat / Báo cáo tuỳ tab; thu gọn được |

Lưới: 12 cột, margin 24, gutter 24. Mobile: xem WF09.

**Màu xu hướng (bắt buộc, an toàn cho người mù màu: đội chốt 13/11/2026):** **cam = tăng**, **xanh dương = giảm**, đối xứng quanh 0 theo `value_range`; **nhạt + gạch chéo (cùng màu) = không significant sau FDR**; **xám đặc = không có dữ liệu** (khác hẳn "không significant"). Legend: "↓ decreasing" ở đầu xanh, "increasing ↑" ở đầu cam. Lớp Values dùng thang **tuần tự** riêng, cắt ở `p02`–`p98`.

**Dấu kết luận** (từ `/trends`):
| Điều kiện | Nhãn |
|---|---|
| `quality.sufficient = false` | **INSUFFICIENT EVIDENCE**: không hiện slope như kết luận |
| `significant = true` | **SIGNIFICANT TREND** |
| `significant = false` | **NOT PROVEN YET**: trình bày như kết quả hợp lệ, không phải lỗi (R11) |

Slope luôn hiển thị **"per decade"** (R15). Cạnh biểu đồ luôn có: *"Trend line = estimated past trend, not a forecast."*

---

## 2. Luồng người dùng (WF00)

```
Mở app ─▶ WF01 (chưa có case) ─▶ chọn 4 bước ─▶ Run ─▶ WF02 (đang tải) ─▶ WF03 (kết quả)
                                     │                                      │
          bấm ô bản đồ ─▶ WF04 (inspector) ─▶ "Analyse this cell" ──────────┘
          lỗi / thiếu dữ liệu ─▶ WF05
          tab Compare ─▶ WF06     tab Detective ─▶ WF07 ─(action)─▶ WF02     tab Report ─▶ WF08
```

Vùng demo mặc định: **Whole world · Air temperature · MERRA-2 · 2001–2024**.

---

## 3. Từng màn hình

### WF01 · Set up: trống (lần mở đầu)
| # | Thành phần | Dữ liệu / API | Trạng thái & tương tác |
|---|---|---|---|
| 1 | Tab chế độ |: | default/hover/active/focus; Tab + Enter/Space; `aria-pressed` |
| 2 | Nhãn case |: | "New case" + lựa chọn hiện tại (variable · dataset · period · location) |
| 3 | Share case |: | disabled tới khi có kết quả |
| 4 | Tool rail |: | xem mục 1 |
| 5 | **Bước 1: Biến môi trường** | `GET /variables` → `parameter`, `parameter_name`, `units`, `coverage`, `available` | Nhóm theo `parameter`: Precipitation, Soil moisture, Air temperature, Evapotranspiration |
| 6 | Biến MODIS | `available = false` | Hiện nhưng disabled, tooltip "not available yet" |
| 7 | **Bước 2: Dataset** | các item `/variables` cùng `parameter` → `dataset_name`, `display_units` | Air temperature có 2: **MERRA-2 (land and sea)** và **GLDAS Noah (land only)**. Chọn dataset = chọn **`variable_id`** gửi cho mọi endpoint |
| 8 | **Bước 3: Thời gian** | `coverage.start/end` (2001-01…2024-12) | Start > End → lỗi inline `INVALID_TIME_RANGE`, Run disabled |
| 9 | **Bước 4: Vị trí** | `GET /regions` → `regions[]`, `limits` | Tìm địa danh (UI, chưa có API) · preset (Whole world, Mekong region, Mekong Delta, Central Highlands, Hanoi, Northern Vietnam) · bấm bản đồ (ô 1° → gửi `geojson` Point hoặc `bbox` 1°) · Draw box. `max_bbox_area_deg2 = 64800` (cả thế giới hợp lệ) |
| 10 | Run analysis | `POST /series` + `POST /trends` song song | disabled khi chưa chọn vị trí |
| 11 | Layer switch |: | Values \| Trend |
| 12 | Bản đồ thế giới | `GET /trends/grid` (lớp Trend), `GET /values/grid` (lớp Values) theo `variable_id` + kỳ | Gửi `bbox` theo khung nhìn (bản đồ cả thế giới không bbox ≈ 8 MB JSON) |
| 13 | Zoom + overview |: | |
| 14 | Legend | `value_range` | Diverging ± (Trend) hoặc min/p02/p98/max (Values) |
| 15 | Chip "Featured case: Mekong" | preset `mekong_region` | Chọn vùng + bật lớp sông |
| 16 | Drawer |: | Trống: "No case open yet" |
| 17 | Timeline dock |: | Trống tới khi `/series` trả về |

### WF02 · Đang tải (sau khi bấm Run)
| # | Thành phần | Ghi chú |
|---|---|---|
| 1 | Run | "Running…" + spinner, disabled |
| 2 | Tiến trình | Text `aria-live="polite"`: "Testing air temperature · MERRA-2 · Whole world…" |
| 3 | Skeleton | Giữ đúng bố cục kết quả (stamp, slope, bảng số, chart) |
| 4 | Cancel | `AbortController` huỷ cả 2 request, trả về trạng thái trước |
| 5 | Khung vùng | Vẽ ngay khi chọn |
| 6 | Timeline skeleton | Tới khi `/series` trả `points[]` |
| 7 | Request | `POST /series {variable_id, region, start, end}` và `POST /trends {variable_id, region, start, end, method:"seasonal_mk", alpha:0.05}`. Timeout 30 s → toast `NETWORK_ERROR` + Retry; `503 DATA_NOT_READY` → thông báo trong drawer + Retry |
| 8 | Đổi lựa chọn khi đang tải | Huỷ và chạy lại |

### WF03 · Kết quả (lớp Trend)
| # | Thành phần | Trường API |
|---|---|---|
| 1 | Nhãn case | variable · dataset · period · location; mã case từ `trend_id` |
| 2 | Tóm tắt set-up | 4 dòng + "Edit" + "Run again" |
| 3 | Bản đồ xu hướng | `/trends/grid` → `cells[lon,lat,slope_per_decade,q_value,significant_fdr,valid]`, `cell_size_deg`, `value_range`. Cam = tăng, xanh = giảm, xám = không có dữ liệu |
| 4 | Layer switch | |
| 5 | Legend | ± đơn vị/thập kỷ + số ô significant sau FDR |
| 6 | Dấu kết luận | `significant`, `quality.sufficient` (bảng ở mục 1) |
| 7 | Slope lớn | `slope_per_decade` + `display_units` + "per decade" |
| 8 | Bảng thống kê | Sen's slope; 95% CI `slope_ci` (ghi chú nhỏ "CI from linear fit on anomalies": `ci_method = ols_anomaly`); Seasonal MK `p_value`; Hamed–Rao `p_value_autocorr_adjusted`; kết luận |
| 9 | Câu tóm tắt | `plain_summary` |
| 10 | Biểu đồ chuỗi thời gian | `/series` → `points[t,value,anomaly,valid_fraction]` (toggle Values \| Anomaly); đường Theil-Sen `trend_line`: **nét đứt khi không significant**. Nên thêm **dải CI** quanh đường xu hướng (thể hiện độ bất định) |
| 11 | Ghi chú | "Trend line = estimated past trend, not a forecast." |
| 12 | Chất lượng dữ liệu | `quality.n_months`, `missing_months`, `coverage_fraction`, `sufficient` |
| 13 | Hành động | Add to report (giữ `trend_id`), Ask the Detective (mở WF07 với `trend_id`) |
| 14 | Timeline dock | Chuỗi anomaly + `trend_line` + cửa sổ kỳ có tay kéo (bắt theo năm; ←/→ = ±1 năm); đổi cửa sổ → chạy lại |
| 15 | Đọc giá trị tháng | Bấm hoặc phím mũi tên: `value`, `anomaly`, `valid_fraction` |
|: | Cảnh báo | Hiện **mọi** `warnings[]` (R6) |

### WF04 · Lớp Values + inspector ô bản đồ
| # | Thành phần | Trường API |
|---|---|---|
| 1 | Layer switch = Values | |
| 2 | Legend tuần tự | `/values/grid` → `value_range{min,max,p02,p98}`; màu cắt ở p02–p98 |
| 3 | Lọc tháng | "All months" / "Only January…December" → `/values/grid?month=1..12` |
| 4 | Ô được chọn | Bấm bắt vào ô 1° dưới con trỏ; viền nổi bật |
| 5 | Popover inspector | `role="dialog"`, cạnh ô, tự lật gần mép; Esc / X đóng, trả focus về bản đồ |
| 6 | Tooltip hover | lon, lat, value |
| 7 | Toạ độ | lon, lat tâm ô, `cell_size_deg` |
| 8 | Giá trị | `value` + `valid_fraction` (từ `/values/grid`) |
| 9 | Xu hướng | `slope_per_decade` + `q_value` (từ `/trends/grid`) |
| 10 | Dấu | `significant_fdr` → SIGNIFICANT TREND / NOT PROVEN YET; `valid=false` → "No data" |
| 11 | "Analyse this cell" | Đặt vị trí = ô này → chạy (WF02) |
|: | Không gọi request mới | Đọc từ 2 lưới đã tải |

### WF05 · Không đủ dữ liệu + lỗi
| # | Thành phần | Ghi chú |
|---|---|---|
| 1 | Bước 3 = 2018–2024 | Gợi ý inline "7 years: testing needs at least 10" |
| 2 | INSUFFICIENT EVIDENCE | Khi `quality.sufficient=false` (< 10 năm hoặc < 70% tháng) |
| 3 | "Use 2001–2024" | Đặt lại toàn kỳ và chạy lại |
| 4 | Toast lỗi | `role="alert"`, từ `error{code,message}`; tự ẩn 8 s trừ `NETWORK_ERROR` (có Retry) |
| 5 | Thông báo tại ô | Ví dụ ô biển với dataset chỉ đất liền (GLDAS) → `NO_DATA` |
| 6 | Câu chữ theo mã lỗi | `NO_DATA` (dataset chỉ đất liền / kỳ trống) · `REGION_TOO_SMALL` (không chứa tâm ô nào) · `REGION_TOO_LARGE` (chỉ khi vượt cả thế giới) · `DATA_NOT_READY` (Retry) · `INVALID_TIME_RANGE` · `VALIDATION_ERROR` (bug frontend) · `NETWORK_ERROR` (Retry). **Không bao giờ thay lỗi bằng số giả (R13)** |

### WF06 · Compare (Contradiction hunter thủ công)
| # | Thành phần | Trường API |
|---|---|---|
| 1 | Tab Compare | Biến, dataset, kỳ lấy từ set-up |
| 2 | Area A / Area B | Preset từ `/regions` hoặc ô bản đồ |
| 3 | "Pick A/B on map" | Lần bấm bản đồ kế tiếp gán cho A hoặc B |
| 4 | Run comparison | disabled khi A = B. `POST /compare {variable_id, region_a, region_b, start, end}` |
| 5 | Thẻ A, B | `a`, `b`: `slope_per_decade`, `p_value`, `significant` |
| 6 | Thẻ hiệu số | `difference{slope_diff_per_decade, ci, p_value, significant}` |
| 7 | Kết luận | `verdict` ∈ `same_direction` / `opposite_not_significant` / `opposite_significant` / `insufficient_data`; chỉ ghi "Contradiction found" khi `is_contradiction = true` |
| 8 | Bảng quy tắc | Giải thích 3 kết luận |
| 9 | Bản đồ | A viền liền, B viền đứt, có chữ A/B |
| 10 | Timeline | **Cả 2 chuỗi trên cùng biểu đồ** (A liền, B đứt): gọi `/series` cho từng vùng |
| 11 | Set-up thu gọn | Nút "Set up" |
|: | Ví dụ thật | MERRA-2 nhiệt độ **Sahel vs Wisconsin** → `opposite_significant`, hiệu −0,51 °C/thập kỷ, CI [−1,03; −0,02], p = 0,0075 (sơ bộ) |

> **Chưa có trong wireframe: nên thêm (tính năng 3 "tự tìm"):** danh sách cặp vùng trái ngược do hệ thống tự tìm. Backend **chưa có endpoint** (pipeline có sẵn `find_contradictions`): Hưng sẽ thêm `GET /contradictions`; trước đó để ẩn hoặc ghi "coming soon".

### WF07 · AI Detective
| # | Thành phần | Trường API |
|---|---|---|
| 1 | Disclaimer luôn hiện | `disclaimer` |
| 2 | Câu hỏi người dùng | |
| 3 | Thẻ trả lời | Nhãn "AI-generated"; tên model chỉ khi online (R14) ← `model` |
| 4 | Nhãn bằng chứng | `cited_numbers[]` (label, value, units, source_field) |
| 5 | Nút hành động | `actions[]` (`type` run_trend / run_series / run_compare / show_grid, `params`) → chuyển tab + chạy |
| 6 | Trả lời offline | Viền đứt, "Offline · template answer, no AI model used" |
| 7 | Câu hỏi gợi ý | Bấm = gửi |
| 8 | Ô nhập + Send | `POST /explain {question, context{trend_ids, variable_id, region, period}, history}`; Enter gửi, Shift+Enter xuống dòng; lỗi → toast |

> Backend hiện là bản template (`model = "template-v1 (no language model)"`), chưa gọi LLM.

### WF08 · Report
| # | Thành phần | Ghi chú |
|---|---|---|
| 1 | Tab Report | |
| 2 | Checkbox "Include" | Bảng kết quả, biểu đồ, bản đồ, tóm tắt AI (có nhãn) |
| 3 | Xem trước | Từ các `trend_id` đã chạy trong phiên |
| 4 | Dòng kết quả | vị trí · biến · dataset · slope/thập kỷ · p · dấu |
| 5 | Nguồn + giới hạn | `dataset_name`, `source` từ `/variables`; giới hạn cố định: trend ≠ nguyên nhân; đường xu hướng là quá khứ, không dự báo; GLDAS chỉ đất liền, không mô phỏng tưới/ngập; không có biến độ mặn |
| 6 | Export PDF / Markdown | `POST /reports` (**chưa có**, P2) → disabled kèm lý do |
| 7 | Copy link | Khi có `/reports` |

### WF09 · Mobile (390 × 844), bottom sheet 3 mức
| # | Thành phần | Ghi chú |
|---|---|---|
| 1 | Top bar gọn | Logo, case, Share |
| 2 | Chip bước 1–4 | Mỗi chip mở picker dạng bottom sheet, đúng thứ tự |
| 3 | Bản đồ | Full width, Values \| Trend, pinch zoom, chạm = chọn ô 1° |
| 4 | Bottom sheet | Thu gọn (peek 120: dấu + slope) · Nửa (thống kê) · Đầy (top 72: chart + ghi chú "not a forecast", chất lượng, timeline). Kéo hoặc chạm tay nắm |
| 5 | Nút nổi "Run" | Khi lựa chọn thay đổi |
| 6 | Tab bar | Investigate / Compare / Detective / Report, cao 56 |

---

## 4. Checklist cho agent (mỗi màn hình)

- [ ] Mọi con số / đơn vị lấy từ API; không hardcode `mm/month`, `°C`, `m³/m³` (R3).
- [ ] Đủ 4 trạng thái: loading · thành công · rỗng/không đủ dữ liệu · lỗi.
- [ ] Bản đồ xu hướng tô theo `significant_fdr`, không theo `p_value < 0.05` (R4).
- [ ] Slope "per decade", không chia 10 (R15); có ghi chú "not a forecast".
- [ ] Hiện mọi `warnings[]` (R6).
- [ ] Không có API key trong frontend (R1); base URL từ `VITE_API_BASE_URL` (R10).
- [ ] Khi có backend: lỗi hiện là lỗi, **không** âm thầm thay dữ liệu giả (R13).
- [ ] Toàn bộ chữ trên UI tiếng Anh (R8).
- [ ] Bàn phím: mọi nút là `<button>`, có focus ring, `aria-label` cho nút chỉ có icon; mục tiêu chạm ≥ 44 px.
- [ ] Màu khác nhau cả về độ sáng (người mù màu).

---

## 5. Ảnh wireframe (cho agent đọc được hình)

Agent đọc ảnh tốt hơn đọc canvas. Xuất PNG từ canvas: mở canvas → trang **Wireframes (detailed)** → chọn từng khung → menu **Share › Export** (PNG): hoặc chụp màn hình từng khung. Đặt tên `WF01_Investigate_Empty.png` … và để trong `docs/wireframes/` của nhánh `UI`, cạnh file này.

## 6. Số liệu sơ bộ dùng để thử (chưa kiểm chứng)

| Vị trí | Biến · dataset | Sen slope / thập kỷ | 95% CI | MK p | Kết luận |
|---|---|---|---|---|---|
| Whole world | Air temp · MERRA-2 | +0,14 °C | [0,139; 0,197] | < 0,001 | Significant |
| Whole world | Precipitation · IMERG | +0,93 mm/tháng | [0,57; 1,29] | < 0,001 | Significant |
| Mekong Delta | Air temp · MERRA-2 | +0,28 °C | [0,19; 0,33] | < 0,001 | Significant |
| Mekong Delta | Precipitation · IMERG | +3,16 mm/tháng | [−1,93; 19,24] | 0,11 | Not proven yet |
| Wisconsin | Air temp · MERRA-2 | +0,22 °C | [−0,20; 0,50] | 0,20 | Not proven yet |
| Sahel | Air temp · MERRA-2 | −0,30 °C | [−0,43; −0,18] | < 0,001 | Significant (giảm) |
| Sahel | Air temp · GLDAS | +0,85 °C | [0,64; 0,94] | < 0,001 | Significant (tăng): **mâu thuẫn với MERRA-2, cần kiểm tra** |
