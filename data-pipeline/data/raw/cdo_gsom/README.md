# Climate Data Online (NOAA NCEI) – mưa đo tại trạm, theo tháng

**Nguồn trên trang challenge:** "Climate Data Online (CDO)" (NASA resources).
**Dùng để làm gì:** số đo mưa thật tại trạm để kiểm chứng mưa vệ tinh (IMERG) và mô hình (GLDAS), và để Contradiction
Hunter so sánh vệ tinh với trạm đo.

| Mục | Giá trị |
|---|---|
| Sản phẩm | Global Summary of the Month (GSOM), dựng từ trạm GHCN-Daily |
| URL | `https://www.ncei.noaa.gov/data/global-summary-of-the-month/access/<ID>.csv` (không cần tài khoản) |
| Chọn trạm | trạm GHCN có toạ độ trong bbox 94–110°E, 8–35°N và có PRCP giao với 2001–2024 (theo `ghcnd-inventory.txt`) |
| Số trạm | 123 (Trung Quốc 50, Thái Lan 41, Việt Nam 16, Lào 7, Myanmar 4, Ấn Độ 4, Campuchia 1) |
| Script | `download/cdo_gsom.py` |

## File

- `stations.csv`: một dòng mỗi trạm, cột `id, lat, lon, elev_m, name, first_year, last_year, has_gsom`.
  `first_year`/`last_year` là năm đầu/cuối có PRCP theo inventory GHCN (có thể ngoài 2001–2024).
- `csv/<id>.csv`: file GSOM nguyên định dạng NCEI, giữ mọi năm và mọi cột (không cắt về 2001–2024).

## Cột quan trọng trong `csv/<id>.csv`

| Cột | Nghĩa | Đơn vị |
|---|---|---|
| `DATE` | tháng, dạng `YYYY-MM` | |
| `PRCP` | tổng mưa tháng | mm |
| `PRCP_ATTRIBUTES` | cờ của PRCP: `số ngày thiếu, cờ đo, cờ chất lượng, nguồn` | |
| `TAVG`, `TMAX`, `TMIN` | nhiệt độ trung bình / tối đa / tối thiểu tháng | °C |
| `DP01`, `DP10`, `DP1X` | số ngày mưa ≥ 0,254 mm / ≥ 2,54 mm / ≥ 25,4 mm (0,01 / 0,1 / 1 inch) | ngày |

## Cần biết trước khi dùng

- **Dữ liệu thưa.** Trong 2001–2024 (288 tháng), mỗi trạm có trung vị 120 tháng có PRCP; 51 trạm có ≥ 180 tháng,
  chỉ 7 trạm có ≥ 240 tháng; 2 trạm không có PRCP nào trong giai đoạn này. Ví dụ Bangkok (TH000048455) trống PRCP cả
  năm 2015. Lọc trạm theo số tháng hợp lệ trước khi tính xu hướng.
- Một số file không có cột `PRCP` (trạm chỉ có nhiệt độ trong GSOM). Kiểm tra `'PRCP' in df.columns`.
- Tháng có ngày thiếu vẫn có thể có giá trị PRCP; số ngày thiếu nằm ở phần đầu của `PRCP_ATTRIBUTES`.
- Đây là số đo tại một điểm; so với ô lưới vệ tinh (IMERG 0,1°, GLDAS 0,25°) sẽ lệch, nhất là vùng núi.
