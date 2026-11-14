# SWOT (NASA/CNES, PO.DAAC) – độ cao mặt nước sông và hồ, lấy theo vùng khi cần

**Nguồn trên trang challenge:** "SWOT Mission – Information" (partner resources).
**Script:** `download/swot.py TÊN W S E N` (đăng nhập bằng `.env`; tìm granule qua CMR, tải zip shapefile từ PO.DAAC).

**Không tải sẵn toàn cầu**: riêng 2023–2024 đã ≥ 30 000 granule mỗi loại, ≥ 132 GB (sông) + ≥ 554 GB (hồ). **SWOT chỉ
có từ 04/2023** (vệ tinh phóng 12/2022), quá ngắn để tính xu hướng 2001–2024; dùng làm bối cảnh mực nước gần đây của
vùng đang xem. Một bbox cỡ hồ Tonlé Sap cắt qua ~350 granule mỗi loại.

```bash
.venv/bin/python download/swot.py tonle_sap 103.5 12.3 104.9 13.5
```

## File kết quả `data/raw/swot/<TÊN>/`

| File | Nội dung |
|---|---|
| `SWOT_L2_HR_RiverSP_reach_D_<TÊN>_2023-2024.parquet` | bảng (không có hình): một dòng = một đoạn sông (reach) × một lượt quét |
| `SWOT_L2_HR_RiverSP_reach_D_<TÊN>_reaches.parquet` | GeoParquet: hình (đường) của mỗi đoạn sông, một dòng mỗi `reach_id` |
| `SWOT_L2_HR_LakeSP_prior_D_<TÊN>_2023-2024.parquet` | GeoParquet: một dòng = một hồ × một lượt quét; hình là mặt nước quan sát được ở lượt đó |

Sản phẩm `SWOT_L2_HR_RiverSP_reach_D` và `SWOT_L2_HR_LakeSP_prior_D` (bản D), mọi granule cắt qua bbox từ 2023-01-01.
Giữ nguyên các cột của NASA, thêm cột `granule` (tên lượt quét). WGS 84 (EPSG:4326). File zip tải về `downloads/` rồi
bị xoá sau khi gộp.

## Đã xử lý gì (và vì sao)

- **Cắt vùng:** giữ đối tượng **giao** với bbox và giữ nguyên cả hình, nên vài đoạn sông/hồ ở mép thò ra ngoài bbox.
- **Bỏ lượt quét phát hành trùng:** NASA xử lý lại một số lượt (`…_PGD0_01` rồi `…_PGD0_02`, giờ bắt đầu trong tên có
  thể lệch 1 giây, giá trị trùng nhau); mỗi (chu kỳ, lượt quét, châu lục) chỉ giữ bản số đếm lớn nhất (`latest()`).
- **Hình đoạn sông lưu riêng một lần:** hình lấy từ CSDL tiên nghiệm SWORD, lặp y hệt ở mọi lượt quét và chiếm ~95 %
  dung lượng. Nối lại khi cần: `gpd.read_parquet(".._reaches.parquet").merge(bang, on="reach_id")`.
- **Hình hồ không tách**: đó là mặt nước quan sát được, đổi theo từng lượt, là dữ liệu thật.

## Cột quan trọng

| Cột | Nghĩa | Đơn vị |
|---|---|---|
| `reach_id` / `lake_id` | mã đoạn sông (SWORD) / mã hồ (PLD) | |
| `time_str` | thời điểm quan sát (UTC); `"no_data"` = không quan sát được | |
| `wse`, `wse_u` | độ cao mặt nước và sai số | m |
| `width` (sông), `slope` (sông) | bề rộng sông; độ dốc mặt nước | m; m/m |
| `area_total` (hồ) | diện tích mặt nước | km² |
| `reach_q` / `quality_f` | cờ chất lượng tổng hợp: 0 tốt, 1 nghi ngờ, 2 suy giảm, 3 xấu | |
| `river_name`, `lake_name` | tên (nhiều tên cách nhau bằng `;`; `"no_data"` nếu không có) | |
| `p_*` | thuộc tính tiên nghiệm từ SWORD/PLD (vị trí `p_lon`/`p_lat`, chiều dài, diện tích tham chiếu …) | |

## Cần biết trước khi dùng (đo trên lần tải vùng Mekong trước đây)

- **Giá trị fill:** cột số thực dùng `-1e12`, cột số nguyên dùng `-999`. Lọc `wse > -1e11`.
- **Sông:** RiverSP chứa mọi đoạn sông trong dải quét, kể cả đoạn không đo được (`time_str == "no_data"`, ~40 % dòng).
- **Chất lượng:** bản D gắn cờ "nghi ngờ" (1) cho phần lớn dữ liệu; thường dùng 0–1 và lọc thêm theo `wse_u`.
- **Không có lưu lượng:** các cột `dschg_*` đều là fill; chỉ hai cột cờ bit `dschg_q_b`, `dschg_gq_b` có giá trị.
- Tên có dấu bị thay bằng `?` (ví dụ `H? TR? AN`); nối bằng `lake_id`/`reach_id`, không bằng tên.
- **Giai đoạn hiệu chuẩn** (chu kỳ ≥ 400, 04–07/2023) dùng quỹ đạo lặp 1 ngày, khác quỹ đạo khoa học ~21 ngày về
  sau. Chu kỳ là phần tử thứ 6 khi tách tên granule theo `_`.
- Parquet lưu theo cột: chỉ đọc các cột cần (`columns=[...]`); cột `geometry` của file hồ chiếm phần lớn dung lượng.
