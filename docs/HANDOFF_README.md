# Bàn giao frontend: Terra-scope AI: giao diện v4 Cute

> **Người nhận:** Phú (frontend) và agent code của Phú. **Người giao:** Hưng (backend). Ngày 13/11/2026.
> Viết với sự hỗ trợ của AI (Claude): ghi nhận trong phần khai báo SI khi nộp bài.

## 0. Đọc theo thứ tự này

| # | File | Dùng để |
|---|---|---|
| 1 | `README.md` (file này) | Bức tranh chung, token thiết kế, việc cần làm, thứ tự ưu tiên |
| 2 | `FRONTEND_BACKEND_CONTRACT.md` | **Nguồn sự thật về API** (request/response, mã lỗi, quy tắc R1–R15). Khác nhau → contract thắng |
| 3 | `WIREFRAMES_SPEC.md` | Từng màn hình: thành phần → endpoint/trường API, trạng thái, tương tác |
| 4 | `design_source/project/*.dc.html` | **Mã nguồn mockup v4**: đọc để lấy đúng màu, font, bo góc, khoảng cách, câu chữ. Đây là file mockup (định dạng canvas), **không copy nguyên vào app**: chuyển sang React + Tailwind |
| 5 | `UI_CONTRACT_REVIEW.md` | Các lỗi đang có trong code nhánh `UI` cần sửa |

Xem trực quan:
- Canvas https://claude.ai/artifact/FZ8CQLGpToVoHeUK3eY8T9 → trang **"v4: Cute"** (hàng trên: phone, hàng dưới: desktop; bấm Play trên Map/Trend/Hunt). **Đây là bản tham chiếu chính** (mã nguồn nằm trong `design_source`).
- File Figma: https://www.figma.com/design/IEWkci5P3UQ57PjGo7gc4o: cùng phong cách, có component + variables. Khác canvas đôi chút về mã màu (xem mục 2); nếu lệch, **lấy canvas / `design_source` làm chuẩn**.

**Đội đã chốt:** phong cách **v4 Cute** (bỏ v3), **bản đồ toàn cầu**, thứ tự chọn **Biến → Dataset → Thời gian → Vị trí**, màu xu hướng **tăng = cam, giảm = xanh, không có dữ liệu = xám**.

---

## 1. Màn hình cần làm

| Route | Phone mockup | Desktop mockup | Wireframe | Ưu tiên |
|---|---|---|---|---|
| `/` Home | `CuteHome` | `CuteDeskHome` |: | P1 |
| `/explore` Bản đồ | `CuteMap` | `CuteDeskMap` | WF01, WF04 | **P0** |
| `/trend` Kết quả | `CuteTrend` | `CuteDeskTrend` | WF02, WF03, WF05 | **P0** |
| `/hunt` So sánh / mâu thuẫn | `CuteHunt` | `CuteDeskHunt` | WF06 | P1 |
| `/detective` AI | `CuteDetective` | `CuteDeskDetective` | WF07 | P1 |
| `/report` Báo cáo | `CuteReport` | `CuteDeskReport` | WF08 | P2 |

Điều hướng: **desktop** = sidebar trái bo tròn (Explore · Trends · Hunt · Detective · Report); **phone** (< 760 px) = thanh tab dạng pill nổi ở đáy, mục đang chọn tô `#ede6fb`.

**Mốc P0 (phải chạy end-to-end với backend thật):** chọn biến + dataset + thời gian + vị trí → bản đồ (Values | Trend) → kết quả (dấu kết luận, slope, CI, p, biểu đồ chuỗi tháng + đường Theil-Sen + dải CI).

---

## 2. Token thiết kế (lấy từ mockup canvas)

