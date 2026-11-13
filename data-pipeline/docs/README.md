# Terra-scope AI — Tài liệu Data Pipeline (NASA Space Apps 2026)

**Phụ trách:** Data collection, preprocessing, harmonization, ML (data pipeline)
**Cập nhật:** 13/11/2026 — hackathon diễn ra 14–15/11/2026
**Nguồn dữ liệu:** hai nguồn của NASA: **AppEEARS** và **Giovanni** (truy cập qua **Harmony**, gồm dịch vụ cắt lưới HOSS)
**Phạm vi:** **toàn thế giới**

## Sản phẩm

**Bài toán:** dữ liệu quan sát Trái Đất của NASA rất lớn và phân tán. Với người dùng thông thường, rất khó xác định một biến môi trường đang tăng hay giảm ở đâu, thay đổi bao nhiêu, và xu hướng đó có đáng tin **về mặt thống kê** hay không.

**Giải pháp:** web app kết hợp quan sát Trái Đất, AI, GIS và phân tích thống kê. Người dùng chọn khu vực bất kỳ trên bản đồ thế giới, chọn biến môi trường và khoảng thời gian. Hệ thống tự xử lý dữ liệu, vẽ bản đồ và biểu đồ, rồi kiểm định xu hướng.

| # | Tính năng chính | Phần Data cung cấp |
|---|---|---|
| 1 | Bản đồ tương tác (MapLibre / deck.gl), heatmap xu hướng | `trend_map()`: xu hướng mọi ô lưới 1° cho khoảng thời gian chọn |
| 2 | Engine phân tích trend: chuỗi thời gian, Theil-Sen slope, Seasonal Mann-Kendall, p-value, CI, chất lượng dữ liệu | `analyze_region()` |
| 3 | Contradiction Hunter: tự tìm vùng có xu hướng ngược nhau, kiểm định khác biệt | `find_contradictions()`, `compare_regions()` |
| 4 | AI Earth Detective: hỏi bằng ngôn ngữ thường; AI chọn biến, vùng, gọi công cụ phân tích, giải thích dựa trên số liệu thật | Các hàm trên làm tool; mọi kết quả kèm nguồn, phương pháp, giới hạn |
| 5 | Evidence report: tổng hợp kết quả, nguồn NASA, phương pháp, giới hạn | `evidence_report()` |

## Cách đọc bộ tài liệu này

Mỗi quyết định trong tài liệu đều có 3 phần:
- **Quyết định**: làm gì.
- **Tại sao**: lý do, và các phương án đã cân nhắc nhưng không chọn.
- **Kiểm chứng**: dựa trên nguồn nào (API thật, tài liệu NASA) hay còn là giả định.

Đọc theo thứ tự **00 → 01 → 02 → 03 → 04 → 05**. Tài liệu 00 là kiến thức nền, các tài liệu sau dùng lại thuật ngữ đã giải thích ở đó. Ký hiệu dùng xuyên suốt:
- ✅ đã kiểm chứng
- ⚠️ giả định / cần xác nhận
- ⛔ đang bị chặn

## Danh sách tài liệu

| # | Tài liệu | Trả lời câu hỏi |
|---|---|---|
| 00 | [Nghiên cứu nền tảng](00_nghien_cuu_nen_tang.md) | AppEEARS, Giovanni, Harmony / HOSS là gì? CSV/NetCDF/GeoTIFF? xarray/rasterio? Reprojection, QA, scale factor, missing value là gì? |
| 01 | [Thiết kế Data Pipeline](01_thiet_ke_data_pipeline.md) | Các stage S0–S9; lưới toàn cầu 1°; luồng từ thao tác của người dùng trên web tới hàm phân tích; lớp `api.py` cho web và AI |
| 02 | [Adapter Specification cho Giovanni/AppEEARS](02_adapter_spec.md) | Endpoint, tham số, cách fetch/parse từng nguồn; schema chung |
| 03 | [Normalization & QA Checklist](03_normalization_qa_checklist.md) | Kiểm tra gì ở mỗi bước để không ra số sai? Đang dùng lựa chọn phương pháp nào? |
| 04 | [Kế hoạch triển khai](04_ke_hoach_trien_khai.md) | Tối nay làm gì, giờ nào làm gì trong 39 tiếng; hợp đồng với frontend / backend / AI; Plan B |
| 05 | [ML Feasibility Report: Contradiction Hunter](05_ml_feasibility_contradiction_hunter.md) | Tự tìm vùng ngược xu hướng thế nào? Cần ML đến đâu? Làm sao chắc mâu thuẫn là thật? |
| code | [pipeline/README.md](../pipeline/README.md) | File code nào ↔ mục tài liệu ↔ hàm chính ↔ test |

## Bức tranh tổng thể trong 30 giây

