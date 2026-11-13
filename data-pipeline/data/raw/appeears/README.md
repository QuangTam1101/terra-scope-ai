# AppEEARS (NASA LP DAAC) – ảnh vệ tinh độ phân giải cao cắt theo vùng

**Nguồn trên trang challenge:** "AppEEARS" (NASA resources).
**Công cụ:** `appeears.py` ở thư mục gốc (đăng nhập bằng `EARTHDATA_USER`/`EARTHDATA_PASS` trong `.env`).
Mỗi thư mục con là một yêu cầu (task) AppEEARS: `task.json` là yêu cầu đã gửi, `task_id.txt` là mã task,
`README.md` bên trong do AppEEARS tự sinh (mô tả chung của AppEEARS, không phải tài liệu của nhóm).

## Các yêu cầu

| Thư mục | Sản phẩm / lớp | Độ phân giải | Thời gian | Vùng |
|---|---|---|---|---|
| `R1_mvp_MOD13A3` | MOD13A3.061: NDVI + VI_Quality | 1 km, tháng | 2001-01 → 2024-12 (288 bước) | 3 vùng Việt Nam |
| `R2a_mvp_MOD11A2_day` | MOD11A2.061: LST_Day_1km + QC_Day | 1 km, 8 ngày | 2000-12-26 → 2024-12-26 (1102 bước) | 3 vùng Việt Nam |
| `R2b_mvp_MOD11A2_night` | MOD11A2.061: LST_Night_1km + QC_Night | 1 km, 8 ngày | 2000-12-26 → 2024-12-26 (1102 bước) | 3 vùng Việt Nam |
| `R3_mvp_MOD16A2GF` | MOD16A2GF.061: ET_500m, PET_500m + ET_QC_500m | 500 m, 8 ngày | 2000-12-26 → 2024-12-26 (1105 bước) | 3 vùng Việt Nam |
| `R4_static` | MCD12Q1.061 LC_Type1 (lớp phủ, năm 2001–2024) + SRTMGL3 DEM (độ cao 90 m, năm 2000) | 500 m / 90 m | tĩnh | 3 vùng Việt Nam |
| `smap_SPL3SMP_E_mekong_AM` | SPL3SMP_E.006: độ ẩm đất DCA lượt sáng + cờ chất lượng | 9 km, ngày | 2015-03-31 → 2024-12-31 | cả bbox |
| `smap_SPL3SMP_E_mekong_PM` | SPL3SMP_E.006: độ ẩm đất DCA lượt chiều + cờ chất lượng | 9 km, ngày | 2015-03-31 → 2024-12-31 | cả bbox |

**3 vùng Việt Nam** (R1–R4, tạo trước khi đề tài chuyển sang cả lưu vực; đều nằm trong bbox nên được giữ lại):

| File | Vùng | lon min–max | lat min–max |
|---|---|---|---|
| `*_aid0001.nc` | mekong_delta (ĐB sông Cửu Long) | 104,4–106,9 | 8,5–11,1 |
| `*_aid0002.nc` | central_highlands (Tây Nguyên, một phần lưu vực Sesan/Srepok) | 107,2–109,0 | 11,2–15,5 |
| `*_aid0003.nc` | hanoi (ngoài lưu vực Mekong, dùng làm vùng đối chứng) | 105,3–106,1 | 20,5–21,4 |

**SMAP** dùng `config/mekong_bbox.geojson`. Tách thành 2 yêu cầu AM/PM vì một yêu cầu gộp vượt giới hạn số file của
AppEEARS. SMAP bắt đầu 31/03/2015, nên chỉ có ~10 năm, ngắn hơn giai đoạn 2001–2024 của các nguồn khác.
**Trạng thái (13/11/2026): SMAP chưa tải xong**, hai task AppEEARS vẫn đang xử lý; mô tả file NetCDF sẽ bổ sung khi
dữ liệu về.

## Đọc file NetCDF của AppEEARS – các bẫy đã gặp

1. **Tên file theo thứ tự vùng**: `aid0001/0002/0003` là vùng thứ 1/2/3 trong yêu cầu (bảng trên); trong file không
   có tên vùng.
2. **Lưới MODIS là sinusoidal** (`xdim`, `ydim`), không phải lat/lon; hệ toạ độ nằm trong biến `crs`.
   SRTM có trục `lat`/`lon`.
3. **Thời gian kiểu `cftime.DatetimeJulian`**. Đổi sang pandas (giữ nguyên ngày/tháng/năm):
   `ds.indexes["time"].to_datetimeindex(unsafe=True, time_unit="ns")`.
4. **Hệ số scale**: dữ liệu là số nguyên + `scale_factor` trong attrs; xarray tự nhân khi mở mặc định
   (NDVI × 0,0001; LST × 0,02 → K; ET/PET × 0,1 → kg/m²/8 ngày = mm/8 ngày).
5. **QC = 0 là chất lượng tốt nhất** nhưng lại được khai báo là `_FillValue` ở `QC_Day`/`QC_Night`. Mở lớp QC với
   `mask_and_scale=False`, nếu không xarray sẽ biến các pixel tốt nhất thành NaN.
6. **Sản phẩm 8 ngày có thêm kỳ 26/12/2000** (kỳ tổng hợp chồng sang 2001). Bỏ nếu chỉ dùng 2001–2024.
7. Bảng giải mã bit QC: `*-lookup.csv`; thống kê theo từng ảnh: `*-Statistics.csv`.

## Tải lại

Tải lại kết quả của task đã xong (AppEEARS chỉ giữ kết quả một thời gian, xem
<https://appeears.earthdatacloud.nasa.gov/help?section=sample-retention>):

```bash
.venv/bin/python appeears.py fetch "$(cat data/raw/appeears/<thư mục>/task_id.txt)" data/raw/appeears/<thư mục>
```

Khi task đã hết hạn, gửi lại đúng yêu cầu cũ:

```bash
.venv/bin/python appeears.py run data/raw/appeears/<thư mục>/task.json data/raw/appeears/<thư mục>
```
