"""Adapter AppEEARS (docs/02 §3): gửi task qua appeears.py ở gốc dự án, rồi NetCDF-4 (area) hoặc
CSV (point) → bảng chung. Todo: AppEEARS + định dạng CSV/NetCDF; point/polygon extraction."""
import csv
import json
import subprocess
import sys
from pathlib import Path

import pandas as pd
import xarray as xr

from pipeline import qa
from pipeline.aggregate import decode_layer, raster_to_series, series_to_monthly
from pipeline.schema import FetchRequest, Region, request_id, rows
from pipeline.units import kelvin_to_c

ROOT = Path(__file__).resolve().parent.parent          # appeears.py nằm ở gốc dự án

# layer AppEEARS → (tên biến chuẩn docs/01 mục 4, đơn vị chuẩn)
VARIABLES = {
    "_1_km_monthly_NDVI": ("ndvi", "1"),
    "LST_Day_1km": ("lst_day", "degC"),
    "LST_Night_1km": ("lst_night", "degC"),
    "ET_500m": ("et", "mm/month"),
    "PET_500m": ("pet", "mm/month"),
}


class AppeearsAdapter:
    source = "appeears"

    def fetch(self, reqs: list[FetchRequest], raw_dir: Path) -> Path:
        for req in reqs:
            out = raw_dir / "appeears" / request_id(req)
            if (out / "manifest.json").exists():
                continue                                    # cache hit → không gọi API
            out.mkdir(parents=True, exist_ok=True)
            layers = ",".join(f"{req.dataset}:{v}" for v in req.variables)
            kind = "point" if req.regions[0].geom_type == "point" else "area"
            locs = write_locations(req, out)                # GeoJSON bbox hoặc CSV điểm
            start, end = (f"{d[5:7]}-{d[8:10]}-{d[:4]}" for d in (req.start, req.end))  # → MM-DD-YYYY
            cmd = [sys.executable, str(ROOT / "appeears.py"), kind, str(locs), layers, start, end, str(out)]
            if kind == "area":
                cmd += ["netcdf4", "native"]
            subprocess.run(cmd, check=True)                 # gửi, poll, tải (resume: appeears.py fetch)
            files = sorted(p.name for p in out.iterdir())
            (out / "manifest.json").write_text(json.dumps(
                {"request_id": request_id(req), "task_id": (out / "task_id.txt").read_text().strip(),
                 "files": files}))
        return raw_dir / "appeears"

    def normalize(self, reqs: list[FetchRequest], raw: Path) -> pd.DataFrame:
        parts = []
        for req in reqs:
            out = raw / request_id(req)
            task_id = json.loads((out / "manifest.json").read_text())["task_id"]
            if req.regions[0].geom_type == "point":
                csvs = [p for p in out.glob("*.csv") if p.name != "locations.csv"
                        and not p.name.endswith("-Statistics.csv")]
                for p in csvs:                              # ⚠️ tên file kết quả point xác nhận ở T-5
                    parts.append(normalize_points(p, req, task_id))
                continue
            for i, region in enumerate(req.regions):        # cùng thứ tự feature với write_locations
                for nc in nc_files_for(out, req.dataset, i):
                    for layer in req.variables:
                        parts.append(normalize_area(nc, region, req.dataset, layer, task_id))
        return pd.concat(parts, ignore_index=True)


def write_locations(req: FetchRequest, out: Path) -> Path:
    """bbox → polygon GeoJSON (area), hoặc CSV id,category,latitude,longitude (point) cho appeears.py."""
    if req.regions[0].geom_type == "point":
        path = out / "locations.csv"
        with open(path, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["id", "category", "latitude", "longitude"])
            for r in req.regions:
                w.writerow([r.region_id, "grid", r.bbox[1], r.bbox[0]])   # điểm: bbox = (lon, lat, lon, lat)
        return path
    feats = [{"type": "Feature", "properties": {"id": r.region_id},
              "geometry": {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}}
             for r in req.regions for w, s, e, n in [r.bbox]]
    path = out / "locations.geojson"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
    return path


def nc_files_for(out: Path, dataset: str, index: int) -> list[Path]:
    """AppEEARS đặt tên <dataset>_<độ phân giải>_aid<NNNN>.nc, NNNN = thứ tự feature (1, 2…) trong GeoJSON gửi đi;
    tên file KHÔNG chứa id vùng (✅ R4 13/11: aid0001 = vùng đầu tiên của regions.geojson)."""
    return sorted(out.glob(f"{dataset}_*_aid{index + 1:04d}.nc"))


def normalize_area(nc_path, region: Region, dataset, layer, request_ref) -> pd.DataFrame:
    """Một .nc (một vùng) × một layer → các dòng observations. Mở số thô để tự decode (bẫy QC fill)."""
    ds = xr.open_dataset(nc_path, mask_and_scale=False)
    monthly = series_to_monthly(raster_to_series(ds, layer, region.bbox), layer)
    return _finish(monthly, region, dataset, layer, request_ref, agg="area_mean")


def normalize_points(csv_path, req: FetchRequest, request_ref) -> pd.DataFrame:
    """CSV point AppEEARS (mỗi dòng = 1 điểm × 1 ngày composite) → observations, mỗi điểm một chuỗi.
    n_valid = số composite hợp lệ trong tháng; valid_frac = n_valid / số composite của tháng."""
    df = pd.read_csv(csv_path)
    prefix = req.dataset.replace(".", "_") + "_"            # ⚠️ dạng cột {PRODUCT}_{VERSION}_{layer}, T-5
    by_id = {r.region_id: r for r in req.regions}
    parts = []
    for pid, g in df.groupby("ID"):                          # ⚠️ tên cột ID / Date xác nhận ở T-5
        g = g.sort_values("Date")
        time = pd.to_datetime(g["Date"]).to_numpy()
        for layer in req.variables:
            qa_layer = qa.QA_POLICY[layer][0]
            data = {layer: ("time", g[prefix + layer].to_numpy())}
            if qa_layer:
                data[qa_layer] = ("time", g[prefix + qa_layer].to_numpy())
            val = decode_layer(xr.Dataset(data, coords={"time": time}), layer)
            ok = val.notnull().to_numpy()
            stats = pd.DataFrame({"value": val.to_numpy(), "n_valid": ok.astype(int),
                                  "valid_frac": ok.astype(float)}, index=pd.DatetimeIndex(time))
            parts.append(_finish(series_to_monthly(stats, layer), by_id[str(pid)], req.dataset, layer,
                                 request_ref, agg="pixel"))
    return pd.concat(parts, ignore_index=True)


def _finish(monthly, region, dataset, layer, request_ref, agg):
    name, unit = VARIABLES[layer]
    if name.startswith("lst"):
        monthly = monthly.assign(value=kelvin_to_c(monthly["value"]))
    return rows(region, name, monthly, unit=unit, source="appeears", dataset=dataset, source_variable=layer,
                agg=agg, qa_policy=qa.QA_POLICY[layer][2], request_ref=request_ref)
