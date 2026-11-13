"""SWOT (NASA/CNES, PO.DAAC): độ cao mặt nước sông (RiverSP Reach) và hồ (LakeSP Prior), bản D, trong bbox Mekong.
SWOT chỉ có từ 2023 (vệ tinh phóng 12/2022), quá ngắn để tính xu hướng 24 năm; dùng làm bối cảnh mực nước gần đây.
Chạy:    .venv/bin/python download/swot.py
Kết quả: data/raw/swot/
  SWOT_L2_HR_RiverSP_reach_D_mekong_2023-2024.parquet  bảng (không có hình dạng): một dòng = một đoạn sông × một lượt
                                                       quét, giữ nguyên các cột của NASA + cột granule
  SWOT_L2_HR_RiverSP_reach_D_mekong_reaches.parquet    GeoParquet: hình dạng mỗi đoạn sông, một dòng mỗi reach_id
  SWOT_L2_HR_LakeSP_prior_D_mekong_2023-2024.parquet   GeoParquet: một dòng = một hồ × một lượt quét, hình dạng là
                                                       mặt nước quan sát được ở lượt đó
File zip tải về downloads/ rồi bị xoá sau khi gộp."""
import shutil

import geopandas as gpd
import pandas as pd
import requests

from common import BBOX, END, RAW, EarthdataSession, download

# collection → cột id của đối tượng có hình dạng cố định (None: hình dạng thay đổi theo từng lượt quét)
COLLECTIONS = {"SWOT_L2_HR_RiverSP_reach_D": "reach_id", "SWOT_L2_HR_LakeSP_prior_D": None}
START = "2023-01-01"


def latest(found):
    """NASA có xử lý lại một số lượt quét (…_PGD0_01 rồi …_PGD0_02; giờ bắt đầu trong tên có thể lệch 1 giây, giá trị
    trùng nhau): mỗi (chu kỳ, lượt quét, châu lục) chỉ giữ bản có số đếm lớn nhất."""
    best = {}
    # tên: SWOT_L2_HR_RiverSP_Reach_<chu kỳ>_<lượt>_AS_<bắt đầu>_<kết thúc>_PGD0_<số đếm>_swot
    for title, url in sorted(found, key=lambda f: f[0].rsplit("_", 2)[1]):
        best[tuple(title.split("_")[5:8])] = (title, url)
    return list(best.values())


def granules(short_name):
    """(tên granule, URL zip) của châu Á (_AS_) cắt qua bbox. Một granule = một lượt quét × một châu lục."""
    out, page = [], 1
    while True:
        r = requests.get("https://cmr.earthdata.nasa.gov/search/granules.json", timeout=120, params={
            "short_name": short_name, "bounding_box": ",".join(map(str, BBOX)),
            "temporal": f"{START}T00:00:00Z,{END}T23:59:59Z", "page_size": 2000, "page_num": page})
        entries = r.json()["feed"]["entry"]
        for e in entries:
            url = next(l["href"] for l in e["links"] if l["href"].endswith(".zip"))
            if "_AS_" in e["title"]:
                out.append((e["title"], url))
        if len(entries) < 2000:
            return latest(out)
        page += 1


def save(gdf, out, id_col):
    """Hình đoạn sông lấy từ CSDL tiên nghiệm SWORD, lặp lại y hệt ở mọi lượt quét và chiếm ~95 % dung lượng
    → lưu một lần vào file _reaches, bảng chính bỏ cột hình dạng."""
    if id_col:
        gdf.drop_duplicates(id_col)[[id_col, "geometry"]].to_parquet(out.with_name(out.name.replace("2023-2024", "reaches")))
        gdf = pd.DataFrame(gdf.drop(columns="geometry"))
    gdf.to_parquet(out)


if __name__ == "__main__":
    w, s, e, n = BBOX
    session = EarthdataSession()
    for short_name, id_col in COLLECTIONS.items():
        out = RAW / "swot" / f"{short_name}_mekong_2023-2024.parquet"
        if out.exists():
            continue
        tmp = RAW / "swot" / "downloads" / short_name
        parts = []
        for title, url in granules(short_name):
            gdf = gpd.read_file(f"zip://{download(url, tmp / url.rsplit('/', 1)[1], session)}").cx[w:e, s:n]
            if len(gdf):
                parts.append(gdf.assign(granule=title))
        save(gpd.GeoDataFrame(pd.concat(parts, ignore_index=True)), out, id_col)
        print("ghi", out, sum(map(len, parts)), "dòng từ", len(parts), "granule", flush=True)
        shutil.rmtree(tmp)
