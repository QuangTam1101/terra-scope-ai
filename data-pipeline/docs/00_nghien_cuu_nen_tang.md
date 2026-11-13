# 00 — Nghiên cứu nền tảng

Tài liệu này tóm tắt kiến thức cần có trước khi xây pipeline cho **Terra-scope AI**: web app phân tích xu hướng môi trường cho **bất kỳ vùng nào trên thế giới** (README). Mỗi phần trả lời 3 câu hỏi:
- **Nó là gì?**
- **Tại sao nó quan trọng với project này?**
- **Dùng thế nào?** (kèm code chạy được)

---

## 1. NASA AppEEARS

**Là gì:** AppEEARS (Application for Extracting and Exploring Analysis Ready Samples) là công cụ của LP DAAC để **cắt** dữ liệu vệ tinh theo vị trí, thời gian và layer. Nó không phải một dataset mà là "cái kéo" cho khoảng 193 product (MODIS, VIIRS, ECOSTRESS, HLS, SRTM…).

**Tại sao quan trọng:** dữ liệu MODIS gốc chia thành các "tile" 10°×10° ở phép chiếu sinusoidal, file định dạng HDF4 cũ, phủ cả hành tinh. Tự tải và ghép tile, dù chỉ cho một vùng nhỏ như Việt Nam, trong 24 năm đã tốn hàng chục GB và nhiều giờ code. AppEEARS làm việc ghép, cắt, đổi định dạng trên máy chủ NASA, ta chỉ nhận phần cần.

**Hai kiểu request:**

| | Point sample | Area sample |
|---|---|---|
| Input | Danh sách toạ độ (CSV hoặc GeoJSON Point) | Polygon (GeoJSON / shapefile zip / vẽ trên bản đồ) |
| Output | **1 file CSV**: mỗi dòng = 1 điểm × 1 ngày | **GeoTIFF** (mỗi layer × ngày × polygon một file) hoặc **NetCDF-4** (gộp theo product × polygon) |
| Tốc độ | Nhanh (vài phút) | Chậm (vài phút đến vài giờ) |
| Dùng khi | Có trạm/điểm cụ thể, cần chuỗi thời gian nhanh | Cần trung bình vùng, cần bản đồ |

**Quy trình:** đăng nhập Earthdata → gửi task → chờ (`pending` → `processing` → `done`) → tải bundle. Script `appeears.py` đã làm việc này.

**Bundle của area request gồm** (theo trang Help chính thức ✅):
- File dữ liệu (`.tif` hoặc `.nc`). Tên GeoTIFF dạng `{product}.{version}_{layer}_doy{YYYYDDDHHMMSS}_{feature_id}.tif`, nên **ngày tháng nằm trong tên file**.
- `*-request.json`: tham số request, dùng để chạy lại y hệt.
- `*-granule-list.txt`: danh sách granule gốc đã dùng.
- CSV bảng tra QA (quality lookup).
- `*-Statistics.csv`: count/mean/median/std… cho từng layer × ngày × polygon. Tiện để xem nhanh, nhưng **chưa lọc QA** (mây vẫn bị tính vào).
- `*-Statistics-QA.csv`: phân bố tần suất giá trị QA.
- README và checksum SHA-256.

> 💡 **Mẹo kiểm tra chéo:** `*-Statistics.csv` là "đáp án có sẵn" để kiểm tra code. Nếu tắt QA mask trong pipeline của ta, trung bình vùng tính ra phải **khớp** cột mean của file này. Khớp thì phần đọc file, decode và clip đã đúng; khi đó mọi khác biệt sau khi bật QA mask chỉ đến từ việc lọc mây.

---

## 1b. NASA Giovanni

