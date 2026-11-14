"""Mưa dạng lưới từ trạm đo mà KNMI Climate Explorer cung cấp (CRU TS, GPCC), TOÀN CẦU, tải thẳng từ nơi phát hành
gốc, vì KNMI bắt xác minh "người thật" trước khi dùng nên không tải tự động qua KNMI được.
- CRU TS 4.10 (Đại học East Anglia): mưa tháng 0,5°, nội suy từ trạm, tới 2025.
- GPCC Full Data Monthly v2022 (DWD, Đức): mưa tháng 0,25°, tới 2020, kèm số trạm đo trong mỗi ô.
Chạy:    .venv/bin/python download/knmi_cru_gpcc.py
Kết quả: data/raw/knmi_cru_gpcc/<tên file gốc bỏ .gz>.nc, một file mỗi thập kỷ như nhà phát hành chia
         (CRU 2001–2010, 2011–2020, 2021–2025; GPCC 2001–2010, 2011–2020). Giải nén xong thì xoá file .gz."""
import gzip
import shutil

from common import RAW, download

CRU = "https://crudata.uea.ac.uk/cru/data/hrg/cru_ts_4.10/cruts.2604091129.v4.10/pre"
GPCC = "https://opendata.dwd.de/climate_environment/GPCC/full_data_monthly_v2022/025"
URLS = ([f"{CRU}/cru_ts4.10.{a}.{b}.pre.dat.nc.gz" for a, b in [(2001, 2010), (2011, 2020), (2021, 2025)]]
        + [f"{GPCC}/full_data_monthly_v2022_{a}_{b}_025.nc.gz" for a, b in [(2001, 2010), (2011, 2020)]])

if __name__ == "__main__":
    for url in URLS:
        nc = RAW / "knmi_cru_gpcc" / url.rsplit("/", 1)[1].removesuffix(".gz")
        if nc.exists():
            continue
        gz = download(url, nc.with_name(nc.name + ".gz"))
        part = nc.with_name(nc.name + ".part")
        with gzip.open(gz) as src, open(part, "wb") as dst:
            shutil.copyfileobj(src, dst, 1 << 20)
        part.rename(nc)
        gz.unlink()
        print("ghi", nc, flush=True)
