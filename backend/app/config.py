"""Cấu hình backend. Mọi giá trị đọc từ biến môi trường, có mặc định chạy được ngay trong repo."""
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
# Absolute path works with either backend or repository-root uvicorn commands.
# Existing process variables take precedence; never log environment contents.
load_dotenv(REPO_ROOT / "backend" / ".env", override=False)
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

# Dữ liệu bản mới của Long (14/11/2026): preprocess/clean.py ghi lưới 0,5° toàn cầu 2001–2025 vào
# data/processed/grid/<sản phẩm>.nc (vd. precip_imerg.nc). Biến nào đã có file ở đây thì backend dùng file này,
# chưa có thì quay về cube 1° cũ trong CUBE_DIR. Tắt hẳn bằng GRID_V2=0.
GRID_V2_DIR = Path(os.getenv("GRID_V2_DIR", str(PIPELINE_DIR / "data" / "processed" / "grid"))).resolve()
USE_GRID_V2 = os.getenv("GRID_V2", "1") != "0"

# Bản đồ đã tính được lưu ra đĩa (JSON nén gzip): khởi động lại backend không phải tính lại. Xoá thư mục này
# là tính lại từ đầu; khoá cache gồm thời điểm sửa file dữ liệu nên dữ liệu đổi thì tự tính lại.
GRID_CACHE_DIR = Path(os.getenv("GRID_CACHE_DIR", str(REPO_ROOT / "backend" / ".cache" / "grids"))).resolve()

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


@dataclass(frozen=True)
class LLMSettings:
    provider: str = "gemini"
    api_key: str = field(default="", repr=False)
    model: str = "gemini-4-argon"
    timeout: float = 30
    max_output_tokens: int = 1024
    requests_per_minute: int = 10
    valid: bool = True


def llm_settings() -> LLMSettings:
    """Invalid LLM settings disable the provider, never the statistics server."""
    try:
        timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", "30"))
        tokens = int(os.getenv("LLM_MAX_OUTPUT_TOKENS", "1024"))
        rpm = int(os.getenv("LLM_REQUESTS_PER_MINUTE", "10"))
        valid = 1 <= timeout <= 60 and 128 <= tokens <= 2048 and 1 <= rpm <= 120
    except ValueError:
        return LLMSettings(valid=False)
    return LLMSettings(
        provider=os.getenv("LLM_PROVIDER", "gemini").strip().lower(),
        api_key=os.getenv("GEMINI_API_KEY", "").strip(),
        model=os.getenv("GEMINI_MODEL", "gemini-4-argon").strip(),
        timeout=timeout, max_output_tokens=tokens, requests_per_minute=rpm, valid=valid,
    )