**Là gì:** Giovanni là công cụ của GES DISC (trung tâm dữ liệu khí quyển – thuỷ văn của NASA) để **phân tích nhanh dữ liệu lưới** mà không cần tải file gốc: vẽ bản đồ trung bình, chuỗi thời gian trung bình vùng, chuỗi tại một điểm… Nó phục vụ hàng nghìn biến từ các dataset như **GPM IMERG** (lượng mưa vệ tinh), **GLDAS** (mô hình đất: ẩm đất, nhiệt độ không khí, bốc hơi), **MERRA-2** (tái phân tích khí quyển: nhiệt độ 2 m…).

**Tại sao quan trọng với project này:** AppEEARS **không có** lượng mưa, ẩm đất 24 năm hay nhiệt độ không khí cho toàn cầu ✅. Giovanni có. Qua Harmony, ta lấy được:
- **lưới toàn cầu đã cắt biến** (HOSS) cho heatmap và phân tích vùng bất kỳ;
- **con số trung bình vùng mỗi tháng** cho các vùng mẫu.

**Khác AppEEARS ở đâu (điểm quan trọng nhất):**

| | AppEEARS | Giovanni |
|---|---|---|
| Trả về | Pixel thô (raster / giá trị pixel) | Lưới gốc đã cắt biến (HOSS) hoặc **kết quả đã phân tích** (một con số trung bình / tháng) |
| Fill, scale, QA | **Ta tự làm** | **Đã làm sẵn** ở phía NASA; không có layer QA theo pixel |
| Vùng | Polygon bất kỳ | **Chỉ bbox** cho area-average ✅ |
| Độ phân giải | 500 m – 1 km (MODIS) | 0.1° (IMERG), 0.25° (GLDAS), 0.5° × 0.625° (MERRA-2) |
| Việc của ta | Làm sạch + tổng hợp | **Gộp lưới về 1° / parse CSV, kiểm tra và đổi đơn vị** |

**Ba kiểu kết quả:**
- **Lưới toàn cầu (HOSS)**: mỗi tháng một file NetCDF chứa cả lưới gốc của biến. Ta gộp về ô 1° thành cube `(tháng, vĩ độ, kinh độ)`. Đây là **nguồn chính** của web (02 §4.6).
- **Area-average time series**: chuỗi trung bình của mọi ô lưới trong một bbox, mỗi tháng một giá trị. Dùng cho **vùng mẫu** để kiểm chứng cube.
- **Point time series**: chuỗi giá trị của **ô lưới chứa điểm** (không phải đúng tại điểm: một ô GLDAS rộng ~28 km). Chỉ còn là phương án dự phòng.

**Truy cập bằng code:**
- **Harmony** chọn dịch vụ xử lý theo collection và tham số của request. Danh sách dịch vụ của một collection xem ở `https://harmony.earthdata.nasa.gov/capabilities?collectionId=<concept ID>`. Với 3 collection của ta (✅ 13/11):
  - `giovanni-averaging-service`: trung bình vùng (khi request có `average`);
  - `sds/HOSS-geographic`: cắt biến / bbox / thời gian từ file gốc qua OPeNDAP, trả NetCDF-4 (khi request có `variables`, không `average`).
- *Lưới toàn cầu (HOSS):* `Request(collection, temporal, variables=["<tên biến HOSS>"], format="application/x-netcdf4")`, **không truyền bbox**. HOSS đọc file gốc trên `opendap.earthdata.nasa.gov`, nên tài khoản Earthdata phải đã liên kết **NASA GESDISC DATA ARCHIVE**; chưa liên kết thì job lỗi `403`.
- *Area-average* đi qua **Harmony**: dịch vụ điều phối xử lý dữ liệu trên cloud của NASA, cũng là "động cơ" chạy Giovanni trên cloud. Thư viện Python `harmony-py`: gửi `Request(..., average="area", format="text/csv")`, chờ job xong, tải về file CSV.
- *Point time series*: `GET https://api.giovanni.earthdata.nasa.gov/timeseries?data=<ID biến>&location=[lat,lon]&time=<start>/<end>`, kèm token Earthdata.
- *Quota*: `GET https://api.giovanni.earthdata.nasa.gov/quota` trả tỷ lệ đã dùng (0..1). Giovanni giới hạn lượng xử lý mỗi người dùng, nên **luôn kiểm tra trước** một đợt gọi lớn.
- *ID biến* (ví dụ `GPM_3IMERGM_07_precipitation`) tra ở `/configured-variables/`.

