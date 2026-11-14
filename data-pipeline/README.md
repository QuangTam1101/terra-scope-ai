# Terra-scope AI – Data pipeline: dữ liệu toàn cầu → làm sạch → schema chung

**Đề bài** (NASA Space Apps 2026, "Be an Earth System Trend Detective"): xây một nền tảng địa không gian có AI hỗ trợ,
dùng dữ liệu mưa và độ ẩm đất của NASA để tìm **nơi** điều kiện môi trường đang thay đổi, **đo độ lớn** của xu hướng và
**kiểm định ý nghĩa thống kê**. Đề tài ban đầu nhắm Hạ lưu vực Mekong; từ 14/11/2026 pipeline làm trên **toàn cầu**
(Mekong là một vùng người dùng có thể chọn trên nền tảng).

**Phần này (data pipeline)** đưa dữ liệu từ các nguồn trên trang Resources của challenge về **một schema chung** để
bước sau tính xu hướng:

| Pha | Code | Đầu ra | Ghi chú |
|---|---|---|---|
| 1. Tải dữ liệu thô | `download/<nguồn>.py`, `appeears.py` | `data/raw/<nguồn>/` | nguyên như nhà phát hành, toàn cầu, không cắt, không gộp |
| 2a. EDA | `preprocess/eda.py` | `reports/01_eda.md` | đọc giá trị thô: lưới, trục, fill, scale, phân bố, cờ chất lượng |
| 2b. Làm sạch + schema chung | `preprocess/clean.py` | `data/processed/`, `reports/02_cleaning.md` | adapter → fill → scale/đơn vị → lọc → lưới 0,5° tháng |

Cách làm từng pha, lý do chọn kỹ thuật và hiệu quả đo được: [preprocess/README.md](preprocess/README.md).

## Thời gian

**2001-01 → 2024-12** (`START`, `END` trong `download/common.py` và `preprocess/clean.py`). Một số nguồn ngắn hơn do bản
chất dữ liệu: GPCC tới 2020, SeaWiFS 1997–2010, SMAP từ 04/2015.

## Nguồn dữ liệu (theo trang Resources của challenge)

| Tài nguyên trên trang challenge | Dữ liệu | Thời gian | Thư mục | Script |
|---|---|---|---|---|
| Giovanni | lưới tháng toàn cầu: mưa IMERG 0,1°; GLDAS 0,25° (độ ẩm đất 4 tầng + vùng rễ, nhiệt độ, bốc thoát hơi); nhiệt độ 2 m MERRA-2 | 2001–2024 | `data/raw/giovanni/` | `download/giovanni_hoss.py` |
| AppEEARS (SMAP) | độ ẩm đất SMAP 36 km hằng ngày, toàn cầu (qua Harmony; AppEEARS không nhận vùng cả địa cầu) | 2015-03 → 2024 | `data/raw/smap/` | `download/smap.py` |
| KNMI Climate Explorer | mưa lưới từ trạm: CRU TS 4.10 (0,5°), GPCC v2022 (0,25°), tải từ nơi phát hành gốc | CRU 2001–2025; GPCC 2001–2020 | `data/raw/knmi_cru_gpcc/` | `download/knmi_cru_gpcc.py` |
| Climate Data Online (CDO) | mưa tháng đo tại 81 148 trạm GHCN (GSOM) | theo trạm | `data/raw/cdo_gsom/` | `download/cdo_gsom.py` |
| Bài báo SeaWiFS chlorophyll | chlorophyll-a tháng 9 km, toàn cầu | 1997–2010 | `data/raw/seawifs/` | `download/seawifs.py` |
| AppEEARS (MODIS …) | **lấy theo vùng khi cần** (không nhận lưới toàn cầu) | | `data/raw/appeears/` | `appeears.py` |
| Hydrology Data Rods (đã ngừng → Hydrology Time Series) | **lấy theo điểm khi cần**: chuỗi IMERG 30 phút, GLDAS 3 giờ | 2001–2024 | `data/raw/hydrology_timeseries/` | `download/hydrology_timeseries.py` |
| SWOT Mission | **lấy theo vùng khi cần** (toàn cầu ≥ 680 GB): độ cao mặt nước sông, hồ | 2023–2024 | `data/raw/swot/` | `download/swot.py` |
| Radarsat Constellation Mission (RCM) | **không tải**: cần tài khoản EODMS của Canada và được CSA duyệt (chủ tài khoản phải tự đăng ký); ảnh radar SAR, không phải mưa/độ ẩm đất | | | |
| Geo.ca | **không tải**: chỉ có dữ liệu cho lãnh thổ Canada | | | |
| Statistical test methods to detect trends; A Comprehensive Guide to Statistical Significance | không phải dữ liệu: phương pháp (Mann-Kendall, độ dốc Sen, p-value) cho bước tính xu hướng | | | |
| Monitoring and protecting our ecosystem from space; Synthetic Aperture Radar python Tutorial | không phải dữ liệu: tài liệu tham khảo | | | |

