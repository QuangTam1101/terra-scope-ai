"""SWOT (NASA/CNES, PO.DAAC): độ cao mặt nước sông (RiverSP Reach) và hồ (LakeSP Prior), bản D, cho MỘT VÙNG chọn.
Không tải toàn cầu: riêng 2023–2024 đã ≥ 30 000 granule mỗi loại, ≥ 132 GB (sông) + ≥ 554 GB (hồ). SWOT chỉ có từ 2023
(vệ tinh phóng 12/2022), quá ngắn để tính xu hướng 24 năm; dùng làm bối cảnh mực nước gần đây của vùng đang xem.
Chạy:    .venv/bin/python download/swot.py TÊN W S E N        (bbox theo độ, ví dụ: tonle_sap 103.5 12.3 104.9 13.5)
Kết quả: data/raw/swot/<TÊN>/
  SWOT_L2_HR_RiverSP_reach_D_<TÊN>_2023-<năm END>.parquet  bảng (không có hình dạng): một dòng = một đoạn sông × một lượt
                                                      quét, giữ nguyên các cột của NASA + cột granule
  SWOT_L2_HR_RiverSP_reach_D_<TÊN>_reaches.parquet    GeoParquet: hình dạng mỗi đoạn sông, một dòng mỗi reach_id
  SWOT_L2_HR_LakeSP_prior_D_<TÊN>_2023-<năm END>.parquet   GeoParquet: một dòng = một hồ × một lượt quét, hình dạng là
                                                      mặt nước quan sát được ở lượt đó
Giữ đối tượng giao với bbox (giữ nguyên cả hình). File zip tải về downloads/ rồi bị xoá sau khi gộp."""
import shutil
import sys

import geopandas as gpd
import pandas as pd
import requests

from common import END, RAW, EarthdataSession, download

# collection → cột id của đối tượng có hình dạng cố định (None: hình dạng thay đổi theo từng lượt quét)
COLLECTIONS = {"SWOT_L2_HR_RiverSP_reach_D": "reach_id", "SWOT_L2_HR_LakeSP_prior_D": None}
START = "2023-01-01"
YEARS = f"{START[:4]}-{END[:4]}"


def latest(found):
    """NASA có xử lý lại một số lượt quét (…_PGD0_01 rồi …_PGD0_02; giờ bắt đầu trong tên có thể lệch 1 giây, giá trị
    trùng nhau): mỗi (chu kỳ, lượt quét, châu lục) chỉ giữ bản có số đếm lớn nhất."""
    best = {}
    # tên: SWOT_L2_HR_RiverSP_Reach_<chu kỳ>_<lượt>_<châu lục>_<bắt đầu>_<kết thúc>_PGD0_<số đếm>_swot
    for title, url in sorted(found, key=lambda f: f[0].rsplit("_", 2)[1]):
        best[tuple(title.split("_")[5:8])] = (title, url)
    return list(best.values())


def granules(short_name, bbox):
    """(tên granule, URL zip) cắt qua bbox. Một granule = một lượt quét × một châu lục."""
    out, page = [], 1
    while True:
        r = requests.get("https://cmr.earthdata.nasa.gov/search/granules.json", timeout=120, params={
            "short_name": short_name, "bounding_box": ",".join(map(str, bbox)),
            "temporal": f"{START}T00:00:00Z,{END}T23:59:59Z", "page_size": 2000, "page_num": page})
        entries = r.json()["feed"]["entry"]
        out += [(e["title"], next(l["href"] for l in e["links"] if l["href"].endswith(".zip"))) for e in entries]
        if len(entries) < 2000:
            return latest(out)
        page += 1


def save(gdf, out, id_col):
    """Hình đoạn sông lấy từ CSDL tiên nghiệm SWORD, lặp lại y hệt ở mọi lượt quét và chiếm ~95 % dung lượng
    → lưu một lần vào file _reaches, bảng chính bỏ cột hình dạng."""
    if id_col:
        gdf.drop_duplicates(id_col)[[id_col, "geometry"]].to_parquet(out.with_name(out.name.replace(YEARS, "reaches")))
        gdf = pd.DataFrame(gdf.drop(columns="geometry"))
    gdf.to_parquet(out)


if __name__ == "__main__":
    if len(sys.argv) != 6:
        sys.exit(__doc__)
    name, bbox = sys.argv[1], tuple(map(float, sys.argv[2:]))
    w, s, e, n = bbox
    session = EarthdataSession()
    for short_name, id_col in COLLECTIONS.items():
        out = RAW / "swot" / name / f"{short_name}_{name}_{YEARS}.parquet"
        if out.exists():
            continue
        tmp = RAW / "swot" / name / "downloads" / short_name
        parts = []
        for title, url in granules(short_name, bbox):
            gdf = gpd.read_file(f"zip://{download(url, tmp / url.rsplit('/', 1)[1], session)}").cx[w:e, s:n]
            if len(gdf):
                parts.append(gdf.assign(granule=title))
        save(gpd.GeoDataFrame(pd.concat(parts, ignore_index=True)), out, id_col)
        print("ghi", out, sum(map(len, parts)), "dòng từ", len(parts), "granule", flush=True)
        shutil.rmtree(tmp)
