"""Danh mục biến và vùng có sẵn mà frontend thấy.

- Id biến theo contract (`imerg_precip`, …) ↔ id biến của pipeline (`precip`, …).
- Đơn vị lấy từ `pipeline.api.VARIABLES` để không lệch với cube.
- Vùng có sẵn đọc từ `data-pipeline/config/regions.geojson` (vùng mẫu của Long) + `northern_vietnam` (frontend dùng).
"""
import json
from dataclasses import dataclass

from . import config  # phải import trước: thêm data-pipeline vào sys.path

from pipeline import api as papi  # noqa: E402


@dataclass(frozen=True)
class Variable:
    id: str
    pipeline_id: str
    name: str
    category: str
    description_simple: str
    description_technical: str
    display_units_base: str
    native_resolution_deg: float
    product: str
    version: str
    provider: str
    url: str
    note: str | None = None          # cảnh báo luôn gửi kèm kết quả của biến này

    @property
    def units(self) -> str:
        from .bridge import units          # đơn vị theo dữ liệu đang dùng (cube 1° cũ hoặc lưới 0,5° mới)
        return units(self.pipeline_id)

    @property
    def display_units(self) -> str:
        u = self.units
        return {"degC": "°C", "m3/m3": "m³/m³", "kg/m2": "kg/m²", "mg/m3": "mg/m³"}.get(u, self.display_units_base if u == "1" else u)

    @property
    def source(self) -> dict:
        return {"product": self.product, "version": self.version, "provider": self.provider, "url": self.url,
                "citation": papi.VARIABLES[self.pipeline_id][2]}


_MODIS_NOTE = ("MODIS is an optical satellite sensor: it cannot see through cloud, so very cloudy months (and snow for "
               "NDVI) can be missing. Each 0.5° cell is the mean of its clear 0.05° MODIS pixels.")
_LST_NOTE = (_MODIS_NOTE + " Terra's overpass time has drifted earlier since 2022 as the satellite ends its mission, "
             "which can make recent day and night surface temperatures read slightly cooler; check whether a trend "
             "holds when the period ends in 2021.")
_MODEL_NOTE = "This variable comes from a model/reanalysis that assimilates observations, not a direct measurement."

