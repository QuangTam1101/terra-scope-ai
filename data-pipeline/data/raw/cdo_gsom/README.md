# Climate Data Online (NOAA NCEI) – mưa đo tại trạm, theo tháng, toàn cầu

**Nguồn trên trang challenge:** "Climate Data Online (CDO)" (NASA resources).
**Dùng để làm gì:** số đo mưa thật tại trạm để kiểm chứng mưa vệ tinh (IMERG), mô hình (GLDAS) và lưới nội suy
(CRU, GPCC); Contradiction Hunter dùng để tìm chỗ vệ tinh và trạm đo nói ngược nhau.

| Mục | Giá trị |
|---|---|
| Sản phẩm | Global Summary of the Month (GSOM), dựng từ trạm GHCN-Daily |
| Lấy từ | kho nén toàn bộ GSOM `https://www.ncei.noaa.gov/data/global-summary-of-the-month/archive/gsom-latest.tar.gz` (~1,5 GB, không cần tài khoản); giải nén các trạm cần rồi xoá kho |
| Chọn trạm | trạm GHCN có PRCP giao với 2001–2025 theo `ghcnd-inventory.txt`: 87 256 trạm, 82 839 có file GSOM |
| Script | `download/cdo_gsom.py` |

## File (7,2 GB)

- `stations.csv`: một dòng mỗi trạm: `id, lat, lon, elev_m, name, first_year, last_year, has_gsom`.
  `first_year`/`last_year` là năm đầu/cuối có PRCP theo inventory GHCN (có thể ngoài 2001–2025).
- `csv/<id>.csv`: file GSOM nguyên định dạng NCEI, đủ mọi năm và mọi cột.

## Cột quan trọng trong `csv/<id>.csv`

| Cột | Nghĩa | Đơn vị |
|---|---|---|
| `DATE` | tháng, dạng `YYYY-MM` | |
| `LATITUDE`, `LONGITUDE`, `ELEVATION` | vị trí trạm | độ, m |
| `PRCP` | tổng mưa tháng | mm |
| `PRCP_ATTRIBUTES` | `a,M,Q,S`: số ngày thiếu (1–5), cờ đo, cờ chất lượng, mã nguồn (tài liệu GSOM của NCEI) | |
| `TAVG`, `TMAX`, `TMIN` | nhiệt độ trung bình / tối đa / tối thiểu tháng | °C |

Giải nghĩa `PRCP_ATTRIBUTES` (theo `GSOM_documentation.pdf` của NCEI):
- `a` số ngày thiếu hoặc bị gắn cờ trong tháng (GSOM vẫn tính tổng khi thiếu ≤ 5 ngày, nên tổng thấp hơn thực).
- `M` cờ đo: `T` lượng vết, `a` tổng tích luỹ có chứa ngày thiếu.
- `Q` cờ chất lượng GHCN-Daily: rỗng = qua kiểm tra.
- `S` mã nguồn GHCN-Daily. `S` = suy ra từ bản tin synop GTS; NCEI ghi rằng mưa từ nguồn này có thể lệch nhiều so
  với số đo ngày thật, nên dùng thận trọng.

## Cần biết trước khi dùng (số liệu từ `reports/01_eda.md`)

- **8,43 triệu dòng trạm × tháng trong 2001–2025; PRCP trống 4,9 %.** Mỗi trạm trung vị 59/300 tháng có PRCP;
  11 827 trạm có ≥ 240 tháng; 659 trạm không có PRCP nào trong giai đoạn.
- Số ngày thiếu > 0 ở 15,6 % dòng có PRCP; cờ chất lượng rỗng ở 100 % (GSOM đã bỏ ngày không qua QC); nguồn `S` ở
  3,0 % dòng, 1 893 trạm chỉ có nguồn `S`.
- PRCP 0 … 3 088 mm/tháng, không có giá trị âm.
- Một số file không có cột `PRCP` (trạm chỉ có nhiệt độ). Kiểm tra `'PRCP' in df.columns`.
- Đây là số đo tại một điểm; so với ô lưới (IMERG 0,1°, lưới chung 0,5°) sẽ lệch, nhất là vùng núi.
