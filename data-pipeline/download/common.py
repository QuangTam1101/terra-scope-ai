"""Phần dùng chung của các script trong download/: vùng nghiên cứu, khoảng thời gian, đăng nhập NASA Earthdata,
tải file, cắt theo bbox. Tài khoản đọc từ .env (EARTHDATA_USER, EARTHDATA_PASS) qua appeears.load_env()."""
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from appeears import load_env  # noqa: E402

BBOX = (94.0, 8.0, 110.0, 35.0)            # W, S, E, N — giống config/mekong_bbox.geojson
START, END = "2001-01-01", "2024-12-31"    # khoảng phân tích chung
RAW = ROOT / "data" / "raw"
URS = "urs.earthdata.nasa.gov"


def credentials():
    load_env()
    return os.environ["EARTHDATA_USER"], os.environ["EARTHDATA_PASS"]


def edl_token():
    """Bearer token Earthdata (API Giovanni Time Series cần)."""
    r = requests.post(f"https://{URS}/api/users/find_or_create_token", auth=credentials(), timeout=60)
    r.raise_for_status()
    return r.json()["access_token"]


class EarthdataSession(requests.Session):
    """requests bỏ tài khoản khi bị chuyển hướng sang host khác; Earthdata Login cần giữ nó khi đi qua urs."""

    def __init__(self):
        super().__init__()
        self.auth = credentials()

    def rebuild_auth(self, prepared, response):
        old, new = (requests.utils.urlparse(u).hostname for u in (response.request.url, prepared.url))
        if "Authorization" in prepared.headers and old != new and URS not in (old, new):
            del prepared.headers["Authorization"]


def download(url, path, session=None):
    """Tải về path, bỏ qua nếu đã có. Ghi ra .part rồi mới đổi tên, nên file dở dang không bị coi là xong."""
    path = Path(path)
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".part")
    with (session or requests).get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    tmp.rename(path)
    return path


def crop(ds, lat="lat", lon="lon"):
    """Giữ các ô có tâm nằm trong BBOX; chạy được cả khi trục lat tăng hay giảm."""
    w, s, e, n = BBOX
    lat_slice = slice(s, n) if ds[lat][0] < ds[lat][-1] else slice(n, s)
    return ds.sel({lat: lat_slice, lon: slice(w, e)})