_VARS = [
    Variable("imerg_precip", "precip", "Precipitation", "water",
             "How much rain falls each month.",
             "GPM IMERG Final Run monthly precipitation (V07), on a common global grid.",
             "mm/month", 0.1, "GPM_3IMERGM", "07", "NASA GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGM_07/summary"),
    Variable("gldas_soil_moisture_0_10cm", "soil_moisture", "Soil moisture (0–10 cm)", "water",
             "How wet the top layer of soil is.",
             "GLDAS Noah land surface model, volumetric soil moisture 0–10 cm, on a common global grid.",
             "m³/m³", 0.25, "GLDAS_NOAH025_M", "2.1", "NASA GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_M_2.1/summary", _MODEL_NOTE),
    Variable("gldas_air_temperature", "tair_land", "Air temperature over land", "temperature",
             "How warm the air near the ground is over land.",
             "GLDAS Noah near-surface air temperature, on a common global grid.",
             "°C", 0.25, "GLDAS_NOAH025_M", "2.1", "NASA GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_M_2.1/summary", _MODEL_NOTE),
    Variable("gldas_evapotranspiration", "evap_gldas", "Evapotranspiration (GLDAS)", "water",
             "How much water goes from the land into the air (evaporation plus plants).",
             "GLDAS Noah total evapotranspiration, on a common global grid.",
             "mm/month", 0.25, "GLDAS_NOAH025_M", "2.1", "NASA GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_M_2.1/summary", _MODEL_NOTE),
    Variable("merra2_air_temperature_2m", "t2m", "Air temperature (2 m)", "temperature",
             "How warm the air is at about head height, over land and sea.",
             "MERRA-2 reanalysis 2-metre air temperature, on a common global grid.",
             "°C", 0.5, "M2IMNXASM", "5.12.4", "NASA GMAO / GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/M2IMNXASM_5.12.4/summary", _MODEL_NOTE),
    Variable("modis_ndvi", "ndvi", "Vegetation greenness (NDVI)", "vegetation",
             "How green and dense the plants are (from −0.2 to 1; higher means greener).",
             "MODIS Terra MOD13C2 v061 monthly NDVI (0.05° Climate Modeling Grid), good and marginal pixels only, "
             "averaged to the common global grid.",
             "NDVI", 0.05, "MOD13C2", "061", "NASA LP DAAC",
             "https://lpdaac.usgs.gov/products/mod13c2v061/", _MODIS_NOTE),
    Variable("modis_lst_day", "lst_day", "Land surface temperature (day)", "temperature",
             "How hot the ground surface is during the day (about 10:30 local time).",
             "MODIS Terra MOD11C3 v061 monthly daytime land surface temperature (0.05° Climate Modeling Grid), "
             "averaged to the common global grid.",
             "°C", 0.05, "MOD11C3", "061", "NASA LP DAAC",
             "https://lpdaac.usgs.gov/products/mod11c3v061/", _LST_NOTE),
    Variable("modis_lst_night", "lst_night", "Land surface temperature (night)", "temperature",
             "How warm the ground surface stays at night (about 22:30 local time).",
             "MODIS Terra MOD11C3 v061 monthly night-time land surface temperature (0.05° Climate Modeling Grid), "
             "averaged to the common global grid.",
             "°C", 0.05, "MOD11C3", "061", "NASA LP DAAC",
             "https://lpdaac.usgs.gov/products/mod11c3v061/", _LST_NOTE),
    Variable("modis_et", "et", "Actual evapotranspiration (MODIS)", "water",
             "How much water the land actually gives to the air each month.",
             "MODIS Terra MOD16A2GF actual evapotranspiration.",
             "mm/month", 0.005, "MOD16A2GF", "061", "NASA LP DAAC (AppEEARS)",
             "https://lpdaac.usgs.gov/products/mod16a2gfv061/", _MODIS_NOTE),
    Variable("gldas_potential_evapotranspiration", "pet", "Potential evapotranspiration (GLDAS)", "water",
             "How much water the air could take from the land if water were unlimited.",
             "GLDAS Noah potential evaporation (PotEvap_tavg, W/m², converted with 2.45 MJ/kg) as mm per month, "
             "on a common global grid. Noah's potential evaporation runs higher than reference-crop PET, so read it "
             "for trends rather than absolute amounts.",
             "mm/month", 0.25, "GLDAS_NOAH025_M", "2.1", "NASA GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_M_2.1/summary", _MODEL_NOTE),
    # Lưới 0,5° bản mới (preprocess/clean.py), nối thêm 15/11/2026 (F11).
    Variable("gpcc_precip", "precip_gpcc", "Precipitation (rain gauges)", "water",
             "How much rain falls each month, measured by rain gauges on the ground.",
             "GPCC Full Data Monthly v2022 (0.25°), gridded from rain-gauge records, land only, on a common global grid.",
             "mm/month", 0.25, "GPCC Full Data Monthly", "v2022", "Deutscher Wetterdienst (DWD)",
             "https://opendata.dwd.de/climate_environment/GPCC/full_data_monthly_v2022/",
             "Not NASA data: an independent rain-gauge reference from the German Weather Service, used to cross-check "
             "NASA satellite rain. Ends in 2020."),
    Variable("smap_soil_moisture_surface", "sm_surface_smap", "Soil moisture (SMAP satellite)", "water",
             "How wet the top few centimetres of soil are, measured from space.",
             "SMAP L3 radiometer 36 km daily surface (~0–5 cm) soil moisture (SPL3SMP v009), AM and PM passes; "
             "retrievals with quality bit 0 set are removed, then averaged by month on a common global grid.",
             "m³/m³", 0.33, "SPL3SMP", "009", "NASA NSIDC DAAC", "https://nsidc.org/data/spl3smp/versions/9",
             "Satellite measurement of the top ~5 cm since April 2015, a short record. Low-quality retrievals are "
             "removed, so dense rain forests (Amazon, Congo) have no data."),
    Variable("gldas_root_zone_moisture", "rootmoist_gldas", "Root-zone soil water", "water",
             "How much water the soil holds where plant roots drink.",
             "GLDAS Noah RootMoist_inst, total water in the root zone (depth depends on the vegetation class), "
             "on a common global grid.",
             "kg/m²", 0.25, "GLDAS_NOAH025_M", "2.1", "NASA GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_M_2.1/summary",
             _MODEL_NOTE + " Root depth changes with the type of plants, so compare places by their trend, "
             "not their amounts."),
    Variable("seawifs_chlorophyll", "chlor_a_seawifs", "Ocean chlorophyll", "ocean",
             "How much green algae floats near the sea surface; more algae makes the water greener.",
             "SeaWiFS Level-3 mapped monthly chlorophyll-a (9 km, reprocessing 2022.0), ocean only, "
             "on a common global grid.",
             "mg/m³", 0.083, "SeaWiFS_L3m_CHL", "2022.0", "NASA OB.DAAC",
             "https://doi.org/10.5067/ORBVIEW-2/SeaWiFS/L3M/CHL/2022.0",
             "Ocean only. The satellite stopped in December 2010, so this covers 2001–2010. Values are very uneven: "
             "a regional average is dominated by coastal blooms."),
    Variable("cru_precip", "precip_cru", "Precipitation (station grid)", "water",
             "Monthly rain from weather stations, spread onto a map grid.",
             "CRU TS 4.10 monthly precipitation (0.5°), interpolated from weather stations, land only; "
             "cells with no station within range (stn = 0) are removed.",
             "mm/month", 0.5, "CRU TS", "4.10", "University of East Anglia (CRU)",
             "https://crudata.uea.ac.uk/cru/data/hrg/cru_ts_4.10/",
             "Not NASA data: built from weather stations by the University of East Anglia. Cells with no nearby "
             "station are left empty."),
    Variable("gldas_soil_moisture_10_40cm", "sm_10_40cm_gldas", "Soil moisture (10–40 cm)", "water",
             "How wet the soil is just below the surface, 10 to 40 cm down.",
             "GLDAS Noah land surface model, volumetric soil moisture 10–40 cm, on a common global grid.",
             "m³/m³", 0.25, "GLDAS_NOAH025_M", "2.1", "NASA GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_M_2.1/summary", _MODEL_NOTE),
    Variable("gldas_soil_moisture_40_100cm", "sm_40_100cm_gldas", "Soil moisture (40–100 cm)", "water",
             "How wet the soil is deeper down, from 40 cm to 1 metre.",
             "GLDAS Noah land surface model, volumetric soil moisture 40–100 cm, on a common global grid.",
             "m³/m³", 0.25, "GLDAS_NOAH025_M", "2.1", "NASA GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_M_2.1/summary", _MODEL_NOTE),
    Variable("gldas_soil_moisture_100_200cm", "sm_100_200cm_gldas", "Soil moisture (100–200 cm)", "water",
             "How wet the deep soil is, 1 to 2 metres down. It changes slowly and remembers droughts.",
             "GLDAS Noah land surface model, volumetric soil moisture 100–200 cm, on a common global grid.",
             "m³/m³", 0.25, "GLDAS_NOAH025_M", "2.1", "NASA GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_M_2.1/summary", _MODEL_NOTE),
]
VARIABLES: dict[str, Variable] = {v.id: v for v in _VARS}

