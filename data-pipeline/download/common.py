"""Phần dùng chung của các script trong download/: khoảng thời gian, đăng nhập NASA Earthdata, tải file, chạy job
Harmony. Tài khoản đọc từ .env (EARTHDATA_USER, EARTHDATA_PASS) qua appeears.load_env()."""
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from appeears import load_env  # noqa: E402

START, END = "2001-01-01", "2025-12-31"    # khoảng phân tích chung
RAW = ROOT / "data" / "raw"
URS = "urs.earthdata.nasa.gov"


def credentials():
    """(user, pass) từ .env; nếu .env không có thì trả None để harmony-py và requests tự đọc ~/.netrc (_netrc trên
    Windows): máy đã đăng nhập bằng earthaccess thì không phải ghi mật khẩu ra file khác."""
    load_env()
    user, password = os.environ.get("EARTHDATA_USER"), os.environ.get("EARTHDATA_PASS")
    return (user, password) if user and password else None


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


def harmony_job(client, request, out_dir):
    """Gửi request Harmony (hoặc nối tiếp job ghi trong out_dir/job_id.txt), chờ xong, tải mọi file về out_dir.
    Không dùng client.wait_for_processing: nó hỏi /jobs/status, và Harmony thỉnh thoảng trả 400 với job dài.
    job_id.txt chỉ bị xoá khi đã tải hết, nên chạy lại giữa chừng sẽ tải tiếp file còn thiếu, không gửi job mới."""
    out_dir.mkdir(parents=True, exist_ok=True)
    job_file = out_dir / "job_id.txt"
    if job_file.exists():
        job_id = job_file.read_text().strip()
    else:
        job_id = client.submit(request)
        job_file.write_text(job_id)
    print(out_dir.name, "job", job_id, flush=True)
    while True:
        try:
            status = client.status(job_id).get("status")
        except Exception as e:                       # lỗi mạng tạm thời → hỏi lại sau
            print("status lỗi tạm thời:", str(e)[:100], flush=True)
            status = None
        if status in ("failed", "canceled"):
            sys.exit(f"Harmony job {job_id}: {status}")
        if status == "paused":                       # job > ~300 granule bị Harmony tự dừng sau bước xem trước
            client.resume(job_id)
        if status in ("successful", "complete_with_errors"):
            break
        time.sleep(30)
    while True:            # tải treo (client tạo với download_timeout) hoặc rớt mạng → tải lại, file đã đủ được bỏ qua
        try:
            files = [f.result() for f in client.download_all(job_id, directory=str(out_dir), overwrite=False)]
            break
        except Exception as e:
            print("tải lỗi, thử lại:", str(e)[:100], flush=True)
            time.sleep(30)
    if status == "complete_with_errors":             # giữ job_id.txt để xem lỗi: harmony.earthdata.nasa.gov/jobs/<id>
        sys.exit(f"Harmony job {job_id}: complete_with_errors, tải được {len(files)} file")
    job_file.unlink()
    return files