### Màu
| Token | Hex | Dùng cho |
|---|---|---|
| `bg` | `#fbf6ec` | Nền trang (kem) |
| `surface` | `#ffffff` | Thẻ |
| `ink` | `#2b2540` | Chữ chính, nút chính, chip đang chọn |
| `muted` | `#4e4860` | Chữ phụ |
| `muted-2` | `#5e5872` | Chữ rất phụ, footer |
| `line` | `#ece3d3` | Viền chip |
| `track` | `#efe7d8` | Nền segmented control, thanh tiến trình |
| `hover` | `#f6f1e8` | Hover mục nav |
| `lavender` | `#ede6fb` | Tab/nav đang chọn, nút phụ |
| `lavender-2` | `#f3eefe` | Chip thống kê, pill đề xuất |
| `peach` / `peach-ink` | `#fde2d4` / `#7a3b22` | Nhãn "Preliminary · not yet validated" |
| `coral` | `#e8735a` | Ghim bản đồ đang chọn |
| `quality` | `#7fd1c2` | Thanh chất lượng dữ liệu |
| **Xu hướng tăng** | `#c4621a` (đậm) · `#f2a65a` (vừa) · `#fbe0c4` (nhạt = không significant) | **Cam = tăng** |
| **Xu hướng giảm** | `#2f6fb3` (đậm) · `#7fb2e5` (vừa) · `#cfe1f4` (nhạt = không significant) | **Xanh = giảm** |
| Dải CI | `#f5b98a` (tăng) · `#9cc6ef` (giảm), opacity 0.45 | Quanh đường Theil-Sen |
| **Không có dữ liệu** | `#a7a3b0` | Xám đặc, không sọc |
| Thang Values (tuần tự) | `#fff4c2 → #c8ecc0 → #7fd1c2 → #4aa6c4 → #5a6fb8 → #4b3a8c` | Heatmap giá trị |
| Badge "significant" | nền `#d8ecff`, chữ `#1d4f86` | |
| Badge "not proven yet" | nền `#fff1c9`, chữ `#6b4e00` | |
| Badge "not enough data" | nền `#f1eef5`, chữ `#4e4860`, viền chấm `#8d86a0` | |
| Cảnh báo (vd. datasets disagree) | nền `#fff1c9`, chữ `#5a4100` | |

"Không significant sau FDR" = màu nhạt cùng hướng + **sọc chéo** (`repeating-linear-gradient(135deg, rgba(255,255,255,.85) 0 1px, transparent 1px 3px)`).

### Chữ
- Tiêu đề: **Fredoka** 500/600/700 (fallback "Baloo 2", Nunito). Chữ thường: **Nunito** 500–800. Số: **Nunito** 700–800 với `font-variant-numeric: tabular-nums`.
- **Cấm:** font monospace cho số (DM Mono, IBM Plex Mono, `monospace`): nhìn "giống AI". Không hiện tên trường API thô (`slope_per_decade`…) trên giao diện.
- **Cấm tuyệt đối dấu gạch dài "—"** trong mọi chữ trên UI (đội chốt 13/11/2026). Dùng "·", dấu phẩy, dấu hai chấm hoặc ngoặc. Ví dụ: "Preliminary · not yet validated".
- Ô số trong bảng: `white-space: nowrap`; viết p-value là "<0.001" để không bị xuống dòng.
- Google Fonts: `family=Fredoka:wght@500;600;700&family=Nunito:wght@500;600;700;800`.
- Cỡ tham khảo: H1 desktop 32 px, số slope lớn 52 px (desktop) / 38 px (phone), thân 13–15 px, nhãn nhỏ 10–12 px.

### Hình khối
- Thẻ: `border-radius 24–28px`, bóng `0 8px 22px rgba(90,70,40,.09), 0 1px 0 rgba(90,70,40,.06)`.
- Nút / chip / segmented: bo `999px`, **cao tối thiểu 44 px**. Nút chính nền `ink` chữ trắng; nút phụ nền `lavender`.
- Focus: `outline: 3px solid #2b2540; outline-offset: 2px` trên mọi nút/link/input.
- Chip đang chọn: nền + viền `ink`, chữ trắng. Segmented: nền `track`, mục chọn nền trắng + bóng nhẹ.

### Linh vật "Terra"
SVG nội tuyến trong `CuteHome.dc.html` (Trái Đất tròn, mũ thám tử nâu, kính lúp). Tách thành component `<Terra size={…} />`, có `aria-label` khi mang nghĩa, `aria-hidden` khi trang trí. Dùng ở Home, trạng thái rỗng, avatar Detective. **Không** ghép linh vật với logo NASA.

