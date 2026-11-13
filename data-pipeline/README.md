# Terra-scope AI – Data pipeline: dữ liệu thô cho lưu vực sông Mekong

**Đề bài** (NASA Space Apps 2026, "Be an Earth System Trend Detective"): xây một nền tảng địa không gian có AI hỗ trợ,
dùng dữ liệu mưa và độ ẩm đất của NASA để tìm **nơi** điều kiện môi trường đang thay đổi ở Hạ lưu vực Mekong,
**đo độ lớn** của xu hướng và **kiểm định ý nghĩa thống kê**.

**Phần này (data pipeline)** thu thập dữ liệu từ các nguồn trên trang Resources của challenge và cắt về vùng Mekong.
Hiện thư mục chỉ chứa **dữ liệu thô đã cắt vùng, giữ nguyên giá trị gốc**. Đổi đơn vị, lọc chất lượng (QA), đưa về
lưới chung và tính xu hướng là các bước sau, để luôn kiểm tra ngược lại được với số liệu của NASA.

## Vùng và thời gian

- **bbox 94–110°E, 8–35°N**: `config/mekong_bbox.geojson` và `BBOX` trong `download/common.py`. Bao toàn bộ lưu vực
  Mekong, từ thượng nguồn trên cao nguyên Tây Tạng xuống tới đồng bằng sông Cửu Long.
- **2001-01 → 2024-12**: `START`, `END` trong `download/common.py`. Một số nguồn ngắn hơn do bản chất dữ liệu (xem bảng).

## Nguồn dữ liệu (theo trang Resources của challenge)

| Tài nguyên trên trang challenge | Đã tải | Thời gian | Thư mục | Script |
|---|---|---|---|---|
| Giovanni | lưới tháng: mưa IMERG 0,1°; GLDAS 0,25° (độ ẩm đất 4 tầng + vùng rễ, nhiệt độ, bốc thoát hơi); nhiệt độ 2 m MERRA-2 | 2001–2024 | `data/raw/giovanni/` | `download/giovanni_hoss.py` |
| Hydrology Data Rods (đã ngừng, thay bằng Hydrology Time Series) | chuỗi IMERG 30 phút và GLDAS 3 giờ (mưa, độ ẩm đất) tại 11 trạm dòng chính | 2001–2024 | `data/raw/hydrology_timeseries/` | `download/hydrology_timeseries.py` |
| AppEEARS | SMAP độ ẩm đất 9 km/ngày cho cả bbox; MODIS NDVI, LST, ET/PET, lớp phủ, DEM cho 3 vùng Việt Nam | SMAP 2015–2024; MODIS 2001–2024 | `data/raw/appeears/` | `appeears.py` |
| Climate Data Online (CDO) | mưa tháng đo tại 123 trạm GHCN (GSOM) | theo trạm | `data/raw/cdo_gsom/` | `download/cdo_gsom.py` |
| Bài báo SeaWiFS chlorophyll | chlorophyll-a tháng 9 km, vùng biển trong bbox | 1997–2010 | `data/raw/seawifs/` | `download/seawifs.py` |
| KNMI Climate Explorer | mưa lưới từ trạm: CRU TS 4.10 (0,5°), GPCC v2022 (0,25°), tải từ nơi phát hành gốc | CRU 2001–2024; GPCC 2001–2020 | `data/raw/knmi_cru_gpcc/` | `download/knmi_cru_gpcc.py` |
| SWOT Mission | độ cao mặt nước sông (RiverSP reach) và hồ (LakeSP prior) | 2023–2024 | `data/raw/swot/` | `download/swot.py` |
| Radarsat Constellation Mission (RCM) | **không tải**: cần tài khoản EODMS của Canada và được CSA duyệt (chủ tài khoản phải tự đăng ký); là ảnh radar SAR, không phải mưa/độ ẩm đất | | | |
| Geo.ca | **không tải**: chỉ có dữ liệu cho lãnh thổ Canada | | | |
| Statistical test methods to detect trends; A Comprehensive Guide to Statistical Significance | không phải dữ liệu: phương pháp (Mann-Kendall, độ dốc Sen, p-value) cho bước tính xu hướng | | | |
| Monitoring and protecting our ecosystem from space; Synthetic Aperture Radar python Tutorial | không phải dữ liệu: tài liệu tham khảo (SAR tutorial đi kèm RCM) | | | |

Mỗi thư mục trong `data/raw/` có **README riêng**: nguồn, biến, đơn vị, lưới, định dạng file và các bẫy khi đọc.
Đọc README đó trước khi dùng dữ liệu.

