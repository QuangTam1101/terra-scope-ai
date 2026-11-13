# KNMI Climate Explorer – mưa dạng lưới nội suy từ trạm đo (CRU TS, GPCC)

**Nguồn trên trang challenge:** "Royal Netherlands Meteorological Institute (KNMI) Climate Explorer" (partner resources).
KNMI Climate Explorer là công cụ web; nó không tự tạo dữ liệu mà phân phối lại các bộ quan trắc như CRU TS và GPCC.
KNMI bắt xác minh "người thật" trước khi dùng nên không tải tự động qua KNMI được; vì vậy hai bộ này được **tải thẳng
từ nơi phát hành gốc** (cùng dữ liệu, bản mới nhất).
**Script:** `download/knmi_cru_gpcc.py` (không cần tài khoản).

**Dùng để làm gì:** một nguồn mưa thứ hai **dựa trên trạm đo**, độc lập với vệ tinh, để đối chiếu xu hướng mưa của
IMERG/GLDAS (Contradiction Hunter: chỗ nào vệ tinh và trạm nói ngược nhau).

## File

| File | Bộ dữ liệu | Lưới (lat × lon) | Thời gian | Nguồn |
|---|---|---|---|---|
| `cru_ts4.10_pre_mekong_2001-2024.nc` | CRU TS 4.10 (Đại học East Anglia) | 0,5° (54 × 32) | 2001-01 → 2024-12 (288 tháng) | `crudata.uea.ac.uk/cru/data/hrg/cru_ts_4.10/` |
| `gpcc_v2022_025_mekong_2001-2020.nc` | GPCC Full Data Monthly v2022 (DWD, Đức) | 0,25° (108 × 64) | 2001-01 → 2020-12 (240 tháng) | `opendata.dwd.de/climate_environment/GPCC/full_data_monthly_v2022/025/` |

Cắt các ô có tâm trong bbox 94–110°E, 8–35°N; giá trị giữ nguyên. Cả hai chỉ có trên đất liền (ô biển là NaN).
**GPCC v2022 dừng ở 2020**, nên phân tích chung giai đoạn 2001–2024 chỉ dùng được CRU.

## Biến

**CRU** (`time` là ngày 16 mỗi tháng):

| Biến | Nghĩa | Đơn vị |
|---|---|---|
| `pre` | tổng mưa tháng | mm/tháng |
| `stn` | số trạm góp vào giá trị của ô (0–8) | trạm |
| `mae` | trung bình chênh lệch tuyệt đối giữa chuẩn sai của các trạm và chuẩn sai nội suy (mô tả của CRU) | mm/tháng |
| `maea` | `mae` dạng chuẩn sai so với trung bình dài hạn | |

**GPCC** (`time` là ngày đầu tháng):

| Biến | Nghĩa | Đơn vị |
|---|---|---|
| `precip` | tổng mưa tháng | mm/tháng |
| `numgauge` | số trạm đo nằm trong ô | trạm |
| `infilled_numgauges` | số trạm được điền bổ sung | trạm |
| `interpolation_error`, `interpolation_error_infilled` | sai số nội suy (Yamamoto) | mm/tháng |
| `diff_new_old_method` | chênh lệch giữa phương pháp nội suy mới và cũ | mm/tháng |

## Cần biết trước khi dùng

- **Ô có `stn = 0` (CRU) không có trạm nào đóng góp**: CRU điền giá trị khí hậu trung bình, không phải quan trắc
  của tháng đó (khoảng 3 % ô-tháng trên đất liền trong bbox). Ô như vậy kéo xu hướng về 0; nên loại hoặc đánh dấu.
- **GPCC 0,25°: khoảng 95 % ô-tháng có `numgauge = 0`**, tức giá trị được nội suy từ trạm ở ô lân cận. Ô có trạm
  thật rất thưa; dùng `numgauge` để biết độ tin cậy.
- Mật độ trạm thay đổi theo thời gian; xu hướng ở vùng ít trạm (miền núi Lào, Myanmar) có thể phản ánh việc trạm
  xuất hiện/biến mất chứ không phải khí hậu thay đổi.