**CSV area-average trông thế nào:** vài dòng đầu là **metadata** (tên biến, đơn vị, bbox, thời gian…), kết thúc ở một dòng chỉ có dấu `,`; sau đó mới là bảng hai cột `time, mean_<ID biến>`. Parser phải bỏ phần đầu, nhưng **giữ lại dòng đơn vị** để kiểm tra (02, mục 4).

**Bẫy:**
- **Đơn vị "lạ":** IMERG tháng là *tốc độ mưa* (mm/giờ), không phải tổng mưa tháng; ẩm đất GLDAS là *khối lượng nước* (kg/m²) trong lớp 0–10 cm, không phải tỷ lệ thể tích. Đổi sai là sai hàng chục lần (03, mục G).
- **Đất liền hay cả biển:** GLDAS chỉ có ô đất liền; IMERG và MERRA-2 có cả biển. Cùng một bbox ven biển, hai biến "trung bình vùng" thực ra trung bình trên hai tập ô khác nhau.
- ⚠️ Trung bình vùng của Giovanni có trọng số theo diện tích ô (cos vĩ độ) không: chưa có tài liệu xác nhận.

---

## 2. Ba định dạng dữ liệu

**Tại sao cần hiểu:** AppEEARS trả ba định dạng khác nhau tuỳ loại request (point → CSV; area → GeoTIFF hoặc NetCDF-4), còn Giovanni trả CSV có phần metadata ở đầu. Đọc sai định dạng là lỗi thầm lặng nguy hiểm nhất: code vẫn chạy, nhưng số ra sai.

### CSV — bảng chữ

- **Là gì:** văn bản, mỗi dòng một bản ghi, các cột cách nhau bằng dấu phẩy.
- **Gặp ở đâu:** AppEEARS point output (lưới điểm MODIS), `*-Statistics.csv` của area request, **mọi kết quả Giovanni** (lưới HOSS, area-average và point time series).
- **Bẫy Giovanni:** phần đầu file là metadata, không phải dữ liệu → `pd.read_csv` thẳng sẽ đọc sai cột. Phải tìm dòng chỉ có `,` rồi đọc từ sau dòng đó (code ở 02).
- **Bẫy:** CSV point của AppEEARS có **một cột cho mỗi layer**, tên cột dạng `MOD13A3_061__1_km_monthly_NDVI`, kèm các cột QA đã giải mã sẵn ⚠️ (xác nhận với file thật đầu tiên). Giá trị trong CSV có thể **đã nhân scale factor** → kiểm tra trước khi nhân lần nữa (03, mục C).

```python
import pandas as pd
df = pd.read_csv("results.csv", parse_dates=["Date"])
```

### GeoTIFF — ảnh có toạ độ

- **Là gì:** ảnh TIFF kèm thông tin địa lý: hệ toạ độ (CRS), vị trí góc ảnh, kích thước pixel, giá trị NoData.
- **Một file = một lớp 2D** (1 layer × 1 thời điểm). Chuỗi thời gian = nhiều file; ngày lấy từ **tên file**.
- **Dùng khi:** hiển thị bản đồ, mở trong QGIS.

```python
import rioxarray
da = rioxarray.open_rasterio("MOD13A3.061__1_km_monthly_NDVI_doy2024001000000_aid0001.tif",
                             masked=True)        # NoData -> NaN
print(da.rio.crs, da.rio.resolution(), da.shape)  # (band, y, x)
```

### NetCDF — khối dữ liệu nhiều chiều

