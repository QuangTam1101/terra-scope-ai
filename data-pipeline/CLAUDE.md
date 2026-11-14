# Terra-scope AI (NASA Space Apps 2026): data pipeline, toàn cầu

Phạm vi: **toàn cầu** (từ 14/11/2026; trước đó là bbox Mekong), 2001–2025 (`START`/`END` ở `download/common.py` và
`preprocess/eda.py`), trọng tâm mưa + độ ẩm đất. Tổng quan, nguồn, cách chạy: [README.md](README.md). Kỹ thuật làm
sạch, kiểm chứng và lý do: [preprocess/README.md](preprocess/README.md). Mỗi `data/raw/<nguồn>/README.md` mô tả dữ
liệu của nguồn đó.

## Quy ước
- Tài liệu bằng tiếng Việt. Người dùng không muốn file code thừa: mỗi nguồn một script trong `download/`, phần dùng
  chung ở `download/common.py`; tiền xử lý chỉ có `preprocess/eda.py`, `preprocess/clean.py` và `preprocess/verify.py`
  (kiểm chứng: cố ý không import hàm xử lý nào của `clean.py`, để là bằng chứng độc lập). Đổi quyết định nào thì rà
  lại mọi README và code liên quan cho khớp.
- `data/raw/` giữ file **như nhà phát hành giao** (toàn cầu, không cắt, không gộp, không đổi đơn vị). Mọi xử lý ở
  `preprocess/`, đầu ra `data/processed/`, báo cáo sinh tự động ở `reports/` (`02_cleaning.json` giữ dòng của sản
  phẩm chạy trước; chạy lại một sản phẩm chỉ thay dòng đó).
- Chạy từ thư mục gốc bằng `.venv/bin/python download/<script>.py`. Script bỏ qua file kết quả đã có, nên chạy lại
  là tiếp tục. `preprocess/clean.py --check` tự kiểm phần nội suy;
  sửa `clean.py` thì chạy lại `preprocess/verify.py` (tính lại độc lập từ file thô, phải khớp 100 % ô).
- Tài khoản Earthdata nằm trong `.env` (`EARTHDATA_USER`, `EARTHDATA_PASS`), đọc qua `appeears.load_env()`. Người
  dùng tự điền; không in, không hỏi nội dung. Duyệt app Earthdata, tạo tài khoản (EODMS cho RCM…) là việc của người dùng.
- Repo nhóm: `terra-scope-ai/` (checkout riêng), branch `data-pipeline`, thư mục `data-pipeline/`. Chỉ push khi người
  dùng đồng ý. `.gitignore` chỉ cho commit `data/raw/*/README.md` trong `data/`.

## Ràng buộc dễ sai (đã kiểm chứng 13–14/11/2026)
- **Hydrology Data Rods đã ngừng** (sau 31/10/2025). Thay bằng API
  `https://api.giovanni.earthdata.nasa.gov/timeseries` (Bearer token từ
  `POST https://urs.earthdata.nasa.gov/api/users/find_or_create_token`); danh sách biến ở `/configured-variables/`.
- **Harmony/HOSS:** request có `variables` mà không có `average` thì chạy HOSS; không truyền `spatial` thì nhận cả lưới
  toàn cầu (cách đang dùng). Biến IMERG trong HOSS là `Grid/precipitation` (file trả về có group `Grid`, trục
  `(time, lon, lat)`). Dùng `harmony_job()` trong `download/common.py`, đừng dùng `client.wait_for_processing` (hỏi
  `/jobs/status`, đôi khi bị 400). Job > ~300 granule bị Harmony tự `paused` sau bước xem trước; `harmony_job()` tự
  `client.resume()`. Chỗ chậm là tải từng file, không phải xử lý (mỗi tiến trình ~18 file/phút; chạy vài tiến trình,
  mỗi tiến trình một năm khác nhau, không bao giờ hai tiến trình cùng một thư mục). Máy ngủ (gập máy khi chạy pin) thì
  kết nối treo: client tạo với `download_timeout=120`, `harmony_job()` tự tải lại; nếu tiến trình vẫn đứng (0 CPU,
  số file không tăng) thì kill theo PID (đừng `pkill -f`, dễ trúng lệnh khác) rồi chạy lại, job tiếp tục từ
  `job_id.txt`. Lỗi `403` nghĩa là tài khoản chưa duyệt app của trung tâm dữ liệu (GES DISC cho Giovanni).
  IMERG Final ra sau ~3,5 tháng (14/11/2026 mới tới 09/2025).