---

## 3. Dữ liệu và API (tóm tắt: chi tiết ở contract)

Backend: `${VITE_API_BASE_URL}/api/v1`. Chạy backend trên máy:
```bash
cd terra-scope-ai/backend
uvicorn app.main:app --reload --port 8000
```
Frontend: `.env.local` → `VITE_API_BASE_URL=http://localhost:8000`. Swagger: http://localhost:8000/docs.

| Bước / vùng UI | Endpoint | Trường chính |
|---|---|---|
| Bước 1 Biến, Bước 2 Dataset | `GET /variables` | Nhóm theo `parameter` → các `dataset_name`; `id` = **`variable_id`** gửi cho mọi endpoint; `display_units`, `coverage`, `available`, `extent` |
| Bước 4 Vị trí (preset) | `GET /regions` | `regions[]` (`global` = Whole world là demo), `limits.max_bbox_area_deg2 = 64800` |
| Bản đồ: lớp Values | `GET /values/grid?variable_id&start&end&bbox&month` | `cells[lon,lat,value,valid_fraction]`, `value_range{min,max,p02,p98}` (tô màu theo p02–p98) |
| Bản đồ: lớp Trend | `GET /trends/grid?variable_id&start&end&bbox` | `cells[lon,lat,slope_per_decade,q_value,significant_fdr,valid]`, `value_range` |
| Biểu đồ chuỗi tháng | `POST /series` | `points[t,value,anomaly,valid_fraction]`, `climatology`, `quality`, `warnings` |
| Kết quả xu hướng | `POST /trends` | `slope_per_decade`, `slope_ci`, `p_value`, `p_value_autocorr_adjusted`, `significant`, `direction`, `quality.sufficient`, `trend_line`, `plain_summary`, `trend_id`, `warnings` |
| Hunt (so sánh A/B) | `POST /compare` | `a`, `b`, `difference{slope_diff_per_decade,ci,p_value,significant}`, `verdict`, `is_contradiction` |
| Detective | `POST /explain` | `answer`, `cited_numbers[]`, `actions[]`, `disclaimer`, `model` (hiện là template, chưa LLM) |
| Report | `POST /reports` | **chưa có** → nút Export disabled kèm lý do |

**Bản đồ:** lưới 1° toàn cầu. Luôn gửi `bbox` theo khung đang nhìn (cả thế giới không bbox ≈ 8 MB JSON). Gợi ý vẽ: deck.gl `GridCellLayer`/`PolygonLayer` hoặc canvas trên MapLibre; ô vuông = `cell_size_deg` từ API (đừng hardcode).

**Dấu kết luận** (đúng chữ trên mockup):
| Điều kiện | Nhãn |
|---|---|
| `quality.sufficient = false` | "Not enough data" (không hiện slope như kết luận) |
| `significant = true` | "Clear trend (significant)" |
| `significant = false` | "Not proven yet": kèm câu "a longer record may help" (không phải lỗi) |

Đường Theil-Sen **nét liền khi significant, nét đứt khi không**; màu theo hướng (cam tăng / xanh giảm). Luôn có chữ *"Estimated past trend, not a forecast"* và ghi chú *"CI from a linear fit on anomalies"* (CI là OLS, slope là Sen).

---

## 4. Phần nào trên mockup là giả, phần nào là thật

| Trên mockup | Trong app phải lấy từ |
|---|---|
| Số slope, CI, p của Whole world / Mekong Delta / Wisconsin / Sahel | API thật (`/trends`): mockup dùng đúng số backend đã chạy |
| Hình dạng lục địa, chấm màu trên bản đồ | Bản đồ nền thật (MapLibre) + `/trends/grid`, `/values/grid` |
| Đường cong biểu đồ | `/series` (`points`): mockup chỉ vẽ minh hoạ |
| Giá trị trung bình trên ghim ("illustr.") | `/values/grid` |
| 2 cặp "illustrative" trong Hunt | Chưa có API tự tìm → xem mục 6 |
| Câu trả lời AI | `/explain` |
| Nhãn "Preliminary · not yet validated", "Design mockup · AI-assisted" | Giữ "Preliminary" tới khi Đăng kiểm chứng xong; **bỏ** dòng "Design mockup" trong app |