```
 Giovanni qua Harmony (GPM IMERG, GLDAS, MERRA-2)          AppEEARS (MODIS)
  mưa, ẩm đất, nhiệt độ không khí, bốc hơi                  NDVI, LST ngày/đêm, ET/PET
  HOSS: lưới gốc TOÀN CẦU, mỗi tháng 1 file                  point tại tâm ô đất liền 1°
        │  bin_to_grid → ô 1°, đổi đơn vị                         │  fill, scale, QA → tháng
        └──────────────────────┬──────────────────────────────────┘
                     cube_<biến>.nc  (288 tháng × 180 × 360 ô)
                               │
        ┌──────────────┬───────┴────────┬────────────────────┬──────────────────┐
   trend_map      analyze_region   find_contradictions   compare_regions   evidence_report
  (heatmap,       (vùng vẽ tay:     (tự tìm điểm nóng     (hai vùng chọn:   (nguồn, phương
   ~4 s toàn cầu)  Sen, MK, p, CI)   tăng/giảm + kiểm định) khác biệt + CI)   pháp, giới hạn)
        └──────────────┴────────────────┴──── AI Earth Detective gọi làm tool ──┘
```

Vùng mẫu (`config/regions.geojson`, hiện có 3 bbox ở Việt Nam làm ví dụ) lấy thêm dữ liệu AppEEARS 1 km và Giovanni area-average. Dữ liệu này chỉ để **kiểm chứng** lưới 1°, không giới hạn phạm vi phân tích.

Ý tưởng cốt lõi: **mỗi nguồn phức tạp theo kiểu riêng**.
- AppEEARS trả raster thô: ta phải tự che fill, nhân scale, lọc mây bằng bit QA.
- Giovanni/HOSS trả lưới gốc với độ phân giải khác nhau (0.1°, 0.25°, 0.5°) và đơn vị "lạ" (mưa theo mm/giờ, ẩm đất theo kg/m²).

Mỗi nguồn có một adapter "hấp thụ" sự phức tạp đó. Nhờ vậy, mọi bước sau chỉ làm việc với **một lưới duy nhất, cùng đơn vị, cùng lịch thời gian**.

## Giả định mặc định (team cần xác nhận hoặc sửa)

| Hạng mục | Mặc định | Tại sao |
|---|---|---|
| Challenge ⚠️ | **Be An Earth System Trend Detective!** | Resource có Giovanni + AppEEARS; challenge yêu cầu đúng chuỗi việc mà pipeline làm: chọn biến → lấy dữ liệu theo vùng → chuỗi thời gian → kiểm định significance |
| Nguồn dữ liệu ✅ (team chốt 13/11) | **AppEEARS + Giovanni**; Giovanni truy cập qua Harmony, **được dùng HOSS** để lấy lưới toàn cầu | Heatmap toàn cầu cần dữ liệu dạng lưới; Giovanni area-average chỉ trả một chuỗi cho mỗi bbox. HOSS dùng cùng tài khoản, cùng thư viện `harmony-py`, cùng collection |
| Phạm vi ✅ (team chốt 13/11) | **Toàn thế giới**, người dùng chọn vùng bất kỳ | Định hướng sản phẩm |
| Lưới phân tích | **1°** (180 × 360 ô) | Đủ mịn cho bản đồ thế giới; heatmap toàn cầu tính trong ~4 s nên đổi khoảng thời gian được ngay trên web; vùng < ~100 km không phân tích được (ghi vào giới hạn) |
| Thời gian ⚠️ | **01/2001 – 12/2024**, bước **tháng**; người dùng chọn khoảng con (trọn năm, ≥ 10 năm) | MODIS có từ 02/2000 → bắt đầu từ năm đủ đầu tiên. Kiểm định xu hướng cần chuỗi dài. Dừng ở 2024 để tránh năm chưa đủ dữ liệu và quỹ đạo Terra trôi gần đây (03, mục K) |
| Biến ⚠️ | Giovanni: **lượng mưa** (IMERG), **ẩm đất 0–10 cm**, **nhiệt độ không khí**, **bốc hơi** (GLDAS), **T2M** (MERRA-2). AppEEARS: **NDVI**, **LST ngày/đêm**, **ET + PET**; tĩnh: **land cover**, **DEM** | Phủ các biến ví dụ của web (mưa, ẩm đất, nhiệt độ) và chuỗi "mưa → ẩm đất → bốc thoát hơi → thực vật" |
| Chlorophyll ✅ (team chốt 13/11) | **Không làm**, ghi vào giới hạn | AppEEARS không có màu nước biển; Giovanni chỉ có NOBM (mô hình, không phải quan sát) |
| Công nghệ | Python; `requests` (AppEEARS), `harmony-py` (Giovanni / HOSS); `xarray`; output NetCDF (cube) + JSON | JSON thì frontend / backend stack nào cũng đọc được |

## Đã kiểm chứng vs. chưa kiểm chứng (tính đến 13/11/2026)