- **Là gì:** file khoa học chứa nhiều biến, mỗi biến nhiều chiều (ví dụ `time × lat × lon`), kèm **attributes** mô tả: `units`, `scale_factor`, `add_offset`, `_FillValue`, `long_name`.
- **Ưu điểm lớn:** 1 file chứa cả chuỗi thời gian, và `xarray` **tự động** áp dụng `scale_factor` / `add_offset` / `_FillValue` nhờ chuẩn CF (Climate and Forecast conventions).

```python
import xarray as xr
ds = xr.open_dataset("MOD13A3.061_1km_aid0001.nc")   # mask_and_scale=True là mặc định
print(ds)                       # liệt kê biến, chiều, attributes
ndvi = ds["_1_km_monthly_NDVI"]
print(ndvi.attrs)               # units, scale_factor (nếu có)...
```

**Quyết định:** AppEEARS area request → **NetCDF-4** cho phân tích, GeoTIFF chỉ cho bản đồ.

**Tại sao:** với 24 năm dữ liệu tháng, GeoTIFF tạo ra 288 file/layer/vùng, phải tự parse ngày từ tên file và tự áp scale. NetCDF tạo 1 file/product/vùng, có sẵn trục thời gian, decode tự động. Ít code hơn đồng nghĩa với ít lỗi hơn.

---

## 3. Ba thư viện: rasterio, rioxarray, xarray

```
        xarray                 rioxarray                  rasterio
  (mảng nhiều chiều        (gắn khả năng "địa lý"      (đọc/ghi raster,
   có nhãn: time,lat,lon)   vào xarray: .rio.*)         dựa trên GDAL)
            ▲                       │                          ▲
            └──────── dùng ─────────┴─────── dùng ─────────────┘
```

Hiểu đơn giản: **xarray** là "Excel nhiều chiều", **rasterio** là "người đọc file bản đồ", còn **rioxarray** giúp hai thứ đó nói chuyện với nhau.

| Thư viện | Vai trò | Hàm hay dùng |
|---|---|---|
| **xarray** | Mảng nhiều chiều có tên chiều và toạ độ; tính toán theo thời gian/không gian | `open_dataset`, `.sel(time=...)`, `.where(mask)`, `.mean(dim=...)`, `.resample(time="MS")`, `.groupby("time.month")` |
| **rasterio** | Lớp thấp: đọc/ghi GeoTIFF, CRS, transform; ít khi gọi trực tiếp | `rasterio.open`, `src.crs`, `src.transform`, `src.nodata` |
| **rioxarray** | Thêm `.rio` vào xarray: reproject, clip, ghi GeoTIFF | `open_rasterio`, `.rio.crs`, `.rio.write_crs`, `.rio.reproject`, `.rio.clip`, `.rio.to_raster` |

Ví dụ cắt theo polygon rồi lấy trung bình:

```python
import json, rioxarray
from shapely.geometry import shape

region = json.load(open("config/regions.geojson"))["features"][0]
geom = [shape(region["geometry"])]

da = rioxarray.open_rasterio("ndvi.tif", masked=True)
clipped = da.rio.clip(geom, crs="EPSG:4326", all_touched=False, drop=True)
print(float(clipped.mean()))
```

Thư viện phụ:
- `pandas`: bảng
- `pyarrow`: ghi Parquet
- `shapely`: hình học
- `pymannkendall`: kiểm định xu hướng
- `requests`: gọi AppEEARS API (đã dùng trong `appeears.py`) và Giovanni `/timeseries`, `/quota`
- `harmony-py`: gửi job lưới HOSS và job area-average của Giovanni qua Harmony
- `scipy`: gom ô significant liền kề thành điểm nóng (`scipy.ndimage.label`)

---

## 4. Các khái niệm xử lý

### 4.1 CRS và reprojection