---

## 5. Sửa code hiện có trên nhánh `UI`

Nhánh `UI` đã có client API đúng contract (`src/lib/api.ts`, `src/lib/types.ts`) nhưng màn hình vẫn dùng dữ liệu giả. Chi tiết: `UI_CONTRACT_REVIEW.md` (cùng thư mục này). Phải sửa khi làm v4:
- **B4/R13:** khi có `VITE_API_BASE_URL`, lỗi phải hiện là lỗi: bỏ các `catch` trả dữ liệu giả.
- **B5/R14:** câu trả lời offline không được ghi tên model.
- **B2:** bỏ con số bịa `significantCellsPercent: 78/22`.
- **B3/R15:** slope theo **thập kỷ**, không chia 10.
- **B1/B7:** bản đồ và biểu đồ lấy từ `/trends/grid`, `/values/grid`, `/series`: bỏ `generateGrid`/`generateSeries`.
- Cập nhật `types.ts`: thêm `parameter`, `parameter_name`, `dataset_name`, `extent`, `native_resolution_deg`, `available` cho `/variables`; thêm kiểu `ValueGridResponse`; `start`, `end`, `ci_method`, `p_value_autocorr_adjusted`, `z` cho `/trends`; `compare_id`, `stable_halves` cho `/compare`.
- Sinh kiểu tự động: `npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts`.

---

## 6. Chưa có ở backend (đừng chặn việc, hiện trạng thái phù hợp)

| Tính năng | Tạm thời |
|---|---|
| Hunt **tự tìm** cặp vùng trái ngược (`GET /contradictions`: Hưng sẽ thêm) | Chỉ làm so sánh A/B thủ công qua `/compare`; danh sách tự tìm ẩn hoặc "Coming soon" |
| Tìm địa danh (search) | Chỉ preset + bấm bản đồ + vẽ khung |
| `/reports` | Export disabled + lý do |
| LLM thật cho `/explain` | Dùng bản template; hiện nhãn offline đúng R14 |

---

## 7. Checklist nghiệm thu mỗi màn

- [ ] Khớp mockup v4: màu, font, bo góc, khoảng cách (so với `design_source`), ở cả 1440 px và 390 px.
- [ ] Mọi số và đơn vị từ API (R2, R3); slope "per decade" (R15); hiện mọi `warnings[]` (R6).
- [ ] Bản đồ Trend tô theo `significant_fdr`; cam = tăng, xanh = giảm, sọc = không significant, xám = không dữ liệu.
- [ ] Đủ 4 trạng thái: loading (skeleton) · thành công · rỗng / không đủ dữ liệu · lỗi (toast theo `error.code`).
- [ ] Không dữ liệu giả khi có backend (R13); không key trong frontend (R1).
- [ ] Bàn phím: mọi nút là `<button>`/`<a>`, focus ring, `aria-label` cho nút chỉ có icon, `aria-pressed` cho toggle; chạm ≥ 44 px; tương phản ≥ 4.5:1.
- [ ] Chữ trên UI tiếng Anh (R8).

---

## 8. Câu lệnh gợi ý cho agent của Phú

> Read `handoff_v4_cute/README.md`, then `FRONTEND_BACKEND_CONTRACT.md`, `WIREFRAMES_SPEC.md` and `UI_CONTRACT_REVIEW.md` in the same folder. Use the files in `handoff_v4_cute/design_source/project/` as the visual reference for the v4 Cute style (colours, fonts, radii, spacing, copy): convert them to React + TypeScript + Tailwind components; do not copy the `.dc.html` format. Start with design tokens (Tailwind theme) and shared components (Button, Chip, Segmented, Card, VerdictBadge, StatChip, Legend, MapPin, TabBar, Sidebar, Terra mascot), then build `/explore` and `/trend` (P0) against the real backend at `VITE_API_BASE_URL`. Remove all mock-data fallbacks when the backend URL is set. After each screen run the checklist in section 7 of the README.
