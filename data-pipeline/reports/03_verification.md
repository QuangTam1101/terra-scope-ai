# Kiểm chứng dữ liệu đã làm sạch (sinh tự động bởi `preprocess/verify.py`)

Dữ liệu `data/processed/` khoảng 2001-01 … 2025-12. Ngưỡng đạt đặt trước khi chạy (`CRITERIA` trong `verify.py`); cách làm từng phép thử: `preprocess/README.md` mục 7.

## A. Tính lại từ file thô, độc lập với `clean.py`

| sản phẩm | tháng thô / sau xử lý | tháng tính lại | ô so | ô lệch | khớp ô % | TB toàn cầu thô | TB toàn cầu sau xử lý | chênh TB % | kết luận |
|---|---|---|---|---|---|---|---|---|---|
| precip_imerg | 297 / 297 | 6 | 1555200 | 0 | 100 | 83.73 | 83.73 | 0.0005662 | đạt |
| precip_cru | 300 / 300 | 6 | 1555200 | 0 | 100 | 68.7 | 68.7 | 1.639e-06 | đạt |
| precip_gpcc | 240 / 240 | 6 | 1555200 | 0 | 100 | 71.51 | 72.24 | 1.017 | đạt |
| sm_0_10cm_gldas | 300 / 300 | 6 | 1555200 | 0 | 100 | 0.2398 | 0.24 | 0.08085 | đạt |
| sm_10_40cm_gldas | 300 / 300 | 6 | 1555200 | 0 | 100 | 0.2467 | 0.2468 | 0.04378 | đạt |
| sm_40_100cm_gldas | 300 / 300 | 6 | 1555200 | 0 | 100 | 0.2296 | 0.2297 | 0.06503 | đạt |
| sm_100_200cm_gldas | 300 / 300 | 6 | 1555200 | 0 | 100 | 0.263 | 0.2632 | 0.07264 | đạt |
| rootmoist_gldas | 300 / 300 | 6 | 1555200 | 0 | 100 | 281.2 | 281.4 | 0.09404 | đạt |
| tair_gldas | 300 / 300 | 6 | 1555200 | 0 | 100 | 6.732 | 6.745 | 0.1823 | đạt |
| evap_gldas | 300 / 300 | 6 | 1555200 | 0 | 100 | 35.93 | 36 | 0.1875 | đạt |
| chlor_a_seawifs | 117 / 116 (2008-01 rỗng sau ngưỡng 50 %, tính lại cũng rỗng) | 6 | 1555200 | 0 | 100 | 0.247 | 0.2408 | 2.525 | đạt |
| t2m_merra2 | 300 / 300 | 6 | 0 |  |  | 12.84 | 12.84 | 0.00284 | đạt |

_tháng thô / sau xử lý_: số tháng file thô có trong khoảng và số tháng có dữ liệu sau xử lý. _ô so_: mọi ô 0,5° toàn cầu của các tháng mẫu, kể cả ô NaN (NaN phải ở đúng chỗ); khớp = lệch tương đối ≤ 1e-4. MERRA-2 có lưới không lồng vào 0,5° nên chỉ so trung bình toàn cầu (ngưỡng 0,1 %). Với lưới chỉ có đất liền hoặc chỉ có biển, chênh trung bình toàn cầu đến từ các ô ven bờ bị bỏ theo ngưỡng 50 %, chỉ để tham khảo.

GSOM (300 trạm ngẫu nhiên, lọc lại từ CSV gốc, so từng dòng trạm × tháng):

| trạm so | dòng tính lại | dòng trong parquet | dòng lệch | kết luận |
|---|---|---|---|---|
| 300 | 24473 | 24473 | 0 | đạt |

SMAP (gộp lại từ file ngày, gán ô theo lat/lon NASA; khác cách lấy mẫu của `clean.py` nên không khớp tuyệt đối, so bằng tương quan):

| tháng | ô so | r | trung vị |chênh| m³/m³ | kết luận |
|---|---|---|---|---|
| 2016-07 | 30310 | 0.9973 | 0.00198 | đạt |
| 2020-01 | 20814 | 0.9974 | 0.001837 | đạt |
| 2024-07 | 30108 | 0.9971 | 0.001966 | đạt |

## B. So với giá trị tham chiếu đã công bố

| đại lượng | giá trị | tham chiếu | ngưỡng | kết luận |
|---|---|---|---|---|
| T2M trung bình toàn cầu °C (MERRA-2) | 14.6 | NOAA: TB thế kỷ 20 là 13,9 °C, 2001–2025 ấm hơn 0,6–1,3 °C | 13,5–16 | đạt |
| xu hướng T2M 2001–2025 °C/thập kỷ | 0.184 | IPCC AR6, Copernicus: ~0,2–0,3 °C/thập kỷ gần đây | 0,1–0,45 | đạt |
| mưa IMERG trung bình toàn cầu mm/ngày | 2.758 | GPCP: ~2,7 mm/ngày; vệ tinh thường cao hơn một chút | 2,5–3,2 | đạt |

## C. So các nguồn độc lập với nhau

Nguồn khác nhau đo cùng đại lượng phải khớp nhau; nếu xử lý lật trục, lệch kinh độ hay lệch tháng thì tương quan sụp. Dòng _lệch 1 tháng_ là đối chứng: tương quan phải giảm rõ.

| phép so | giá trị | số ô/trạm | kết luận |
|---|---|---|---|
| IMERG – GPCC, tương quan theo ô | 0.9195 | 73527 | đạt |
| … cùng phép so, lệch 1 tháng | 0.3212 |  | giảm 0.60: đạt |
| IMERG – GPCC, bản đồ mưa trung bình | 0.9578 |  | đạt |
| IMERG – CRU, bản đồ mưa trung bình | 0.9589 |  | đạt |
| trạm GSOM – ô IMERG chứa trạm | 0.8853 | 34313 | đạt |
| … cùng phép so, lệch 1 tháng | 0.209 |  | giảm 0.68: đạt |
| GLDAS Tair – MERRA-2 T2M, bản đồ trung bình | 0.9971 |  | đạt |
| GLDAS Tair − MERRA-2 T2M, chênh trung bình °C (đất liền) | 0.227 |  | đạt |
| GLDAS 0–10 cm – SMAP, tương quan theo ô | 0.6874 | 33099 | đạt |