- **CRS** (Coordinate Reference System) = quy ước biến toạ độ trên bản đồ thành vị trí trên Trái Đất.
  - `EPSG:4326` (geographic): kinh độ/vĩ độ, đơn vị **độ**. Một pixel 0.25° ở xích đạo rộng ~28 km, nhưng ở vĩ độ 60° chỉ còn ~14 km theo chiều đông-tây → **diện tích không đều**.
  - **MODIS Sinusoidal** (native của MODIS): đơn vị mét, **mọi pixel có diện tích bằng nhau** (equal-area).
- **Reprojection** = đổi dữ liệu sang CRS khác, cần **resampling**:
  - *Nearest neighbor*: lấy giá trị pixel gần nhất. Giữ nguyên giá trị gốc, **bắt buộc cho QA/categorical** (không tồn tại "QA 2.5"). AppEEARS luôn dùng cách này ✅.
  - *Bilinear*: trung bình có trọng số. Mượt hơn nhưng tạo giá trị mới, **cấm dùng cho QA**.

**Quyết định của pipeline:** **tổng hợp (aggregate) ở lưới gốc, chỉ reproject khi vẽ bản đồ.**

**Tại sao:** ta chỉ cần *một con số trung bình vùng mỗi tháng*. Reproject trước rồi mới tính trung bình nghĩa là thêm một bước làm méo dữ liệu (nhân đôi hoặc bỏ sót pixel) mà không được lợi gì. Hệ quả:
- Lưới equal-area (MODIS `native`) → trung bình thường là đúng. Đây là lý do request dùng projection `native`.
- Nếu lỡ dùng `geographic` (lat/lon) → phải lấy trung bình **có trọng số cos(vĩ độ)**. Với phạm vi toàn cầu, sai số này không nhỏ: ở vĩ độ 60°, cos = 0.5, tức một pixel chỉ rộng bằng nửa pixel ở xích đạo theo chiều đông-tây.
- Cube lưới 1° là lưới lat/lon, nên mọi trung bình vùng trên cube (`region_series`, chuỗi điểm nóng) đều **có trọng số cos(vĩ độ)**. Trong một ô 1°, `bin_to_grid` lấy trung bình thường các ô gốc vì cos(vĩ độ) gần như không đổi trong 1° (03, K18).
- Giovanni tính trung bình vùng trên **lưới lat/lon** của nó (IMERG, GLDAS, MERRA-2 đều là lưới độ). Phép tính đó do NASA làm nên ta không chỉnh được; ⚠️ chưa rõ có trọng số cos(vĩ độ) hay không. Với bbox nhỏ ở vĩ độ thấp, chênh lệch không đáng kể; với bbox trải dài nhiều độ vĩ thì đáng kể.

### 4.2 Fill value / NoData

Giá trị đặc biệt nghĩa là "không có dữ liệu", ví dụ NDVI = `-3000`, LST = `0`.

**Tại sao nguy hiểm:** 1 pixel `-3000` (tức -0.3 sau scale) trong vùng 100 pixel NDVI ≈ 0.6 kéo trung bình xuống 0.591. Không ai nhìn ra, nhưng xu hướng sẽ sai nếu số pixel fill thay đổi theo năm. **Phải đổi thành NaN trước mọi phép tính.**

**Bẫy ngược lại (✅ API 13/11):** AppEEARS báo FillValue = `0` cho layer QA `QC_Day` / `QC_Night` của MOD11A2, nhưng với QC thì `0` lại nghĩa là **chất lượng tốt nhất**. Nếu áp fill value lên layer QC, ta sẽ vứt đúng những pixel tốt nhất. Quy tắc: **không bao giờ lọc layer QA theo fill value**; pixel LST thiếu được nhận biết bằng chính `LST == 0`.

### 4.3 Scale factor và offset

NASA lưu số thực dưới dạng số nguyên để tiết kiệm dung lượng:

```
giá_trị_thật = giá_trị_lưu × scale_factor + add_offset
```

