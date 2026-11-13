"""SeaWiFS (NASA OB.DAAC): chlorophyll-a mặt biển, trung bình tháng, lưới 9 km, 09/1997–12/2010, phần biển trong bbox
Mekong (vịnh Thái Lan, cửa sông Mekong, biển ven Việt Nam). Đây là dữ liệu mà bài báo tham khảo trên trang challenge dùng.
Chạy:    .venv/bin/python download/seawifs.py
Kết quả: data/raw/seawifs/seawifs_chlor_a_monthly_9km_mekong_199709-201012.nc (chlor_a, mg/m³, giá trị gốc; thêm trục
         time = ngày đầu tháng lấy từ tên file). File tháng toàn cầu tải về downloads/ rồi bị xoá sau khi cắt."""
import shutil

import pandas as pd
import requests
import xarray as xr

from common import RAW, EarthdataSession, crop, download

OUT = RAW / "seawifs" / "seawifs_chlor_a_monthly_9km_mekong_199709-201012.nc"


def granule_urls():
    r = requests.get("https://cmr.earthdata.nasa.gov/search/granules.json", timeout=120, params={
        "short_name": "SeaWiFS_L3m_CHL", "readable_granule_name": "*.L3m.MO.CHL.chlor_a.9km.nc*",
        "options[readable_granule_name][pattern]": "true", "page_size": 2000, "sort_key": "start_date"})
    # link "data#" tải thẳng file; link "service#" là OPeNDAP, hay trả 429 khi tải nhiều file
    return [next(l["href"] for l in e["links"] if l.get("rel", "").endswith("/data#") and l["href"].endswith(".nc"))
            for e in r.json()["feed"]["entry"]]


if __name__ == "__main__":
    session, tmp, parts = EarthdataSession(), OUT.parent / "downloads", []
    for url in granule_urls():
        name = url.rsplit("/", 1)[1]                 # SEASTAR_SEAWIFS_GAC.19970901_19970930.L3m.MO.CHL.chlor_a.9km.nc
        ds = crop(xr.open_dataset(download(url, tmp / name, session))[["chlor_a"]]).load()
        parts.append(ds.expand_dims(time=[pd.Timestamp(name.split(".")[1][:8])]))
    out = xr.concat(parts, "time")
    out.to_netcdf(OUT, encoding={"chlor_a": {"zlib": True, "complevel": 4}})
    print("ghi", OUT, dict(out.sizes))
    shutil.rmtree(tmp)
