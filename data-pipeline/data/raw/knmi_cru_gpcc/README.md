# KNMI Climate Explorer – mưa dạng lưới nội suy từ trạm đo (CRU TS, GPCC), toàn cầu

**Nguồn trên trang challenge:** "Royal Netherlands Meteorological Institute (KNMI) Climate Explorer" (partner resources).
KNMI Climate Explorer là công cụ web, không tự tạo dữ liệu mà phân phối lại các bộ quan trắc như CRU TS và GPCC. KNMI
bắt xác minh "người thật" nên không tải tự động qua KNMI được; hai bộ này được **tải thẳng từ nơi phát hành gốc**
(cùng dữ liệu, bản mới nhất). **Script:** `download/knmi_cru_gpcc.py` (không cần tài khoản).

**Dùng để làm gì:** nguồn mưa **dựa trên trạm đo**, độc lập với vệ tinh, để đối chiếu xu hướng mưa của IMERG/GLDAS
(Contradiction Hunter: chỗ nào vệ tinh và trạm nói ngược nhau).

## File (nguyên như nhà phát hành, một file mỗi thập kỷ, 6,7 GB)

| File | Bộ dữ liệu | Lưới (lat × lon) | Thời gian | Nguồn |
|---|---|---|---|---|
| `cru_ts4.10.{2001.2010,2011.2020,2021.2025}.pre.dat.nc` | CRU TS 4.10 (Đại học East Anglia) | 0,5°, 360 × 720 | 2001-01 → 2025-12 (300 tháng) | `crudata.uea.ac.uk/cru/data/hrg/cru_ts_4.10/` |
| `full_data_monthly_v2022_{2001_2010,2011_2020}_025.nc` | GPCC Full Data Monthly v2022 (DWD, Đức) | 0,25°, 720 × 1440 | 2001-01 → 2020-12 (240 tháng) | `opendata.dwd.de/climate_environment/GPCC/full_data_monthly_v2022/025/` |

Cả hai chỉ có trên đất liền (ô biển là fill). **GPCC v2022 dừng ở 2020**, nên trên cả 2001–2024 chỉ CRU có đủ.

## Biến

**CRU** (`time` là ngày 16 mỗi tháng; fill `9.96921e36`; lat tăng dần):

| Biến | Nghĩa | Đơn vị |
|---|---|---|
| `pre` | tổng mưa tháng | mm/tháng |
| `stn` | số trạm góp vào giá trị của ô (0–8) | trạm |
| `mae`, `maea` | sai số tuyệt đối trung bình giữa chuẩn sai trạm và chuẩn sai nội suy (và dạng chuẩn sai) | mm/tháng |

**GPCC** (`time` là ngày đầu tháng; fill `-99999.99`; **lat giảm dần**, từ bắc xuống nam):

| Biến | Nghĩa | Đơn vị |
|---|---|---|
| `precip` | tổng mưa tháng | mm/tháng |
| `numgauge` | số trạm đo nằm trong ô | trạm |
| `infilled_numgauges` | số trạm được điền bổ sung | trạm |
| `interpolation_error`, `interpolation_error_infilled` | sai số nội suy | mm/tháng |
| `diff_new_old_method` | chênh lệch giữa phương pháp nội suy mới và cũ | mm/tháng |

## Cần biết trước khi dùng (số liệu từ `reports/01_eda.md`)

- **CRU `stn = 0` ở 15,5 % ô-tháng trên đất liền**: không trạm nào trong bán kính tương quan, CRU điền khí hậu trung
  bình 1961–1990 chứ không phải quan trắc. Giữ lại thì xu hướng bị kéo về 0; `preprocess/clean.py` loại các ô này
  (bước QC, 3,7 % tổng số ô của lưới).
- **GPCC 0,25°: `numgauge = 0` ở 93,5 % ô đất liền**: giá trị nội suy từ trạm ở ô lân cận. Dùng `numgauge` để biết
  độ tin cậy; không lọc theo nó (lọc thì gần như không còn gì).
- Mật độ trạm đổi theo thời gian; xu hướng ở vùng ít trạm (châu Phi, Nam Mỹ, Trung Á) có thể phản ánh trạm xuất hiện /
  biến mất chứ không phải khí hậu thay đổi.