| Product / layer | scale_factor | add_offset | Fill | Ví dụ |
|---|---|---|---|---|
| MOD13A3 `_1_km_monthly_NDVI` | 0.0001 | 0 | -3000 | 6523 → NDVI 0.6523 |
| MOD11A2 `LST_Day_1km` | 0.02 | 0 | 0 | 15000 → 300 K → 26.85 °C |
| MOD11A2 `Emis_31` | 0.002 | 0.49 | 0 | — |
| MOD16A2GF `ET_500m` | 0.1 | 0 | 32767 (và mọi giá trị > 32700 là mã đặc biệt: nước, đất trống…) | 245 → 24.5 mm / 8 ngày |

*(✅ Lấy trực tiếp từ AppEEARS API ngày 13/11/2026.)*

**Bẫy:** nhân scale **hai lần** (thư viện đã nhân, mình nhân tiếp → NDVI 0.000065) hoặc **quên nhân** (NDVI 6523). Cả hai đều dễ phát hiện nếu có bước kiểm tra miền giá trị, nên tài liệu 03 mục C đặt quy tắc tự phát hiện.

### 4.4 QA (Quality Assurance) bit flags

Mỗi pixel dữ liệu có một pixel QA đi kèm. Giá trị QA là số nguyên mà **từng bit** mang một ý nghĩa. Ví dụ `_1_km_monthly_VI_Quality = 2116`, giải mã qua API ✅ `/api/quality/MOD13A3.061/_1_km_monthly_VI_Quality/2116`:

```
2116 = 0b0000100001000100
          │││    ││  ││ └┴─ bit 0-1   MODLAND        = 00   → "VI produced, good quality"
          │││    ││  └┴──── bit 2-5   VI Usefulness  = 0001 → "Lower quality"
          │││    └┴──────── bit 6-7   Aerosol        = 01   → "Low"
          └┴┴────────────── bit 11-13 Land/Water     = 001  → "Land"
```

Giải mã trong Python bằng phép toán bit (chạy được trên cả mảng numpy/xarray):

```python
qa = 2116
modland    = qa & 0b11            # 0 -> good       (lấy 2 bit cuối)
usefulness = (qa >> 2) & 0b1111   # 1               (dịch phải 2, lấy 4 bit)
land_water = (qa >> 11) & 0b111   # 1 -> land       (dịch phải 11, lấy 3 bit)
good = (modland == 0)
```

Cách hiểu: `>> n` "đẩy" n bit cuối ra ngoài, còn `& 0b111` "giữ lại" 3 bit cuối. Ghép hai phép này là lấy được bất kỳ nhóm bit nào. Nghĩa của từng bit tra qua API (không cần đăng nhập): `GET https://appeears.earthdatacloud.nasa.gov/api/quality/{product}/{qa_layer}`.

**Tại sao QA quan trọng với xu hướng:** nếu không lọc mây, NDVI của pixel có mây thấp hơn thực tế. Nếu tần suất mây thay đổi theo năm (điều có thật khi khí hậu thay đổi), ta sẽ thấy một "xu hướng NDVI" thực chất là **xu hướng mây**. Đây là kiểu sai mà challenge muốn người tham gia tránh.

### 4.5 Missing values: bốn loại thiếu dữ liệu

| Loại | Nguyên nhân | Xử lý |
|---|---|---|
| Fill value | Cảm biến không đo được | → NaN (bước decode) |
| QA xấu | Mây, aerosol, bóng, tuyết | → NaN (bước QA mask) |
| Ngoài polygon | AppEEARS gán NODATA | → NaN (tự động khi `masked=True`) |
| Thiếu cả tháng | Mùa mưa nhiều mây, cả vùng bị mask | **Không nội suy** khi kiểm định xu hướng; ghi `valid_frac` thấp và để NaN |
| Giovanni trả rỗng | bbox toàn biển với biến GLDAS (chỉ đất liền), tháng ngoài phạm vi dataset | → NaN; không biết số ô hợp lệ nên `valid_frac` = 1.0 nếu có giá trị |