### Các nguồn cho mưa và độ ẩm đất (trọng tâm đề bài)

| Đại lượng | Nguồn | Loại | Độ phân giải | Thời gian |
|---|---|---|---|---|
| Mưa | IMERG (Giovanni, Hydrology Time Series) | vệ tinh, hiệu chỉnh bằng trạm | 0,1°; tháng / 30 phút | 2001–2024 |
| Mưa | GLDAS Rainf (Hydrology Time Series) | đầu vào mô hình | 0,25°; 3 giờ | 2001–2024 |
| Mưa | CRU TS 4.10 | nội suy từ trạm | 0,5°; tháng | 2001–2024 |
| Mưa | GPCC v2022 | nội suy từ trạm | 0,25°; tháng | 2001–2020 |
| Mưa | CDO GSOM | trạm đo (điểm) | tháng | thưa, tuỳ trạm |
| Độ ẩm đất | GLDAS Noah (Giovanni, Hydrology Time Series) | mô hình | 0,25°; tháng / 3 giờ | 2001–2024 |
| Độ ẩm đất | SMAP SPL3SMP_E (AppEEARS) | vệ tinh, lớp mặt ~5 cm | 9 km; ngày | 2015-03 → 2024 |

## Cấu trúc thư mục

```
.
├── README.md                 ← file này
├── CLAUDE.md                 ← ghi chú kỹ thuật cho AI agent làm tiếp
├── requirements.txt
├── .env                      ← tài khoản Earthdata (tự tạo, KHÔNG commit)
├── appeears.py               ← client AppEEARS (gửi yêu cầu, chờ, tải)
├── config/
│   └── mekong_bbox.geojson   ← bbox nghiên cứu
├── download/                 ← mỗi nguồn một script tải
│   ├── common.py             ← bbox, thời gian, đăng nhập Earthdata, hàm tải và cắt dùng chung
│   ├── giovanni_hoss.py
│   ├── hydrology_timeseries.py
│   ├── cdo_gsom.py
│   ├── knmi_cru_gpcc.py
│   ├── swot.py
│   └── seawifs.py
└── data/raw/<nguồn>/         ← dữ liệu + README.md của từng nguồn (chỉ README được commit)
```

## Cài đặt

1. Python 3.11 trở lên, rồi cài thư viện:

   ```bash
   uv venv && uv pip install -r requirements.txt
   ```

2. Tài khoản NASA Earthdata (miễn phí, <https://urs.earthdata.nasa.gov>). Tạo file `.env` ở thư mục gốc:

   ```
   EARTHDATA_USER=<tên đăng nhập>
   EARTHDATA_PASS=<mật khẩu>
   ```

   Mọi script đọc tài khoản qua `load_env()` trong `appeears.py`; không ghi tài khoản vào code.
3. Trên trang Earthdata, mục *Applications → Authorized Apps*, duyệt ứng dụng **NASA GESDISC DATA ARCHIVE**.
   Thiếu bước này, Harmony/HOSS (Giovanni) sẽ trả lỗi 403.

## Chạy

Mỗi script tải một nguồn, chạy độc lập được và chạy song song được. Script bỏ qua file kết quả đã có, nên chạy lại
sau khi bị ngắt là an toàn. File tạm (`downloads/`, `months/`) bị xoá sau khi gộp xong.

```bash
.venv/bin/python download/giovanni_hoss.py
.venv/bin/python download/hydrology_timeseries.py
.venv/bin/python download/cdo_gsom.py
.venv/bin/python download/knmi_cru_gpcc.py
.venv/bin/python download/swot.py                  # ~2 000 file zip, lâu nhất (~1,5 giờ)
.venv/bin/python download/seawifs.py
```

AppEEARS (SMAP): gửi lại đúng yêu cầu đã lưu, hoặc tải lại kết quả theo mã task (xem `data/raw/appeears/README.md`):

```bash
.venv/bin/python appeears.py run data/raw/appeears/smap_SPL3SMP_E_mekong_AM/task.json data/raw/appeears/smap_SPL3SMP_E_mekong_AM
```

## Quy ước

- **Dữ liệu thô = giá trị gốc**, chỉ cắt theo bbox: lấy các ô lưới có **tâm** nằm trong bbox. Không đổi đơn vị,
  không lọc QA, không nội suy.
- File gộp đặt tên `<nguồn hoặc mã biến>_mekong_<thời gian>.<đuôi>`; NetCDF nén zlib.
- Không commit `.env` và dữ liệu (`.gitignore`); chỉ commit README trong `data/raw/<nguồn>/`.