**✅ Đã kiểm chứng trực tiếp** (gọi API thật hoặc đọc tài liệu chính thức của NASA):

*AppEEARS*
- API hoạt động, có 193 product; scale factor / fill value / valid range / QA layer của MOD13A3, MOD11A2, MOD16A2GF, MCD12Q1, SRTMGL3 lấy trực tiếp từ `/api/product`.
- Output area request: `file_type` là `geotiff` hoặc `netcdf4`; projection có `native`, `geographic`… (tài liệu API chính thức).
- Bẫy QC của MOD11A2: FillValue = 0 cho `QC_Day`/`QC_Night`, nhưng QC = 0 là **chất lượng tốt nhất** → không bao giờ lọc QC theo fill value.
- AppEEARS **không có** GPM, GLDAS, MERRA-2, và không có sản phẩm MODIS lưới thô CMG (MOD13C2, MOD11C3).
- Request có quá nhiều file đầu ra bị từ chối (R2 vượt 31,4% → tách R2a/R2b). R1–R4 vùng mẫu đã gửi 13/11; **R1, R2a, R2b, R4 đã tải xong**, R3 (ET/PET) đang xử lý.
- File area NetCDF thật (R4): tên `<dataset>_<độ phân giải>_aid<NNNN>.nc` theo **thứ tự feature**, không theo id vùng; lưới `native` có chiều `xdim`/`ydim`, CRS nằm trong biến `crs`; `time` lịch julian. Ba điểm này từng làm hỏng code đọc vùng (không tìm thấy file, mask rỗng, lỗi đổi ngày) → đã sửa, có test hồi quy.
- Mask vùng của ta khớp số pixel trong `Statistics.csv` của AppEEARS (lệch 0,2–0,9%).
- Đường vùng mẫu chạy trên R1 NDVI + R2a/R2b LST thật (13/11, `build_regions.py` → `observations.parquet`): 288 tháng mỗi vùng × biến, validate và sanity đạt. LST ngày khớp nhịp GLDAS Tair (r = 0,77–0,94; LST > Tair 100% số tháng). Mây mùa mưa làm ĐBSCL còn 56% / 42% tháng LST ngày / đêm, nên chưa đủ để chạy xu hướng (03, K2).

*Giovanni / Harmony*
- Mọi ID biến trong tài liệu có trong `/configured-variables/`; chlorophyll chỉ có `NOBM_DAY_R2017_chl`.
- Harmony `/capabilities` của GPM_3IMERGM.07, GLDAS_NOAH025_M.2.1, M2IMNXASM.5.12.4 liệt kê `giovanni-averaging-service`, `giovanni-time-series-adapter`, `sds/HOSS-geographic` (NetCDF-4, cắt biến / bbox / thời gian).
- Tên biến HOSS: `Grid/precipitation`, `SoilMoi0_10cm_inst`, `Tair_f_inst`, `Evap_tavg`, `T2M`.
- Concept ID collection: GPM_3IMERGM v07 = `C2723754851-GES_DISC`, GLDAS_NOAH025_M v2.1 = `C1342986036-GES_DISC`, M2IMNXASM v5.12.4 = `C1276812823-GES_DISC`.
- Đăng nhập Harmony bằng tài khoản trong `.env` thành công (job HOSS được tạo).
- Job HOSS 1 tháng chạy được cho cả 3 collection (50–85 s). Cấu trúc file khớp `read_grid_file`. IMERG dùng lịch julian; GLDAS chỉ từ 60°S. `build_cube` trên file thật cho giá trị hợp lý (02 §4.6).
- Lưới toàn cầu đã tải xong (13/11): 5 cube 2001–2024 (288 tháng × 180 × 360 ô). Giá trị hợp lý (02 §4.6); 4 hàm API chạy được trên cube thật.
- Ẩm đất GLDAS = 1,0 m³/m³ cố định trên ô băng (03, K22).

*Pipeline*
- `grid_trend` khớp `pymannkendall.seasonal_test` từng ô; toàn cầu 1° × 24 năm ~4 s, 12 năm ~1 s; chuỗi vùng 4 ms; nhiễu thuần cho 0 ô significant sau FDR.
- 55 test đạt (`pytest`, dữ liệu giả, không gọi mạng).

**⛔ Đang bị chặn:** không còn. Lỗi HOSS `403` được gỡ ngày 13/11 sau khi authorize app GES DISC (04, T-1); lưới toàn cầu đã tải xong (T-4).

**⚠️ Chưa kiểm chứng:**
- Output AppEEARS đã nhân scale factor sẵn hay chưa → pipeline **tự phát hiện** khi đọc file (03, mục C).
- Số điểm tối đa mỗi AppEEARS point request; tốc độ xử lý thực tế.
- Đơn vị thực tế trong CSV area-average và dạng JSON của `/quota`, `/timeseries`.
- Giovanni area-average có trọng số cos(vĩ độ) không (03, K9).
