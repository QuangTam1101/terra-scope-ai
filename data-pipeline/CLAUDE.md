# Terra-scope AI (NASA Space Apps 2026): data pipeline

Web app phân tích xu hướng môi trường cho **bất kỳ vùng nào trên thế giới**. 3 vùng Việt Nam trong `config/regions.geojson` chỉ là **vùng mẫu để kiểm chứng**, không phải phạm vi phân tích. Bức tranh chung và trạng thái: [docs/README.md](docs/README.md).

## Quy ước tài liệu
- Tài liệu bằng tiếng Việt, nằm ở `docs/00`–`05` và `docs/README.md`. Người dùng yêu cầu **không tạo tài liệu mới**; thay đổi thì sửa các file hiện có.
- Tài liệu chỉ trỏ tới code qua dòng **Code:**. Code nằm ở `pipeline/` (bảng file → mục tài liệu: [pipeline/README.md](pipeline/README.md)), test ở `tests/`.
- Sau mỗi quyết định, rà lại **mọi** tài liệu và code liên quan để chúng khớp nhau.

## Chạy
- Luôn chạy từ thư mục gốc dự án bằng `.venv/bin/python`. `pipeline/api.py` đọc cube theo đường dẫn tương đối `data/processed/cube_<biến>.nc`.
- Test không gọi mạng: `.venv/bin/python -m pytest -q tests`.
- Tài khoản Earthdata nằm trong `.env` (`EARTHDATA_USER`, `EARTHDATA_PASS`), đọc bằng `appeears.load_env()`. Người dùng tự điền; không in, không hỏi nội dung file này.
- Task AppEEARS chạy nhiều giờ. Nếu tiến trình chờ bị chết, tiếp tục bằng `appeears.py fetch TASK_ID OUT_DIR` (task ID lưu trong `data/raw/appeears/<tên>/task_id.txt`), đừng gửi lại request.

## Ràng buộc dễ sai (đã kiểm chứng)
- **File area NetCDF thật của AppEEARS** (R4, 13/11/2026):
  - Tên file là `<dataset>_<độ phân giải>_aid<NNNN>.nc`, đánh số theo **thứ tự feature** đã gửi, không theo id vùng.
  - Lưới `native` có CRS nằm trong biến `crs`; phải `set_coords("crs")` thì rioxarray mới đọc được.
  - `time` dùng lịch julian (cftime).

  Code đã xử lý ở `nc_files_for` và `raster_to_series`. Chi tiết: docs/02 §3.5.
- **Harmony:**
  - Request có `average` thì Harmony dùng dịch vụ trung bình của Giovanni.
  - Request có `variables` mà không có `average` thì Harmony dùng HOSS. Không truyền bbox nghĩa là lấy cả lưới toàn cầu.
  - Tên biến HOSS khác ID biến Giovanni (`HOSS_VARIABLES` trong `pipeline/giovanni_adapter.py`).
- **HOSS `403`:** nghĩa là tài khoản chưa authorize app GES DISC. Cách chẩn đoán: gọi thẳng một file trên `data.gesdisc.earthdata.nasa.gov`; Earthdata trả về `error_msg` kèm `resolution_url` (13/11/2026: https://urs.earthdata.nasa.gov/approve_app?client_id=e2WVk8Pw6weeLUKZYOxvTQ). Chỉ người dùng authorize được.
- **File HOSS thật** (13/11/2026):
  - IMERG ghi `time` theo lịch julian (cftime), giống AppEEARS.
  - GLDAS chỉ có từ 60°S; `build_cube` reindex về lưới 180 × 360.
  - Ẩm đất GLDAS = 1,0 m³/m³ cố định trên ô băng (docs/03 K22).
