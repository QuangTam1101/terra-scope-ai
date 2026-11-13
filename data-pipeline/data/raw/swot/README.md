# SWOT (NASA/CNES, PO.DAAC) – độ cao mặt nước sông và hồ, 2023–2024

**Nguồn trên trang challenge:** "SWOT Mission – Information" (partner resources).
**Script:** `download/swot.py` (đăng nhập bằng `.env`; tìm granule qua CMR, tải zip shapefile từ PO.DAAC).
**Dùng để làm gì:** mực nước và diện tích mặt nước gần đây của sông Mekong, Tonlé Sap, các hồ chứa. **SWOT chỉ có từ
04/2023** (vệ tinh phóng 12/2022), quá ngắn để tính xu hướng 2001–2024; dùng làm bối cảnh / kiểm chứng gần đây.

| File | Nội dung | Kích thước |
|---|---|---|
| `SWOT_L2_HR_RiverSP_reach_D_mekong_2023-2024.parquet` | bảng (không có hình): một dòng = một đoạn sông (reach) × một lượt quét | 1 092 017 dòng, 127 cột, 227 MB |
| `SWOT_L2_HR_RiverSP_reach_D_mekong_reaches.parquet` | GeoParquet: hình (đường) của mỗi đoạn sông, một dòng mỗi `reach_id` | 15 054 dòng, 60 MB |
| `SWOT_L2_HR_LakeSP_prior_D_mekong_2023-2024.parquet` | GeoParquet: một dòng = một hồ × một lượt quét; hình là mặt nước quan sát được ở lượt đó | 1 373 677 dòng, 53 cột, 6,0 GB |

Sản phẩm: `SWOT_L2_HR_RiverSP_reach_D` và `SWOT_L2_HR_LakeSP_prior_D` (bản D), các granule châu Á (`_AS_`) cắt qua bbox,
2023-04-06 → 2024-12-03 (granule mới nhất có trong CMR). Giữ nguyên các cột của NASA, thêm cột `granule` (tên lượt
quét). Hệ toạ độ WGS 84 (EPSG:4326).

## Đã xử lý gì (và vì sao)

- **Cắt vùng:** giữ đối tượng **giao** với bbox và giữ nguyên cả hình, nên vài đoạn sông/hồ ở mép thò ra ngoài bbox
  (toạ độ 93,6–110,9°E, 7,95–35,2°N).
- **Bỏ lượt quét phát hành trùng:** NASA xử lý lại một số lượt (`…_PGD0_01` rồi `…_PGD0_02`, giá trị giống nhau);
  mỗi (chu kỳ, lượt quét, châu lục) chỉ giữ bản số đếm lớn nhất. Bỏ 40/1051 granule sông và 60/1068 granule hồ.
  Sau đó không còn cặp (`reach_id`/`lake_id`, `time_str`) nào trùng.
- **Hình đoạn sông lưu riêng một lần:** hình đoạn sông lấy từ CSDL tiên nghiệm SWORD, lặp y hệt ở mọi lượt quét và
  chiếm ~95 % dung lượng (4,4 GB). Nối lại khi cần:
  `gpd.read_parquet(".._reaches.parquet").merge(bang, on="reach_id")`. 6/15 054 đoạn có hình hơi khác ở vài lượt;
  file giữ hình đầu tiên.
- **Hình hồ không tách**: đó là mặt nước quan sát được, đổi theo từng lượt, là dữ liệu thật.

## Đọc nhanh

Parquet lưu theo cột, nên chỉ đọc các cột cần (cột `geometry` chiếm 5,8/6,0 GB của file hồ):

```python
cols = ["lake_id", "lake_name", "time_str", "wse", "wse_u", "area_total", "quality_f", "p_lon", "p_lat"]
lakes = pd.read_parquet("SWOT_L2_HR_LakeSP_prior_D_mekong_2023-2024.parquet", columns=cols)   # ~0,1 s
rivers = pd.read_parquet("SWOT_L2_HR_RiverSP_reach_D_mekong_2023-2024.parquet",
                         columns=["reach_id", "river_name", "time_str", "wse", "wse_u", "width", "slope", "reach_q"])
```

## Cột quan trọng

| Cột | Nghĩa | Đơn vị |
|---|---|---|
| `reach_id` / `lake_id` | mã đoạn sông (SWORD) / mã hồ (PLD) | |
| `time_str` | thời điểm quan sát (UTC); `"no_data"` = không quan sát được | |
| `wse`, `wse_u` | độ cao mặt nước và sai số | m |
| `width` (sông) | bề rộng sông | m |
| `slope` (sông) | độ dốc mặt nước | m/m |
| `area_total` (hồ) | diện tích mặt nước | km² |
| `reach_q` / `quality_f` | cờ chất lượng tổng hợp: 0 tốt, 1 nghi ngờ, 2 suy giảm, 3 xấu | |
| `river_name`, `lake_name` | tên (nhiều tên cách nhau bằng `;`; `"no_data"` nếu không có tên) | |
| `p_*` | thuộc tính tiên nghiệm từ SWORD/PLD (vị trí `p_lon`/`p_lat`, chiều dài, diện tích tham chiếu …) | |

## Cần biết trước khi dùng

- **Giá trị fill:** cột số thực dùng `-1e12` (≈ −999 999 999 999), cột số nguyên dùng `-999`. Lọc `wse > -1e11`.
- **Sông:** chỉ 60 % dòng là quan sát thật (651 876 dòng). Các dòng còn lại là đoạn sông nằm trong dải quét nhưng
  không đo được (`time_str == "no_data"`). 12 452/15 054 đoạn có ít nhất một quan sát; trung vị 40 lần mỗi đoạn.
  208 đoạn mang tên Mekong (10 637 quan sát).
- **Chất lượng:** sông `reach_q` 0: 0,2 %, 1: 64 %, 2: 24 %, 3: 12 %; hồ `quality_f` 0: 9 %, 1: 76 %, 2: 9 %, 3: 6 %.
  Bản D gắn cờ "nghi ngờ" (1) cho phần lớn dữ liệu; thường dùng 0–1 và lọc thêm theo `wse_u`.
- **Không có lưu lượng:** mọi giá trị lưu lượng `dschg_*` của sông đều là fill; chỉ hai cột cờ bit `dschg_q_b`,
  `dschg_gq_b` có giá trị (ghi lý do không tính được lưu lượng).
- **Hồ:** 65 947 hồ, phần lớn rất nhỏ (diện tích trung vị 0,06 km²; 8 069 hồ có lúc > 1 km²). Tonlé Sap có 76 quan
  sát với tên `TONLE SAP;BOENG TONLE CHHMA;…`.
- Tên tiếng Việt bị thay dấu bằng `?` (ví dụ `H? TR? AN` = hồ Trị An); nối bằng `lake_id`, không bằng tên.
- **Giai đoạn hiệu chuẩn** (chu kỳ ≥ 400, 04–07/2023) dùng quỹ đạo lặp 1 ngày, khác quỹ đạo khoa học ~21 ngày về sau;
  chiếm 26 % quan sát sông. Chu kỳ là phần tử thứ 6 khi tách tên granule theo `_`.