Mỗi thư mục trong `data/raw/` có **README riêng**: nguồn, biến, đơn vị, lưới, định dạng file và các bẫy khi đọc.

### Mưa và độ ẩm đất (trọng tâm đề bài) sau khi làm sạch

| Đại lượng | Sản phẩm trong `data/processed/` | Loại | Lưới gốc | Thời gian |
|---|---|---|---|---|
| Mưa | `precip_imerg` | vệ tinh, hiệu chỉnh bằng trạm | 0,1° | 2001–2024 |
| Mưa | `precip_cru` | nội suy từ trạm | 0,5° | 2001–2024 |
| Mưa | `precip_gpcc` | nội suy từ trạm | 0,25° | 2001–2020 |
| Mưa | `precip_gsom` (bảng trạm) | trạm đo (điểm) | | tuỳ trạm |
| Độ ẩm đất | `sm_{0_10,10_40,40_100,100_200}cm_gldas`, `rootmoist_gldas` | mô hình Noah | 0,25° | 2001–2024 |
| Độ ẩm đất | `sm_surface_smap` | vệ tinh, lớp mặt ~5 cm | 36 km | 2015-04 → 2024 |

Thêm `tair_gldas`, `t2m_merra2` (nhiệt độ), `evap_gldas` (bốc thoát hơi), `chlor_a_seawifs` làm biến bối cảnh.

## Cấu trúc thư mục

```
.
├── README.md                 ← file này
├── CLAUDE.md                 ← ghi chú kỹ thuật cho AI agent làm tiếp
├── requirements.txt
├── .env                      ← tài khoản Earthdata (tự tạo, KHÔNG commit)
├── appeears.py               ← client AppEEARS (gửi yêu cầu, chờ, tải)
├── download/                 ← pha 1: mỗi nguồn một script tải
│   ├── common.py             ← thời gian, đăng nhập Earthdata, tải file, chạy job Harmony
│   ├── giovanni_hoss.py
│   ├── smap.py
│   ├── knmi_cru_gpcc.py
│   ├── cdo_gsom.py
│   ├── seawifs.py
│   ├── hydrology_timeseries.py   ← theo điểm, khi cần
│   └── swot.py                   ← theo vùng, khi cần
├── preprocess/               ← pha 2: EDA, làm sạch, schema chung (README giải thích từng kỹ thuật)
│   ├── eda.py
│   └── clean.py
├── reports/                  ← báo cáo sinh tự động: 01_eda.md, 02_cleaning.md (+ .json)
└── data/
    ├── raw/<nguồn>/          ← dữ liệu thô + README.md của từng nguồn (chỉ README được commit)
    └── processed/            ← grid/<sản phẩm>.nc, stations/precip_gsom.parquet (không commit)
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
   Thiếu bước này, Harmony (Giovanni) trả lỗi 403.

## Chạy

Mỗi script chạy độc lập được và chạy song song được; bỏ qua file kết quả đã có, nên chạy lại sau khi bị ngắt là tiếp
tục. Dung lượng thô ~27 GB.

```bash
.venv/bin/python download/giovanni_hoss.py         # 9 biến × 288 tháng, 3,5 GB
.venv/bin/python download/smap.py 2015 2016        # vài tiến trình song song, giữ máy thức; ~3 600 ngày, ~8 GB
.venv/bin/python download/knmi_cru_gpcc.py         # 6,7 GB
.venv/bin/python download/cdo_gsom.py              # 6,8 GB sau giải nén
.venv/bin/python download/seawifs.py               # 1,9 GB
.venv/bin/python preprocess/eda.py                 # → reports/01_eda.md
.venv/bin/python preprocess/clean.py               # → data/processed/, reports/02_cleaning.md (vài chục phút)
.venv/bin/python preprocess/clean.py --check       # tự kiểm phần nội suy, vài giây
```

Công cụ theo yêu cầu (vùng / điểm người dùng chọn):

```bash
.venv/bin/python download/hydrology_timeseries.py phnom_penh 11.58 104.94
.venv/bin/python download/swot.py tonle_sap 103.5 12.3 104.9 13.5
.venv/bin/python appeears.py area VUNG.geojson MOD13A3.061:_1_km_monthly_NDVI 01-01-2001 12-31-2024 data/raw/appeears/vung netcdf4
```

## Quy ước

- **`data/raw/` = dữ liệu như nhà phát hành giao**: không cắt vùng, không gộp file, không đổi đơn vị, không lọc.
  Mọi xử lý nằm ở `preprocess/` để luôn kiểm tra ngược lại được với số liệu gốc.
- **Schema chung** (`data/processed/grid/<sản phẩm>.nc`): một biến tên = tên sản phẩm, trục `(time, lat, lon)`,
  float32, NaN = không có dữ liệu, `time` = ngày đầu tháng, lưới 0,5° toàn cầu, đơn vị chuẩn ghi trong `units`.
- Không commit `.env` và dữ liệu (`.gitignore`); chỉ commit README trong `data/raw/<nguồn>/`.