# Bước chọn của người dùng: BIẾN MÔI TRƯỜNG (parameter) → DATASET. Một parameter có thể có nhiều dataset
# (vd. nhiệt độ không khí: GLDAS chỉ đất liền, MERRA-2 cả đất lẫn biển).
PARAMETERS = {
    "precipitation": "Precipitation",
    "soil_moisture": "Soil moisture",
    "air_temperature": "Air temperature",
    "evapotranspiration": "Evapotranspiration",
    "potential_evapotranspiration": "Potential evapotranspiration",
    "vegetation": "Vegetation greenness",
    "land_surface_temperature": "Land surface temperature",
    "root_zone_water": "Root-zone soil water",
    "ocean_chlorophyll": "Ocean chlorophyll (algae)",
}
# variable id → (parameter, tên dataset ngắn để hiển thị)
VARIABLE_PARAMETER = {
    "imerg_precip": ("precipitation", "GPM IMERG (satellite)"),
    "gldas_soil_moisture_0_10cm": ("soil_moisture", "GLDAS Noah 0–10 cm (land model)"),
    "gldas_air_temperature": ("air_temperature", "GLDAS Noah (land only)"),
    "merra2_air_temperature_2m": ("air_temperature", "MERRA-2 (land and sea)"),
    "gldas_evapotranspiration": ("evapotranspiration", "GLDAS Noah (land model)"),
    "modis_et": ("evapotranspiration", "MODIS Terra (satellite)"),
    "gldas_potential_evapotranspiration": ("potential_evapotranspiration", "GLDAS Noah (land model)"),
    "modis_ndvi": ("vegetation", "MODIS Terra (satellite)"),
    "modis_lst_day": ("land_surface_temperature", "MODIS Terra, daytime"),
    "modis_lst_night": ("land_surface_temperature", "MODIS Terra, night-time"),
    "gpcc_precip": ("precipitation", "GPCC (rain gauges, not NASA)"),
    "cru_precip": ("precipitation", "CRU TS (weather stations, not NASA)"),
    "smap_soil_moisture_surface": ("soil_moisture", "SMAP (satellite, top ~5 cm)"),
    "gldas_soil_moisture_10_40cm": ("soil_moisture", "GLDAS Noah 10–40 cm (land model)"),
    "gldas_soil_moisture_40_100cm": ("soil_moisture", "GLDAS Noah 40–100 cm (land model)"),
    "gldas_soil_moisture_100_200cm": ("soil_moisture", "GLDAS Noah 100–200 cm (land model)"),
    "gldas_root_zone_moisture": ("root_zone_water", "GLDAS Noah (land model)"),
    "seawifs_chlorophyll": ("ocean_chlorophyll", "SeaWiFS (satellite, ocean only)"),
}
# Chat: câu hỏi chung chung ("precipitation", "soil moisture") không nêu dataset/độ sâu thì chọn biến mặc định này.
DEFAULT_VARIABLE = {"precipitation": "imerg_precip", "soil_moisture": "gldas_soil_moisture_0_10cm"}
assert set(VARIABLE_PARAMETER) == set(VARIABLES)
assert {v.pipeline_id for v in _VARS} <= set(papi.VARIABLES), "catalog lệch với pipeline.api.VARIABLES"


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    bbox: tuple[float, float, float, float]
    is_demo: bool = False


