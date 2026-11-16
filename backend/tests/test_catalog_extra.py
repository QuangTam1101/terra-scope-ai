"""F11: 8 sản phẩm lưới 0,5° nối thêm vào catalog (cube giả, không mạng)."""
import numpy as np
import pytest
import xarray as xr

from app import bridge, config
from app.conversation import prepare
from app.errors import ApiError
from app.schemas import ChatContext, ChatRequest

F11 = {
    "gpcc_precip": ("precipitation", "mm/month"),
    "cru_precip": ("precipitation", "mm/month"),
    "smap_soil_moisture_surface": ("soil_moisture", "m³/m³"),
    "gldas_soil_moisture_10_40cm": ("soil_moisture", "m³/m³"),
    "gldas_soil_moisture_40_100cm": ("soil_moisture", "m³/m³"),
    "gldas_soil_moisture_100_200cm": ("soil_moisture", "m³/m³"),
    "gldas_root_zone_moisture": ("root_zone_water", "kg/m²"),
    "modisa_chlorophyll": ("ocean_chlorophyll", "mg/m³"),
    "nsidc_sea_ice": ("sea_ice", "%"),
}


def test_f11_variables_listed(client):
    vs = {v["id"]: v for v in client.get("/api/v1/variables").json()["variables"]}
    for vid, (param, units) in F11.items():
        assert vs[vid]["parameter"] == param and vs[vid]["display_units"] == units, vid
        assert vs[vid]["parameter_name"] and vs[vid]["source"]["citation"]
    assert vs["modisa_chlorophyll"]["category"] == vs["nsidc_sea_ice"]["category"] == "ocean"
    assert vs["gldas_soil_moisture_0_10cm"]["dataset_name"] == "GLDAS Noah 0–10 cm (land model)"


def test_trimmed_cube_reports_trimmed_coverage(client):
    """Trục 2001–2020 nhưng chỉ có giá trị 2015-04 → 2020-12: cắt như bước 2 thì coverage là phần có giá trị."""
    full = xr.open_dataarray(config.CUBE_DIR / "cube_precip.nc").load().rename("sm_surface_smap")
    full = full.where(full["time"] >= np.datetime64("2015-04-01"))
    path = config.CUBE_DIR / "cube_sm_surface_smap.nc"
    full.sel(time=slice("2015-04", "2020-12")).to_netcdf(path, encoding={"sm_surface_smap": {"zlib": True}})
    try:
        assert bridge.coverage("sm_surface_smap") == ("2015-04", "2020-12")
        vs = {v["id"]: v for v in client.get("/api/v1/variables").json()["variables"]}
        assert vs["smap_soil_moisture_surface"]["available"]
        assert vs["smap_soil_moisture_surface"]["coverage"] == {"start": "2015-04", "end": "2020-12"}
    finally:
        path.unlink()


def _resolve(message):
    ctx, _op, _question = prepare(ChatRequest(message=message))
    return ctx


def test_chat_dataset_choice(client):
    assert _resolve("soil moisture in the Mekong Delta").variable_id == "gldas_soil_moisture_0_10cm"
    assert _resolve("GLDAS soil moisture in the Mekong Delta").variable_id == "gldas_soil_moisture_0_10cm"
    assert _resolve("precipitation in the Mekong Delta").variable_id == "imerg_precip"
    assert _resolve("SMAP soil moisture in the Mekong Delta").variable_id == "smap_soil_moisture_surface"
    assert _resolve("rain gauge trend in the Mekong Delta").variable_id == "gpcc_precip"
    assert _resolve("CRU precipitation in the Mekong Delta").variable_id == "cru_precip"
    assert _resolve("soil moisture 40-100 cm in the Mekong Delta").variable_id == "gldas_soil_moisture_40_100cm"
    assert _resolve("root zone soil moisture in the Mekong Delta").variable_id == "gldas_root_zone_moisture"
    ctx, _op, question = prepare(ChatRequest(message="chlorophyll trend in the Mekong Delta"))
    assert ctx.variable_id == "modisa_chlorophyll" and "not supported" not in (question or "")


def test_chat_fits_page_period_to_dataset_coverage(client):
    """Kỳ mang theo từ trang (2001–2020) phải kẹp vào coverage của biến mới (SMAP 2015-04 → 2020-12), không trả 400."""
    full = xr.open_dataarray(config.CUBE_DIR / "cube_precip.nc").load().rename("sm_surface_smap")
    path = config.CUBE_DIR / "cube_sm_surface_smap.nc"
    full.sel(time=slice("2015-04", "2020-12")).to_netcdf(path)
    try:
        page = ChatContext(region={"type": "preset", "id": "mekong_delta"}, start="2001-01", end="2020-12")
        ctx, _op, question = prepare(ChatRequest(message="SMAP soil moisture here", context=page))
        assert (ctx.variable_id, ctx.start, ctx.end) == ("smap_soil_moisture_surface", "2015-04", "2020-12")
        with pytest.raises(ApiError, match="outside the available data"):   # kỳ người dùng tự gõ thì không tự sửa
            prepare(ChatRequest(message="SMAP soil moisture from 2001 to 2020", context=page))
    finally:
        path.unlink()
