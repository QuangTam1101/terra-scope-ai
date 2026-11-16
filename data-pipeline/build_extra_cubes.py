"""Cube 1° cho các biến web thêm ngày 16/11/2026 (processed_data/README.md §3.1c), dựng thẳng từ file thô ở
data/raw/ của thư mục dự án (giữ nguyên như nhà phát hành giao): mỗi nguồn một hàm đọc → bin_to_grid → cube_<id>.nc.
Chạy từ data-pipeline/:  <python có xarray> build_extra_cubes.py [id ...]     (mặc định: mọi id trong BUILDERS)
Thư mục thô: biến môi trường TERRA_RAW, mặc định ../../data/raw (worktree nằm trong thư mục dự án).
Kết quả: processed_data/grid/cube_<id>.nc, float32, nhãn đầu tháng, trục tháng liền từ tháng có dữ liệu đầu tiên tới
         cuối cùng (bridge đọc coverage từ trục; grid_trend cần đủ 12 tháng mỗi năm, tháng thiếu là NaN)."""
import os
import sys
from multiprocessing import Pool
from pathlib import Path

import pandas as pd
import xarray as xr

from pipeline.giovanni_adapter import build_cube
from pipeline.grid import bin_to_grid, global_coords

RAW = Path(os.environ.get("TERRA_RAW", "../../data/raw")).resolve()
OUT = Path("processed_data/grid")
SWE_ICE_MM = 10          # ô có tuyết ≥ 10 mm nước ở mọi tháng 2001–2025 = băng vĩnh cửu (1.167 ô 1°)


def _month(t):
    return pd.to_datetime(pd.DatetimeIndex(t).strftime("%Y-%m-01"))


def _grid(da):
    """(time, lat, lon) lưới gốc → 1° theo từng tháng (bin_to_grid gộp theo nhãn ô, làm từng tháng cho nhẹ RAM)."""
    lat, lon = global_coords()
    cube = xr.concat([bin_to_grid(da.isel(time=[i])) for i in range(da.sizes["time"])], "time")
    return cube.reindex(lat=lat, lon=lon, method="nearest", tolerance=1e-6)


def _land():
    """Ô đất liền 1° = ô có nhiệt độ GLDAS (đất liền, từ 60°S)."""
    return xr.open_dataarray(OUT / "cube_tair_land.nc").notnull().any("time")


def hoss(var_id):
    files = sorted((RAW / "giovanni" / var_id).glob("*.nc4"))
    assert files, f"chưa tải {var_id}"
    return build_cube(files, var_id)


def swe():
    """GLDAS SWE (kg/m² = mm nước). Ô không bao giờ hết tuyết (min cả chuỗi > 10 mm: băng Greenland, Nam Cực ngoài 60°S,
    sông băng) bị bỏ: Noah cộng dồn tuyết ở đó không tan (Greenland ~43 000 mm và tăng mãi), tạo xu hướng giả."""
    cube = hoss("GLDAS_NOAH025_M_2_1_SWE_inst")
    return cube.where(cube.min("time") <= SWE_ICE_MM).assign_attrs(cube.attrs)


def grace():
    """JPL Mascon RL06.3: dị thường TWS (cm nước) so với trung bình 2004–2009; chỉ ô đất (land_mask của JPL).
    Hai lời giải rơi vào cùng tháng dương lịch (lịch quan trắc lệch) thì lấy trung bình."""
    ds = xr.open_dataset(sorted((RAW / "grace").glob("*.nc"))[-1])
    da = ds["lwe_thickness"].where(ds["land_mask"] == 1).astype("float32")
    da = da.assign_coords(time=_month(da["time"].values)).groupby("time").mean()
    return _grid(da).assign_attrs(units="cm", dataset="TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4")


def cru(v):
    """CRU TS 4.10 tmx/tmn (°C, TB ngày trong tháng); bỏ ô stn = 0 (không trạm, chỉ là khí hậu trung bình)."""
    parts = []
    for f in sorted((RAW / "knmi_cru_gpcc").glob(f"cru_ts4.10.*.{v}.dat.nc")):
        ds = xr.open_dataset(f)
        parts.append(ds[v].where(ds["stn"] > 0))
    da = xr.concat(parts, "time")
    da = da.assign_coords(time=_month(da["time"].values))
    return _grid(da).assign_attrs(units="degC", dataset=f"CRU TS 4.10 {v}")


def _fire_month(path):
    da = xr.open_dataset(path)["FIRE"]                       # kg C m-2 s-1, TB tháng
    secs = da["time"].dt.days_in_month * 86400
    return bin_to_grid((da * 1000 * secs).assign_coords(time=_month(da["time"].values)))


def fire():
    """MiCASA FIRE → g C m⁻² tháng⁻¹; biển và ô không cháy = 0, nên giữ ô đất liền."""
    files = sorted((RAW / "micasa").glob("MiCASA_v1_flux_*_monthly_*.nc4"))
    assert len(files) >= 288, f"MiCASA mới có {len(files)} file"
    with Pool(6) as pool:
        cube = xr.concat(pool.map(_fire_month, files), "time")
    lat, lon = global_coords()
    cube = cube.reindex(lat=lat, lon=lon, method="nearest", tolerance=1e-6)
    return cube.where(_land()).assign_attrs(units="gC/m2/month", dataset="MICASA_FLUX_M.1 FIRE")


# AOD phủ cả biển, float32 đầy đủ nén kém (55 MB/cube): giữ 4 chữ số thập phân (xu hướng ~0,01/thập kỷ)
LSD = {"aod_merra2": 4, "dust_aod_merra2": 4}

BUILDERS = {
    "tws_grace": grace,
    "swe_gldas": swe,
    "aod_merra2": lambda: hoss("M2TMNXAER_5_12_4_TOTEXTTAU"),
    "dust_aod_merra2": lambda: hoss("M2TMNXAER_5_12_4_DUEXTTAU"),
    "tmax_cru": lambda: cru("tmx"),
    "tmin_cru": lambda: cru("tmn"),
    "fire_micasa": fire,
}

if __name__ == "__main__":
    for name in sys.argv[1:] or BUILDERS:
        cube = BUILDERS[name]()
        has = cube.notnull().any(("lat", "lon")).values        # cắt tháng rỗng ở hai đầu; tháng rỗng ở giữa (khoảng
        cube = cube.isel(time=slice(int(has.argmax()), len(has) - int(has[::-1].argmax())))   # trống GRACE) giữ NaN:
        cube = cube.reindex(time=pd.date_range(cube["time"].values[0], cube["time"].values[-1], freq="MS"))  # grid_trend cần trục tháng liền
        cube = cube.rename(name).astype("float32").assign_attrs(grid="1deg_block_mean", source_variable=name)
        tmp, path = OUT / f"cube_{name}.nc.tmp", OUT / f"cube_{name}.nc"
        enc = {"zlib": True, "complevel": 4} | ({"least_significant_digit": LSD[name]} if name in LSD else {})
        cube.to_netcdf(tmp, encoding={name: enc})
        os.replace(tmp, path)            # backend đang mở file cũ thì HDF5 khoá giữa chừng: ghi tạm rồi thay
        t = pd.DatetimeIndex(cube["time"].values)
        print(f"{path}: {t[0]:%Y-%m} → {t[-1]:%Y-%m}, {len(t)} tháng, {int(cube.notnull().any('time').sum())} ô, "
              f"{os.path.getsize(path) / 1e6:.1f} MB", flush=True)
