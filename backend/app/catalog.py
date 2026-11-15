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
        return {"degC": "°C", "m3/m3": "m³/m³"}.get(u, self.display_units_base if u == "1" else u)

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
}
# variable id → (parameter, tên dataset ngắn để hiển thị)
VARIABLE_PARAMETER = {
    "imerg_precip": ("precipitation", "GPM IMERG (satellite)"),
    "gldas_soil_moisture_0_10cm": ("soil_moisture", "GLDAS Noah (land model)"),
    "gldas_air_temperature": ("air_temperature", "GLDAS Noah (land only)"),
    "merra2_air_temperature_2m": ("air_temperature", "MERRA-2 (land and sea)"),
    "gldas_evapotranspiration": ("evapotranspiration", "GLDAS Noah (land model)"),
    "modis_et": ("evapotranspiration", "MODIS Terra (satellite)"),
    "gldas_potential_evapotranspiration": ("potential_evapotranspiration", "GLDAS Noah (land model)"),
    "modis_ndvi": ("vegetation", "MODIS Terra (satellite)"),
    "modis_lst_day": ("land_surface_temperature", "MODIS Terra, daytime"),
    "modis_lst_night": ("land_surface_temperature", "MODIS Terra, night-time"),
}
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
    return regions


REGIONS: dict[str, Region] = _load_regions()
