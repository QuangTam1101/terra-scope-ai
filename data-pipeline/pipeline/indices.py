"""Chỉ số khí hậu công khai làm "tín hiệu dẫn đầu" cho dự báo (docs/05 §7). Mỗi nguồn là một file text nhỏ (< 70 KB).
Tải một lần bằng `download()`, gộp thành processed_data/indices/climate_indices.csv (tháng, 4 cột) để chạy offline sau đó.

| cột     | chỉ số                           | nguồn                                                                      |
| nino34  | Niño 3.4 anomaly (°C), ERSSTv5   | NOAA CPC  cpc.ncep.noaa.gov/data/indices/ersst5.nino.mth.91-20.ascii       |
| dmi     | Indian Ocean Dipole (DMI, °C)    | NOAA PSL  psl.noaa.gov/gcos_wgsp/Timeseries/Data/dmi.had.long.data         |
| pdo     | Pacific Decadal Oscillation      | NOAA NCEI ncei.noaa.gov/pub/data/cmb/ersst/v5/index/ersst.v5.pdo.dat       |
| nao     | North Atlantic Oscillation       | NOAA CPC  cpc.ncep.noaa.gov/products/precip/CWlink/pna/norm.nao.monthly.b5001.current.ascii.table |
| nino12, nino3, nino4 | Niño 1+2 / 3 / 4 anomaly (°C) | cùng file CPC với nino34 (các cột ANOM còn lại)                           |
| soi     | Southern Oscillation Index       | NOAA PSL  psl.noaa.gov/data/correlation/soi.data                           |
| qbo     | QBO, gió đông-tây 30 hPa (m/s)   | NOAA PSL  psl.noaa.gov/data/correlation/qbo.data                           |
Giá trị thiếu (99.99, -99.99, -9999) → NaN."""
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

DIR = Path(__file__).resolve().parents[1] / "processed_data" / "indices"
CSV = DIR / "climate_indices.csv"
URLS = {
    "nino34": "https://www.cpc.ncep.noaa.gov/data/indices/ersst5.nino.mth.91-20.ascii",
    "dmi": "https://psl.noaa.gov/gcos_wgsp/Timeseries/Data/dmi.had.long.data",
    "pdo": "https://www.ncei.noaa.gov/pub/data/cmb/ersst/v5/index/ersst.v5.pdo.dat",
    "nao": "https://www.cpc.ncep.noaa.gov/products/precip/CWlink/pna/norm.nao.monthly.b5001.current.ascii.table",
    "soi": "https://psl.noaa.gov/data/correlation/soi.data",
    "qbo": "https://psl.noaa.gov/data/correlation/qbo.data",
}


def _wide(text):
    """Dạng 'năm + 12 tháng' mỗi dòng → Series theo tháng. Bỏ dòng không bắt đầu bằng năm 4 chữ số."""
    out = {}
    for line in text.splitlines():
        p = line.split()
        if len(p) >= 13 and p[0].isdigit() and len(p[0]) == 4:
            for m, v in enumerate(p[1:13], 1):
                try:
                    x = float(v)
                except ValueError:
                    continue
                out[pd.Timestamp(int(p[0]), m, 1)] = np.nan if abs(x) >= 99 else x
    return pd.Series(out).sort_index()


def parse_nino(text):
    """YR MON NINO1+2 ANOM NINO3 ANOM NINO4 ANOM NINO3.4 ANOM → DataFrame 4 cột."""
    rows = [l.split() for l in text.splitlines()[1:] if len(l.split()) >= 10]
    idx = [pd.Timestamp(int(r[0]), int(r[1]), 1) for r in rows]
    return pd.DataFrame({"nino12": [float(r[3]) for r in rows], "nino3": [float(r[5]) for r in rows],
                         "nino4": [float(r[7]) for r in rows], "nino34": [float(r[9]) for r in rows]}, index=idx).sort_index()


def parse(name, text):
    return _wide(text)


def download(timeout=60):
    DIR.mkdir(parents=True, exist_ok=True)
    parts = []
    for name, url in URLS.items():
        raw = urllib.request.urlopen(url, timeout=timeout).read().decode("utf-8", "replace")
        parts.append(parse_nino(raw) if name == "nino34" else parse(name, raw).rename(name))
    df = pd.concat(parts, axis=1).loc["1950-01-01":]
    df.index.name = "time"
    df.to_csv(CSV)
    return df


def load(times=None):
    """DataFrame theo tháng; `times` (DatetimeIndex) → reindex, thiếu thì nội suy lùi tối đa 3 tháng."""
    df = pd.read_csv(CSV, index_col="time", parse_dates=True) if CSV.exists() else download()
    if times is not None:
        df = df.reindex(times).ffill(limit=3)
    return df


if __name__ == "__main__":
    d = download()
    print(d.tail(3), "\n", d.loc["2001":"2024"].isna().sum().to_dict(), "→", CSV)
