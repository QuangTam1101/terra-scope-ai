"""MODIS Terra global monthly Climate Modeling Grid (0.05 deg) products, averaged to the project's 0.5 deg grid.

    MOD13C2 v061: monthly NDVI           -> ndvi_modis       (unitless, -0.2 to 1)
    MOD11C3 v061: monthly land surface temperature, day and night -> lst_day_modis, lst_night_modis (degC)

Each month is downloaded from NASA LP DAAC (Earthdata Login via _netrc), read, quality-filtered, block-averaged
10 x 10 (0.05 deg -> 0.5 deg) and saved as one small .npy part; the ~100 MB HDF file is then deleted, so the whole
2001-2025 record (about 49 GB) never sits on disk. Re-running skips months already done. `assemble` writes
data/processed/grid/<name>.nc in the same layout as preprocess/clean.py (time, lat south to north, lon west to east).

Run with an environment that has earthaccess and pyhdf (the conda env `spaceapps`):
    python download/modis_cmg.py ndvi            # or: lst
    python download/modis_cmg.py assemble
Quality rules
    NDVI: keep pixels with pixel reliability 0 (good) or 1 (marginal); drop snow/ice (2), cloudy (3), estimated (4).
    LST:  keep every non-fill value (MOD11C3 is already a mean of clear-sky observations).
    A 0.5 deg cell needs at least MIN_VALID of its 100 sub-cells, otherwise it is missing (coasts, persistent cloud).
"""
import shutil
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PARTS = ROOT / "data" / "processed" / "modis_parts"
GRID = ROOT / "data" / "processed" / "grid"
START, END = "2001-01-01", "2025-12-31"
MIN_VALID = 25
PRODUCTS = {"ndvi": ("MOD13C2", ["ndvi_modis"]), "lst": ("MOD11C3", ["lst_day_modis", "lst_night_modis"])}


def block_mean(x: np.ndarray) -> np.ndarray:
    """(3600, 7200) north-to-south 0.05 deg -> (360, 720) south-to-north 0.5 deg mean of valid sub-cells."""
    b = x.reshape(360, 10, 720, 10)
    n = np.isfinite(b).sum(axis=(1, 3))
    with np.errstate(invalid="ignore"):
        m = np.nansum(b, axis=(1, 3)) / n
    m[n < MIN_VALID] = np.nan
    return m[::-1].astype(np.float32)


def read_ndvi(path) -> dict:
    from pyhdf.SD import SD, SDC
    sd = SD(str(path), SDC.READ)
    raw = sd.select("CMG 0.05 Deg Monthly NDVI").get().astype(np.float32)
    rel = sd.select("CMG 0.05 Deg Monthly pixel reliability").get()
    ok = (raw != -3000) & (raw >= -2000) & (raw <= 10000) & ((rel == 0) | (rel == 1))
    return {"ndvi_modis": block_mean(np.where(ok, raw / 10000.0, np.nan))}


def read_lst(path) -> dict:
    from pyhdf.SD import SD, SDC
    sd = SD(str(path), SDC.READ)
    out = {}
    for sds, name in (("LST_Day_CMG", "lst_day_modis"), ("LST_Night_CMG", "lst_night_modis")):
        raw = sd.select(sds).get().astype(np.float32)
        out[name] = block_mean(np.where(raw >= 7500, raw * 0.02 - 273.15, np.nan))
    return out


def month_of(granule) -> str:
    begin = granule["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"]
    return begin[:7]


def run(kind: str, workers: int = 4):
    import earthaccess
    short, names = PRODUCTS[kind]
    reader = read_ndvi if kind == "ndvi" else read_lst
    for n in names:
        (PARTS / n).mkdir(parents=True, exist_ok=True)
    earthaccess.login(strategy="netrc")
    granules = earthaccess.search_data(short_name=short, version="061", temporal=(START, END))
    todo = [g for g in granules if not all((PARTS / n / f"{month_of(g)}.npy").exists() for n in names)]
    print(f"{short}: {len(granules)} months, {len(todo)} to do", flush=True)

    def one(g):
        month = month_of(g)
        tmp = Path(tempfile.mkdtemp(prefix=f"{short}_{month}_"))
        try:
            f = earthaccess.download([g], str(tmp), show_progress=False)[0]
            for name, arr in reader(f).items():
                np.save(PARTS / name / f"{month}.npy", arr)
            return month
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    with ThreadPoolExecutor(workers) as pool:
        for i, month in enumerate(pool.map(one, todo), 1):
            print(f"{short} {month} done ({i}/{len(todo)})", flush=True)


def assemble():
    import xarray as xr
    times = pd.date_range(START, END, freq="MS")
    lat = np.arange(-89.75, 90, 0.5)
    lon = np.arange(-179.75, 180, 0.5)
    for name in [n for _, ns in PRODUCTS.values() for n in ns]:
        d = PARTS / name
        if not d.exists():
            continue
        cube = np.full((len(times), 360, 720), np.nan, dtype=np.float32)
        have = 0
        for i, t in enumerate(times):
            p = d / f"{t:%Y-%m}.npy"
            if p.exists():
                cube[i] = np.load(p)
                have += 1
        ds = xr.Dataset({name: (("time", "lat", "lon"), cube)}, coords={"time": times, "lat": lat, "lon": lon})
        GRID.mkdir(parents=True, exist_ok=True)
        ds.to_netcdf(GRID / f"{name}.nc", encoding={name: {"zlib": True, "complevel": 4}})
        print(f"{name}: {have}/{len(times)} months -> {GRID / f'{name}.nc'}")


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    if arg == "assemble":
        assemble()
    elif arg in PRODUCTS:
        run(arg)
    else:
        sys.exit(__doc__)