_REGION_NAMES = {
    "mekong_delta": "Mekong Delta, Vietnam",
    "central_highlands": "Central Highlands, Vietnam",
    "hanoi": "Hanoi, Vietnam",
}
DEMO_REGION_ID = "global"


def _load_regions() -> dict[str, Region]:
    # Bản đồ toàn cầu (đội chốt 13/11/2026): vùng demo là cả thế giới; các vùng Mekong / Việt Nam giữ làm ví dụ.
    regions: dict[str, Region] = {
        DEMO_REGION_ID: Region(DEMO_REGION_ID, "Whole world", (-180.0, -90.0, 180.0, 90.0), True),
        "mekong_region": Region("mekong_region", "Mekong region (whole basin)", (94.0, 8.0, 110.0, 35.0))}
    path = config.PIPELINE_DIR / "config" / "regions.geojson"
    if path.exists():
        for f in json.loads(path.read_text(encoding="utf-8"))["features"]:
            rid = f["properties"]["id"]
            ring = f["geometry"]["coordinates"][0]
            lons, lats = [p[0] for p in ring], [p[1] for p in ring]
            regions[rid] = Region(rid, _REGION_NAMES.get(rid, rid.replace("_", " ").title()),
                                  (min(lons), min(lats), max(lons), max(lats)))
    regions.setdefault("mekong_delta", Region("mekong_delta", _REGION_NAMES["mekong_delta"], (104.4, 8.5, 106.9, 11.1)))
    regions["northern_vietnam"] = Region("northern_vietnam", "Northern Vietnam", (104.5, 20.1, 107.25, 22.25))
    # Vùng của các ví dụ "Try one" ở Home (đã kiểm Seasonal MK ngày 15/11/2026, xem reports/trend_candidates_tested.csv).
    regions["central_chile"] = Region("central_chile", "Central Chile", (-73.0, -38.0, -70.0, -30.0))
    regions["southern_amazon"] = Region("southern_amazon", "Southern Amazon", (-65.0, -15.0, -45.0, -5.0))
    regions["europe"] = Region("europe", "Europe", (-10.0, 36.0, 40.0, 70.0))
    regions["mediterranean"] = Region("mediterranean", "Mediterranean", (-10.0, 30.0, 40.0, 45.0))
    return regions


REGIONS: dict[str, Region] = _load_regions()


@dataclass(frozen=True)
class Country:
    name: str
    bbox: tuple[float, float, float, float]
    rings: tuple                      # các vòng (N, 2) lon/lat của mọi mảnh, cho pipeline.grid.shape_mask


def _load_countries() -> dict[str, Country]:
    """Đường viền quốc gia Natural Earth 1:110m (world-atlas 2.0.2, cùng file frontend vẽ và tìm kiếm), khoá theo tên.
    TopoJSON: mỗi cung lưu toạ độ lượng tử hoá dạng chênh lệch; chỉ số âm ~i là cung i đi ngược."""
    path = config.PIPELINE_DIR / "config" / "countries-110m.json"
    if not path.exists():
        return {}
    topo = json.loads(path.read_text(encoding="utf-8"))
    (sx, sy), (tx, ty) = topo["transform"]["scale"], topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x, y = x + dx, y + dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(idx: list[int]) -> list:
        out: list = []
        for i in idx:
            pts = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(pts if not out else pts[1:])   # cung sau bắt đầu ở điểm cuối của cung trước
        return out

    countries: dict[str, Country] = {}
    for g in topo["objects"]["countries"]["geometries"]:
        polys = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"] if g["type"] == "MultiPolygon" else []
        rings = tuple(tuple(ring(r)) for poly in polys for r in poly)
        if not rings:
            continue
        lons = [p[0] for r in rings for p in r]
        lats = [p[1] for r in rings for p in r]
        name = g["properties"]["name"]
        countries[name] = Country(name, (min(lons), min(lats), max(lons), max(lats)), rings)
    return countries


COUNTRIES: dict[str, Country] = _load_countries()
