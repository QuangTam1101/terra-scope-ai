"""Cấu hình backend. Mọi giá trị đọc từ biến môi trường, có mặc định chạy được ngay trong repo."""
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
VERSION = "0.2.0"

# Thư mục data-pipeline của Long (chứa package `pipeline`) và thư mục cube lưới 1°.
PIPELINE_DIR = Path(os.getenv("PIPELINE_DIR", str(REPO_ROOT / "data-pipeline"))).resolve()


def _default_cube_dir() -> Path:
    """Bản đồ TOÀN CẦU (đội chốt 13/11/2026): cube lưới 1° do Long chia sẻ trong git (data-pipeline/processed_data/grid).
    Không có thì dùng cube tự tạo bằng download_grid.py (data/processed/grid). Cube lưới mịn vùng Mekong
    (data/processed/regions/mekong) chỉ dùng khi đặt CUBE_DIR trỏ tới nó."""
    shared = PIPELINE_DIR / "processed_data" / "grid"
    return shared if any(shared.glob("cube_*.nc")) else PIPELINE_DIR / "data" / "processed" / "grid"


CUBE_DIR = Path(os.getenv("CUBE_DIR") or _default_cube_dir()).resolve()

# Domain frontend được gọi API (dev Vite mặc định chạy ở cổng 5173). Thêm domain deploy qua CORS_ORIGINS.
CORS_ORIGINS = [o.strip() for o in os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

# Giới hạn vùng (contract v0.2 §4.3).
MAX_BBOX_AREA_DEG2 = float(os.getenv("MAX_BBOX_AREA_DEG2", "64800"))   # 360 × 180: cho phép cả thế giới
MIN_CELLS = 1                 # vùng phải chứa ít nhất 1 tâm ô lưới
CELL_SIZE_DEG = 1.0           # cỡ ô mặc định khi chưa có cube; cỡ thật đọc từ cube (bridge.meta)

DEFAULT_ALPHA = 0.05

if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))
