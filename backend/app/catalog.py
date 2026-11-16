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
        return {"degC": "°C", "m3/m3": "m³/m³", "kg/m2": "kg/m²", "mg/m3": "mg/m³", "gC/m2/month": "g C/m²/month"}.get(u, self.display_units_base if u == "1" else u)

    @property
    def source(self) -> dict:
        return {"product": self.product, "version": self.version, "provider": self.provider, "url": self.url,
                "citation": papi.VARIABLES[self.pipeline_id][2]}


_MODIS_NOTE = ("MODIS is an optical satellite sensor: it cannot see through cloud, so very cloudy months (and snow for "
               "NDVI) can be missing. Each 0.5° cell is the mean of its clear 0.05° MODIS pixels.")
_ZERO_NOTE = (" Events come in a short season, so the rate of change is measured on yearly averages (the "
              "significance test still compares matching months).")
_LST_NOTE = (_MODIS_NOTE + " Terra's overpass time has drifted earlier since 2020 (its last orbit adjustment) as the "
             "satellite ends its mission, which can make recent daytime surface temperatures read slightly cooler "
             "(night-time slightly warmer); check whether a trend holds when the period ends in 2019.")
_MODEL_NOTE = "This variable comes from a model/reanalysis that assimilates observations, not a direct measurement."
_DROUGHT_NOTE = (_MODEL_NOTE + " Drought here means drier than 4 in 5 of the same weeks in 1948–2012 (the 20th "
                 "percentile, the US Drought Monitor's moderate drought or worse). Starts February 2003.")

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
    # Added 16/11/2026 (data-pipeline/build_extra_cubes.py, 1° cubes)
    Variable("grace_water_storage", "tws_grace", "Land water storage (GRACE)", "water",
             "All the water stored on and under the land: lakes, soil, snow, ice and groundwater, weighed from space.",
             "GRACE/GRACE-FO JPL Mascon RL06.3 CRI v04 terrestrial water storage anomaly (cm of liquid water) "
             "relative to the 2004–2009 mean, land only, 3° mascons on a 0.5° grid averaged to 1°.",
             "cm", 0.5, "TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4", "RL06.3 v04", "NASA JPL / PO.DAAC",
             "https://doi.org/10.5067/TEMSC-3JC634",
             "Values are changes from the 2004–2009 average, not totals. The record starts in April 2002 and has "
             "an 11-month gap between the two missions (2017-07 to 2018-05). Each mascon is about 300 km wide, so "
             "small regions share one value. Greenland and glacier loss count as land water loss."),
    Variable("gldas_snow_water", "swe_gldas", "Snow water (GLDAS)", "water",
             "How much water is locked in the snowpack: the water you would get if all the snow melted.",
             "GLDAS Noah land surface model snow water equivalent (SWE_inst, kg/m² = mm of water), monthly.",
             "kg/m²", 0.25, "GLDAS_NOAH025_M", "2.1", "NASA GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_M_2.1/summary",
             _MODEL_NOTE + " Ice sheets (Greenland) and glaciers are removed: the model piles snow up there without melting "
             "it. Look at the snow months (for example March) with Month by year."),
    Variable("merra2_aerosol", "aod_merra2", "Air haze: all aerosols (MERRA-2)", "air",
             "How hazy the air is from smoke, dust, pollution and sea salt: 0 is crystal clear, 1 is very hazy.",
             "MERRA-2 total aerosol extinction optical thickness at 550 nm (TOTEXTTAU), monthly mean; assimilates "
             "satellite aerosol observations (MODIS, AVHRR, MISR) and ground sunphotometers (AERONET).",
             "unitless", 0.5, "M2TMNXAER", "5.12.4", "NASA GMAO / GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/M2TMNXAER_5.12.4/summary",
             _MODEL_NOTE + " Aerosol optical depth has no unit. Trends often change direction around 2010–2013 "
             "(for example China's clean-air rules): compare periods before and after."),
    Variable("merra2_dust", "dust_aod_merra2", "Air haze: desert dust (MERRA-2)", "air",
             "How much desert dust hangs in the air.",
             "MERRA-2 dust extinction optical thickness at 550 nm (DUEXTTAU), monthly mean.",
             "unitless", 0.5, "M2TMNXAER", "5.12.4", "NASA GMAO / GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/M2TMNXAER_5.12.4/summary",
             _MODEL_NOTE + " Dust is the part of the aerosol model with the least direct observation behind it."),
    Variable("cru_tmax", "tmax_cru", "Daytime highs (CRU TS)", "temperature",
             "How hot the hottest part of the day gets, averaged over the month.",
             "CRU TS 4.10 monthly mean of daily maximum temperature (tmx, 0.5°), interpolated from weather "
             "stations, land only; cells with no station within range (stn = 0) are removed.",
             "°C", 0.5, "CRU TS", "4.10", "University of East Anglia (CRU)",
             "https://crudata.uea.ac.uk/cru/data/hrg/cru_ts_4.10/",
             "Not NASA data: built from weather stations by the University of East Anglia. Compare with night-time "
             "lows to see whether days or nights warm faster."),
    Variable("cru_tmin", "tmin_cru", "Night-time lows (CRU TS)", "temperature",
             "How cold the coldest part of the night gets, averaged over the month.",
             "CRU TS 4.10 monthly mean of daily minimum temperature (tmn, 0.5°), interpolated from weather "
             "stations, land only; cells with no station within range (stn = 0) are removed.",
             "°C", 0.5, "CRU TS", "4.10", "University of East Anglia (CRU)",
             "https://crudata.uea.ac.uk/cru/data/hrg/cru_ts_4.10/",
             "Not NASA data: built from weather stations by the University of East Anglia. Part of CRU's "
             "minimum temperature is derived from mean temperature and daily range where stations are sparse."),
    Variable("firms_fire_count", "fire_count_firms", "Number of fires (MODIS active fires)", "fire",
             "How many fires satellites spot each month: every burning hot spot seen from space counts once.",
             "NASA FIRMS MODIS Collection 6.1 active-fire detections (MCD14ML, Terra and Aqua, 1 km), vegetation "
             "fires only (type 0) with confidence of at least 30 %, counted per 1° cell per month from 2003.",
             "fires/month", 0.01, "MCD14ML (FIRMS)", "6.1", "NASA FIRMS (LANCE)",
             "https://firms.modaps.eosdis.nasa.gov/download/",
             "Counts start in 2003, the first full year with both Terra and Aqua. A fire is counted only if it burns "
             "during one of the four daily overpasses and is not hidden by thick cloud or smoke. Terra (since 2020) "
             "and Aqua (since 2022) are drifting to new overpass times as their missions end, which can change how "
             "many fires they catch: check whether a trend holds when the period ends in 2019." + _ZERO_NOTE),
    Variable("micasa_fire", "fire_micasa", "Fire activity (MiCASA, from MODIS burned area)", "fire",
             "How much carbon wildfires and other fires release each month: more and bigger fires mean a higher value.",
             "MiCASA v1 monthly fire carbon emission (FIRE, 0.1°), driven by MODIS MCD64A1 burned area; converted "
             "to g of carbon per m² per month, land only.",
             "g C/m²/month", 0.1, "MICASA_FLUX_M", "1", "NASA GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/MICASA_FLUX_M_1/summary",
             _MODEL_NOTE + " Covers 2001–2024. Fire years are very uneven: one record season (Canada 2023) can "
             "dominate a regional trend, so read Each year as well as the slope." + _ZERO_NOTE),
    Variable("ibtracs_storms", "storms_ibtracs", "Tropical storms passing within 500 km (IBTrACS)", "storms",
             "How many tropical storms, typhoons or hurricanes pass within 500 km of a place each month.",
             "IBTrACS v04r01 best tracks (NOAA NCEI): distinct tropical cyclones of at least tropical-storm strength "
             "(34 knots or more) whose centre passed within 500 km of each 1° cell centre, per month.",
             "storms/month", 1.0, "IBTrACS", "v04r01", "NOAA NCEI",
             "https://www.ncei.noaa.gov/products/international-best-track-archive",
             "Not NASA data: the official storm tracks of the world's weather agencies, combined by NOAA. Places no "
             "storm reached in 2001–2025 have no data. 2025 tracks are still provisional (not yet re-analysed). "
             "Storms are rare and come in lucky and unlucky years, so a 25-year trend is hard to prove." + _ZERO_NOTE),
    Variable("graceda_drought_rootzone", "drought_rtz_grace", "Drought in the root zone (GRACE-DA)", "drought",
             "How much of each month the soil where plants drink is in drought.",
             "GRACE-DA-DM Global v3.0 (NASA GSFC, Catchment land model assimilating GRACE/GRACE-FO): share of weekly "
             "maps in the month with root-zone soil moisture at or below the 20th percentile of 1948–2012, averaged to 1°.",
             "% of weeks", 0.25, "GRACEDADM_CLSM025GL_7D", "3.0", "NASA GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/GRACEDADM_CLSM025GL_7D_3.0/summary", _DROUGHT_NOTE + _ZERO_NOTE),
    Variable("graceda_drought_groundwater", "drought_gws_grace", "Groundwater drought (GRACE-DA)", "drought",
             "How much of each month the water stored deep underground is in drought.",
             "GRACE-DA-DM Global v3.0 (NASA GSFC, Catchment land model assimilating GRACE/GRACE-FO): share of weekly "
             "maps in the month with groundwater storage at or below the 20th percentile of 1948–2012, averaged to 1°.",
             "% of weeks", 0.25, "GRACEDADM_CLSM025GL_7D", "3.0", "NASA GES DISC",
             "https://disc.gsfc.nasa.gov/datasets/GRACEDADM_CLSM025GL_7D_3.0/summary",
             _DROUGHT_NOTE + " Groundwater reacts to years of rain, not weeks, so its droughts start late and last long."
             + _ZERO_NOTE),
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
    "water_storage": "Land water storage",
    "snow": "Snow water",
    "air_haze": "Air haze (aerosols)",
    "fire": "Fire activity",
    "drought": "Drought",
    "tropical_storms": "Tropical storms",
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
    "grace_water_storage": ("water_storage", "GRACE / GRACE-FO (satellite gravity)"),
    "gldas_snow_water": ("snow", "GLDAS Noah (land model)"),
    "merra2_aerosol": ("air_haze", "MERRA-2, all aerosols"),
    "merra2_dust": ("air_haze", "MERRA-2, desert dust only"),
    "cru_tmax": ("air_temperature", "CRU TS daytime highs (stations, not NASA)"),
    "cru_tmin": ("air_temperature", "CRU TS night-time lows (stations, not NASA)"),
    "firms_fire_count": ("fire", "MODIS active fires: number of fires"),
    "micasa_fire": ("fire", "MiCASA: carbon released (from burned area)"),
    "ibtracs_storms": ("tropical_storms", "IBTrACS storm tracks (not NASA)"),
    "graceda_drought_rootzone": ("drought", "GRACE-DA: root-zone soil"),
    "graceda_drought_groundwater": ("drought", "GRACE-DA: groundwater"),
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
