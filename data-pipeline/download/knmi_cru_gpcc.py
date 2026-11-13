"""Mưa dạng lưới từ trạm đo mà KNMI Climate Explorer cung cấp (CRU TS, GPCC), tải thẳng từ nơi phát hành gốc,
vì KNMI bắt xác minh "người thật" trước khi dùng nên không tải tự động qua KNMI được.
- CRU TS 4.10 (Đại học East Anglia): mưa tháng 0,5°, nội suy từ trạm, tới 2025.
- GPCC Full Data Monthly v2022 (DWD, Đức): mưa tháng 0,25°, tới 2020, kèm số trạm đo trong mỗi ô.
Chạy:    .venv/bin/python download/knmi_cru_gpcc.py
Kết quả: data/raw/knmi_cru_gpcc/cru_ts4.10_pre_mekong_2001-2024.nc, gpcc_v2022_025_mekong_2001-2020.nc
         (ô có tâm trong bbox, giá trị gốc). File gốc .nc.gz tải về downloads/ rồi bị xoá sau khi cắt."""
import gzip
import shutil

import xarray as xr

from common import RAW, crop, download

CRU = "https://crudata.uea.ac.uk/cru/data/hrg/cru_ts_4.10/cruts.2604091129.v4.10/pre"
GPCC = "https://opendata.dwd.de/climate_environment/GPCC/full_data_monthly_v2022/025"
FILES = {  # file kết quả → (các file .nc.gz theo thập kỷ, năm đầu, năm cuối)
    "cru_ts4.10_pre_mekong_2001-2024.nc": ([f"{CRU}/cru_ts4.10.{a}.{b}.pre.dat.nc.gz"
                                            for a, b in [(2001, 2010), (2011, 2020), (2021, 2025)]], 2001, 2024),
    "gpcc_v2022_025_mekong_2001-2020.nc": ([f"{GPCC}/full_data_monthly_v2022_{a}_{b}_025.nc.gz"
                                            for a, b in [(2001, 2010), (2011, 2020)]], 2001, 2020),
}


def open_gz(path):
    nc = path.with_suffix("")                        # bỏ đuôi .gz
    if not nc.exists():
        with gzip.open(path) as src, open(nc, "wb") as dst:
            shutil.copyfileobj(src, dst)
    return xr.open_dataset(nc)


if __name__ == "__main__":
    out_dir = RAW / "knmi_cru_gpcc"
    tmp = out_dir / "downloads"
    for name, (urls, y0, y1) in FILES.items():
        out = out_dir / name
        if out.exists():
            continue
        parts = [crop(open_gz(download(u, tmp / u.rsplit("/", 1)[1]))).load() for u in urls]
        ds = xr.concat(parts, "time").sel(time=slice(f"{y0}-01-01", f"{y1}-12-31"))
        ds.to_netcdf(out, encoding={v: {"zlib": True, "complevel": 4} for v in ds.data_vars})
        print("ghi", out, dict(ds.sizes), flush=True)
    shutil.rmtree(tmp, ignore_errors=True)
