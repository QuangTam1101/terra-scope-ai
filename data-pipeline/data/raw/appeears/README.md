# AppEEARS (NASA LP DAAC) – ảnh vệ tinh độ phân giải cao, lấy theo vùng khi cần

**Nguồn trên trang challenge:** "AppEEARS" (NASA resources).
**Công cụ:** `appeears.py` ở thư mục gốc (đăng nhập bằng `EARTHDATA_USER`/`EARTHDATA_PASS` trong `.env`).

**Không tải sẵn.** AppEEARS cắt theo điểm hoặc đa giác và từ chối yêu cầu quá nhiều file ("exceeds maximum"), nên
không dùng được cho lưới toàn cầu. Đây là công cụ lấy dữ liệu chi tiết (MODIS 250 m – 1 km, SMAP 9 km …) cho vùng mà
người dùng chọn trên nền tảng. Độ ẩm đất SMAP toàn cầu lấy bằng `download/smap.py` (bản 36 km, xem
`data/raw/smap/README.md`).

## Dùng

```bash
.venv/bin/python appeears.py products NDVI                                   # tìm sản phẩm (không cần đăng nhập)
.venv/bin/python appeears.py layers MOD13A3.061                              # các lớp của sản phẩm
.venv/bin/python appeears.py area VUNG.geojson MOD13A3.061:_1_km_monthly_NDVI 01-01-2001 12-31-2025 \
    data/raw/appeears/<tên> netcdf4                                         # cắt theo đa giác
.venv/bin/python appeears.py point DIEM.csv SPL3SMP_E.006:Soil_Moisture_Retrieval_Data_AM_soil_moisture \
    03-31-2015 12-31-2025 data/raw/appeears/<tên>                            # giá trị tại điểm → CSV
.venv/bin/python appeears.py fetch TASK_ID data/raw/appeears/<tên>           # chờ / tải tiếp task đã gửi
```

Mỗi thư mục kết quả có `task.json` (yêu cầu đã gửi), `task_id.txt` và `README.md` do AppEEARS tự sinh.
Task có thể chạy nhiều giờ; nếu tiến trình chờ bị tắt, dùng `fetch` với mã trong `task_id.txt`, đừng gửi lại.
`fetch` tự đăng nhập lại khi token bị thu hồi giữa chừng.

## Đọc NetCDF của AppEEARS – các bẫy đã gặp

1. **Tên file theo thứ tự vùng**: `<sản phẩm>_<độ phân giải>_aid0001.nc` … là đa giác thứ 1, 2 … trong yêu cầu; trong
   file không có tên vùng.
2. **Lưới MODIS là sinusoidal** (`xdim`, `ydim`), không phải lat/lon; hệ toạ độ nằm trong biến `crs`.
3. **Thời gian kiểu `cftime.DatetimeJulian`**. Đổi sang pandas (giữ nguyên ngày/tháng/năm):
   `ds.indexes["time"].to_datetimeindex(unsafe=True, time_unit="ns")`.
4. **Hệ số scale**: dữ liệu là số nguyên + `scale_factor` (NDVI × 0,0001; LST × 0,02 → K; ET/PET × 0,1 → mm/8 ngày).
5. **QC = 0 là chất lượng tốt nhất** nhưng được khai báo là `_FillValue`. Mở lớp QC với `mask_and_scale=False`, nếu
   không xarray biến các pixel tốt nhất thành NaN.
6. **Sản phẩm 8 ngày có thêm kỳ 26/12/2000** (kỳ tổng hợp chồng sang 2001). Bỏ nếu chỉ dùng 2001–2025.
7. Yêu cầu quá nhiều file bị từ chối: tách theo lớp (ví dụ SMAP tách lượt AM / PM).
8. Bảng giải mã bit QC: `*-lookup.csv`; thống kê theo từng ảnh: `*-Statistics.csv`.
