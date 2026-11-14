"""SeaWiFS (NASA OB.DAAC): chlorophyll-a mặt biển, trung bình tháng, lưới 9 km TOÀN CẦU, 09/1997–12/2010. Đây là dữ
liệu mà bài báo tham khảo trên trang challenge dùng.
Chạy:    .venv/bin/python download/seawifs.py
Kết quả: data/raw/seawifs/SEASTAR_SEAWIFS_GAC.<YYYYMMDD>_<YYYYMMDD>.L3m.MO.CHL.chlor_a.9km.nc, một file mỗi tháng,
         nguyên như NASA phát hành (tháng nằm trong tên file, file không có trục time)."""
import requests

from common import RAW, EarthdataSession, download


def granule_urls():
    r = requests.get("https://cmr.earthdata.nasa.gov/search/granules.json", timeout=120, params={
        "short_name": "SeaWiFS_L3m_CHL", "readable_granule_name": "*.L3m.MO.CHL.chlor_a.9km.nc*",
        "options[readable_granule_name][pattern]": "true", "page_size": 2000, "sort_key": "start_date"})
    # link "data#" tải thẳng file; link "service#" là OPeNDAP, hay trả 429 khi tải nhiều file
    return [next(l["href"] for l in e["links"] if l.get("rel", "").endswith("/data#") and l["href"].endswith(".nc"))
            for e in r.json()["feed"]["entry"]]


if __name__ == "__main__":
    session, urls = EarthdataSession(), granule_urls()
    for url in urls:
        download(url, RAW / "seawifs" / url.rsplit("/", 1)[1], session)
    print(len(urls), "file tháng trong", RAW / "seawifs")