**Tại sao không nội suy:** nội suy là "bịa" ra số. Kiểm định Mann-Kendall chạy được với dữ liệu thiếu; còn số nội suy làm chuỗi mượt giả tạo, khiến p-value nhỏ hơn thực tế, tức là dễ kết luận "significant" sai.

Ở vùng nhiệt đới gió mùa (ví dụ Việt Nam, mùa mưa khoảng tháng 5–10) và vùng xích đạo ẩm, mây nhiều → NDVI/LST từ MODIS thiếu nhiều. Đây là **đặc điểm dữ liệu cần trình bày minh bạch** (hiển thị `valid_frac` trên biểu đồ), không phải lỗi.

---

## 5. Trích xuất theo point và polygon

| | Point | Polygon |
|---|---|---|
| Giá trị trả về | Giá trị của **pixel chứa điểm** | **Thống kê các pixel trong polygon** (mean, median…) |
| Ý nghĩa | Đại diện 1 vị trí (dễ nhiễu bởi 1 pixel xấu) | Đại diện cả vùng (ổn định hơn) |
| Khi dùng | So với trạm đo, điểm quan tâm cụ thể | Xu hướng vùng, là mục tiêu chính của challenge |
| Bẫy | Điểm ở rìa pixel; 1 pixel 1 km không đại diện cho cả ô lưới 1° (~111 km) quanh nó | Pixel nằm một phần trong polygon: `all_touched=False` chỉ lấy pixel có **tâm** trong polygon |

**Quyết định:** pipeline dùng cả hai:
- **Point request** tại tâm mỗi ô đất liền 1° → đưa biến MODIS lên **cube lưới toàn cầu** (P1), dùng chung với cube Giovanni cho heatmap, phân tích vùng và Contradiction Hunter.
- **Polygon (area request)** cho **vùng mẫu**, để kiểm chứng giá trị cube bằng trung bình pixel thật. Polygon luôn là **hình chữ nhật**, để Giovanni area-average (chỉ nhận bbox) đo đúng cùng vùng đó.

**Với Giovanni**, "point" nghĩa là giá trị của **ô lưới** chứa điểm (IMERG ~11 km, GLDAS ~28 km, MERRA-2 ~55 km), thô hơn nhiều so với pixel MODIS 1 km. Vì vậy so sánh "điểm" giữa hai nguồn là so một pixel 1 km với một ô vài chục km: dùng để **giải thích xu hướng**, không dùng để so giá trị tuyệt đối.

**Tại sao lưới MODIS dùng point:** area request 1 km cho cả Trái Đất quá nặng; point request chỉ trả giá trị tại điểm. Cái giá là mỗi ô lưới chỉ được đại diện bởi **một pixel mẫu**. Nếu cần ổn định hơn: polygon nhỏ ~10×10 km quanh mỗi điểm, lấy trung bình theo feature trong `*-Statistics.csv`.

Công cụ đã có: `python3 appeears.py point ...` và `python3 appeears.py area ...`.

---

## Nguồn tham khảo

- AppEEARS API: <https://appeears.earthdatacloud.nasa.gov/api/>
- AppEEARS Help (area samples, reprojection, bundle): <https://appeears.earthdatacloud.nasa.gov/help>
- Giovanni: <https://giovanni.gsfc.nasa.gov/> · Giovanni API (`/timeseries`, `/quota`, `/configured-variables/`): <https://api.giovanni.earthdata.nasa.gov/>
- harmony-py: <https://github.com/nasa/harmony-py> · Harmony capabilities: <https://harmony.earthdata.nasa.gov/capabilities?collectionId=C2723754851-GES_DISC>
- rioxarray: <https://corteva.github.io/rioxarray/> · xarray: <https://docs.xarray.dev/>
