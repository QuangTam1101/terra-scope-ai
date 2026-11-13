# Terra-scope AI (NASA Space Apps 2026): data pipeline, lưu vực Mekong

Phạm vi: bbox 94–110°E, 8–35°N, giai đoạn 2001–2024, trọng tâm mưa + độ ẩm đất. Tổng quan, nguồn, cách chạy:
[README.md](README.md). Mỗi `data/raw/<nguồn>/README.md` mô tả dữ liệu của nguồn đó.

## Quy ước
- Tài liệu bằng tiếng Việt. Người dùng không muốn file code thừa: mỗi nguồn một script trong `download/`, phần dùng
  chung ở `download/common.py`. Đổi quyết định nào thì rà lại mọi README và code liên quan cho khớp.
- `data/raw/` chỉ chứa giá trị gốc đã cắt theo bbox (ô có tâm trong bbox). Đổi đơn vị, QA, nội suy thuộc bước sau.
- Chạy từ thư mục gốc bằng `.venv/bin/python download/<script>.py`. Script bỏ qua file kết quả đã có, nên chạy lại
  là tiếp tục.
- Tài khoản Earthdata nằm trong `.env` (`EARTHDATA_USER`, `EARTHDATA_PASS`), đọc qua `appeears.load_env()`. Người
  dùng tự điền; không in, không hỏi nội dung. Duyệt app Earthdata, tạo tài khoản (EODMS cho RCM…) là việc của người dùng.
- Repo nhóm: `terra-scope-ai/` (checkout riêng), branch `data-pipeline`, thư mục `data-pipeline/`. Chỉ push khi người
  dùng đồng ý. `.gitignore` chỉ cho commit `data/raw/*/README.md` trong `data/`.

## Ràng buộc dễ sai (đã kiểm chứng 13/11/2026)
- **Hydrology Data Rods đã ngừng** (sau 31/10/2025). Thay bằng API
  `https://api.giovanni.earthdata.nasa.gov/timeseries` (Bearer token từ
  `POST https://urs.earthdata.nasa.gov/api/users/find_or_create_token`); danh sách biến ở `/configured-variables/`.
- **Harmony/HOSS:** request có `variables` mà không có `average` thì chạy HOSS; phải truyền `spatial=BBox(...)`,
  nếu không sẽ nhận cả lưới toàn cầu. Biến IMERG trong HOSS là `Grid/precipitation` (file trả về có group `Grid`).
  Đừng dùng `client.wait_for_processing` (hỏi `/jobs/status`, đôi khi bị 400); dùng `wait_job()` trong
  `download/giovanni_hoss.py`. Lỗi `403` nghĩa là tài khoản chưa duyệt app NASA GESDISC DATA ARCHIVE.
- **Lịch julian:** IMERG (HOSS) và mọi NetCDF của AppEEARS ghi `time` bằng `cftime.DatetimeJulian`. Đổi sang pandas
  bằng `to_datetimeindex(unsafe=True, time_unit="ns")`, giữ nguyên ngày/tháng/năm.
- **AppEEARS area NetCDF:** tên `<dataset>_<res>_aid<NNNN>.nc` đánh số theo thứ tự feature gửi lên; lưới MODIS
  sinusoidal, CRS trong biến `crs`; QC = 0 là tốt nhất nhưng bị khai báo `_FillValue` (mở QC với
  `mask_and_scale=False`); sản phẩm 8 ngày có thêm kỳ 26/12/2000. Yêu cầu quá nhiều file bị từ chối ("exceeds
  maximum"): tách theo lớp (SMAP tách AM/PM). Task chạy nhiều giờ; nếu tiến trình chờ chết, dùng
  `appeears.py fetch TASK_ID OUT_DIR`, đừng gửi lại.
- **GLDAS `RootMoist` có độ sâu vùng rễ thay đổi theo lớp thực vật**: ô nông nghiệp = đúng tổng 0–100 cm, ô rừng
  ≈ 0,93 × tổng 0–200 cm (so với tổng các tầng `SoilMoi*`). Không chia cho độ dày cố định để ra m³/m³.
- **KNMI Climate Explorer** bắt xác minh người thật: không tự động hoá, không vượt. CRU/GPCC tải từ nơi phát hành gốc.
- **SeaWiFS (CMR `SeaWiFS_L3m_CHL`):** dùng link có `rel` kết thúc bằng `/data#` (obdaac-tea). Link `service#` là
  OPeNDAP, trả 429 khi tải nhiều file.
- **SWOT:** RiverSP chứa mọi đoạn sông của lượt quét, kể cả đoạn không quan sát được (`time_str == "no_data"`, fill
  `-1e12`). Hình đoạn sông lặp y hệt ở mọi lượt (~95 % dung lượng) nên `download/swot.py` lưu riêng một lần. Một số lượt
  được NASA phát hành lại (`_PGD0_01` → `_02`, giờ bắt đầu trong tên lệch 1 giây, giá trị trùng): khử trùng theo
  (chu kỳ, lượt, châu lục), giữ số đếm lớn nhất (`latest()`).
- WebFetch ở máy này lỗi SSL ("unable to get local issuer certificate"); đọc trang web bằng built-in browser.