- **Tên file Harmony bắt đầu bằng số thứ tự job**, không theo thời gian: sắp xếp theo ngày trong tên granule.
- **Lịch julian:** IMERG (HOSS) và mọi NetCDF của AppEEARS ghi `time` bằng `cftime.DatetimeJulian`. Đổi sang pandas
  bằng `to_datetimeindex(unsafe=True, time_unit="ns")`, giữ nguyên ngày/tháng/năm.
- **MERRA-2 có tâm ô tại −180°** (ô vắt qua kinh tuyến 180): khi nội suy theo lon phải cộng phần chồng lấn của lưới
  nguồn dịch ±360°, nếu không cột 179,75° của lưới đích bị mất.
- **Toạ độ float32:** IMERG, SeaWiFS lưu lat/lon float32 (lệch tới 1,5e-5°). Biên ô tính thẳng từ đó làm một mẩu ô
  bên cạnh lọt vào trung bình (0 mm thành 2e-6, lệch ~1e-4); `edges()` trong `clean.py` làm tròn hai biên ngoài rồi
  chia đều. Ô phủ đúng 50 % là chuyện thường (ô ven bờ), nên so ngưỡng với dung sai 1e-9.
- **GLDAS:** ô băng (3,95 % ô đất liền) có θ = 1 ở mọi tầng `SoilMoi*` và `RootMoist` hằng 100 kg/m²; RootMoist không
  nhận ra băng từ giá trị nên `clean.py` dùng tầng 0–10 cm cùng tháng. **`RootMoist` có độ sâu vùng rễ thay đổi theo
  lớp thực vật**: ô nông nghiệp = đúng tổng 0–100 cm, ô rừng ≈ 0,93 × tổng 0–200 cm. Không chia cho độ dày cố định.
- **SMAP SPL3SMP (36 km, EASE-Grid 2.0, EPSG:6933):** `latitude`/`longitude` trong file chỉ có ở ô có dữ liệu; tính từ
  `x`, `y` bằng pyproj. Bit 0 của `retrieval_qual_flag` = 1 là chất lượng không khuyến nghị (~42 % ô có giá trị;
  rừng nhiệt đới ~100 %, nên SMAP sạch chỉ phủ 60 % đất liền, gần như không có Amazon, Congo, Mekong).
- **GSOM `PRCP_ATTRIBUTES` = `a,M,Q,S`**: số ngày thiếu, cờ đo, cờ chất lượng, mã nguồn (tài liệu GSOM của NCEI). Cờ
  chất lượng luôn rỗng; GSOM vẫn tính tổng tháng khi thiếu 1–5 ngày; nguồn `S` (synop GTS) NCEI khuyên dùng thận trọng.
- **CRU `stn = 0`**: không có trạm, giá trị là khí hậu trung bình, không phải quan trắc → loại.
- **AppEEARS** (công cụ theo vùng, không dùng cho toàn cầu): tên `<dataset>_<res>_aid<NNNN>.nc` đánh số theo thứ tự
  feature gửi lên; lưới MODIS sinusoidal, CRS trong biến `crs`; QC = 0 là tốt nhất nhưng bị khai báo `_FillValue` (mở
  QC với `mask_and_scale=False`); sản phẩm 8 ngày có thêm kỳ 26/12/2000. Yêu cầu quá nhiều file bị từ chối ("exceeds
  maximum"): tách theo lớp. Task chạy nhiều giờ; nếu tiến trình chờ chết, dùng `appeears.py fetch TASK_ID OUT_DIR`.
- **KNMI Climate Explorer** bắt xác minh người thật: không tự động hoá, không vượt. CRU/GPCC tải từ nơi phát hành gốc.
- **SeaWiFS (CMR `SeaWiFS_L3m_CHL`):** dùng link có `rel` kết thúc bằng `/data#` (obdaac-tea). Link `service#` là
  OPeNDAP, trả 429 khi tải nhiều file.
- **SWOT** (công cụ theo bbox; toàn cầu ≥ 680 GB): RiverSP chứa mọi đoạn sông của lượt quét, kể cả đoạn không quan sát
  được (`time_str == "no_data"`, fill `-1e12`). Hình đoạn sông lặp y hệt ở mọi lượt (~95 % dung lượng) nên
  `download/swot.py` lưu riêng một lần. Một số lượt được phát hành lại (`_PGD0_01` → `_02`, giờ bắt đầu lệch 1 giây,
  giá trị trùng): khử trùng theo (chu kỳ, lượt, châu lục), giữ số đếm lớn nhất (`latest()`).
- WebFetch ở máy này lỗi SSL ("unable to get local issuer certificate"); đọc trang web bằng built-in browser.
