"""Climate Data Online (NOAA NCEI): Global Summary of the Month (GSOM) của các trạm GHCN TOÀN CẦU có đo mưa trong
2001–2024. Mưa đo tại trạm (cột PRCP, mm/tháng) để kiểm chứng mưa vệ tinh và mưa lưới. Không cần tài khoản.
Chạy:    .venv/bin/python download/cdo_gsom.py
Kết quả: data/raw/cdo_gsom/stations.csv: trạm GHCN có PRCP giao với 2001–2024 (id, lat, lon, elev_m, name,
         first_year, last_year, has_gsom); data/raw/cdo_gsom/csv/<id>.csv: file GSOM nguyên định dạng NCEI, đủ mọi năm.
Lấy từ kho nén toàn bộ GSOM (gsom-latest.tar.gz, ~1,5 GB) thay vì tải từng trạm; giải nén xong thì xoá kho."""
import tarfile

import pandas as pd

from common import END, RAW, START, download

GHCN = "https://www.ncei.noaa.gov/pub/data/ghcn/daily"
ARCHIVE = "https://www.ncei.noaa.gov/data/global-summary-of-the-month/archive/gsom-latest.tar.gz"
OUT = RAW / "cdo_gsom"


def stations():
    """Trạm GHCN có PRCP giao với 2001–2024 (theo ghcnd-inventory.txt)."""
    st = pd.read_fwf(f"{GHCN}/ghcnd-stations.txt", colspecs=[(0, 11), (12, 20), (21, 30), (31, 37), (41, 71)],
                     names=["id", "lat", "lon", "elev_m", "name"])
    inv = pd.read_fwf(f"{GHCN}/ghcnd-inventory.txt", colspecs=[(0, 11), (31, 35), (36, 40), (41, 45)],
                      names=["id", "element", "first_year", "last_year"])
    prcp = inv[(inv.element == "PRCP") & (inv.last_year >= int(START[:4])) & (inv.first_year <= int(END[:4]))]
    return st.merge(prcp.drop(columns="element"), on="id")


if __name__ == "__main__":
    st = stations()
    wanted, found = set(st.id), set()
    archive = download(ARCHIVE, OUT / "gsom-latest.tar.gz")
    with tarfile.open(archive) as tar:
        for m in tar:                                # đọc tuần tự, không bung cả kho
            sid = m.name.rsplit("/", 1)[-1].removesuffix(".csv")
            if m.isfile() and sid in wanted:
                m.name = f"{sid}.csv"                # bỏ thư mục trong kho
                tar.extract(m, OUT / "csv", filter="data")
                found.add(sid)
    st.assign(has_gsom=st.id.isin(found)).to_csv(OUT / "stations.csv", index=False)
    archive.unlink()
    print(len(st), "trạm GHCN có PRCP trong 2001–2024;", len(found), "trạm có file GSOM")
