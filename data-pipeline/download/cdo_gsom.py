"""Climate Data Online (NOAA NCEI): Global Summary of the Month (GSOM) của các trạm GHCN trong bbox Mekong.
Mưa đo tại trạm (cột PRCP, mm/tháng) để kiểm chứng mưa vệ tinh. Không cần tài khoản.
Chạy:    .venv/bin/python download/cdo_gsom.py
Kết quả: data/raw/cdo_gsom/stations.csv: trạm GHCN trong bbox có PRCP trong 2001–2024 (id, lat, lon, elev_m, name,
         first_year, last_year, has_gsom); data/raw/cdo_gsom/csv/<id>.csv: file GSOM nguyên định dạng NCEI, đủ mọi năm."""
import pandas as pd
import requests

from common import BBOX, END, RAW, START, download

GHCN = "https://www.ncei.noaa.gov/pub/data/ghcn/daily"
GSOM = "https://www.ncei.noaa.gov/data/global-summary-of-the-month/access"


def stations():
    """Trạm GHCN có tâm trong bbox và có PRCP giao với 2001–2024 (theo ghcnd-inventory.txt)."""
    w, s, e, n = BBOX
    st = pd.read_fwf(f"{GHCN}/ghcnd-stations.txt", colspecs=[(0, 11), (12, 20), (21, 30), (31, 37), (41, 71)],
                     names=["id", "lat", "lon", "elev_m", "name"])
    inv = pd.read_fwf(f"{GHCN}/ghcnd-inventory.txt", colspecs=[(0, 11), (31, 35), (36, 40), (41, 45)],
                      names=["id", "element", "first_year", "last_year"])
    prcp = inv[(inv.element == "PRCP") & (inv.last_year >= int(START[:4])) & (inv.first_year <= int(END[:4]))]
    return st[st.lat.between(s, n) & st.lon.between(w, e)].merge(prcp.drop(columns="element"), on="id")


if __name__ == "__main__":
    st = stations()
    has = []
    for sid in st.id:
        try:
            download(f"{GSOM}/{sid}.csv", RAW / "cdo_gsom" / "csv" / f"{sid}.csv")
            has.append(True)
        except requests.HTTPError:                   # trạm GHCN không có file GSOM
            has.append(False)
    st.assign(has_gsom=has).to_csv(RAW / "cdo_gsom" / "stations.csv", index=False)
    print(len(st), "trạm có PRCP trong bbox;", sum(has), "trạm có file GSOM")
