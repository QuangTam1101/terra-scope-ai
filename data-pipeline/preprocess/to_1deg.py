"""Make the 1 degree deployment cube from a 0.5 degree product grid.

The hosted backend (Docker image) ships small 1 degree cubes in processed_data/grid/cube_<pipeline id>.nc; locally the
backend prefers the 0.5 degree files in data/processed/grid/. A 1 degree cell is the mean of its four 0.5 degree cells and
needs at least two of them with data (the same 50% area rule as preprocess/clean.py).

    python preprocess/to_1deg.py ndvi_modis:ndvi lst_day_modis:lst_day lst_night_modis:lst_night pet_gldas:pet
"""
import sys
from pathlib import Path

import numpy as np
import xarray as xr

ROOT = Path(__file__).resolve().parents[1]
SRC, DST = ROOT / "data" / "processed" / "grid", ROOT / "processed_data" / "grid"


def to_1deg(product: str, pipeline_id: str) -> Path:
    ds = xr.open_dataset(SRC / f"{product}.nc")
    x = ds[product].values                                   # (time, 360, 720), lat south to north
    b = x.reshape(x.shape[0], 180, 2, 360, 2)
    n = np.isfinite(b).sum(axis=(2, 4))
    with np.errstate(invalid="ignore"):
        m = np.nansum(b, axis=(2, 4)) / n
    m[n < 2] = np.nan
    out = xr.Dataset({pipeline_id: (("time", "lat", "lon"), m.astype(np.float32))},
                     coords={"time": ds.time.values, "lat": np.arange(-89.5, 90, 1.0), "lon": np.arange(-179.5, 180, 1.0)})
    DST.mkdir(parents=True, exist_ok=True)
    path = DST / f"cube_{pipeline_id}.nc"
    out.to_netcdf(path, encoding={pipeline_id: {"zlib": True, "complevel": 9, "chunksizes": (144, 90, 180)}})
    return path


if __name__ == "__main__":
    for arg in sys.argv[1:] or sys.exit(__doc__):
        product, pid = arg.split(":")
        p = to_1deg(product, pid)
        print(f"{product} -> {p} ({p.stat().st_size / 1e6:.1f} MB)")
