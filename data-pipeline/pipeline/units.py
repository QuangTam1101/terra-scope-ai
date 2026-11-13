"""Đổi đơn vị về đơn vị chuẩn, có assert đơn vị nguồn (docs/03 §G, docs/02 §4.2; docs/01 S7)."""
import pandas as pd

# ID biến Giovanni → (đơn vị nguồn chấp nhận, đơn vị chuẩn, hàm đổi(value, time))
GIOVANNI_UNITS = {
    "GPM_3IMERGM_07_precipitation":
        ({"mm/hr", "mm/h", "mm hr-1"}, "mm/month", lambda v, t: v * 24 * t.dt.days_in_month),
    "GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst":
        ({"kg/m^2", "kg m-2", "kg/m2"}, "m3/m3", lambda v, t: v / 100.0),   # lớp 0–10 cm dày 100 mm
    "GLDAS_NOAH025_M_2_1_Tair_f_inst":
        ({"K"}, "degC", lambda v, t: v - 273.15),
    "GLDAS_NOAH025_M_2_1_Evap_tavg":
        ({"kg/m^2/s", "kg m-2 s-1", "kg/m2/s"}, "mm/day", lambda v, t: v * 86400),
    "M2IMNXASM_5_12_4_T2M":
        ({"K"}, "degC", lambda v, t: v - 273.15),
}


def giovanni_unit(meta):
    """⚠️ Tên khoá chứa đơn vị chưa xác nhận trên file thật → tìm khoá có chữ 'unit'; không thấy thì dừng."""
    keys = [k for k in meta if "unit" in k.lower()]
    if len(keys) != 1:
        raise ValueError(f"Không tìm thấy đúng 1 khoá đơn vị trong metadata: {list(meta)}")
    return meta[keys[0]]


def convert_units(var_id, values: pd.Series, time: pd.Series, unit: str):
    """Assert đơn vị nguồn rồi đổi. Sai đơn vị → dừng, không đoán (nhân nhầm × 744 là im lặng)."""
    accepted, std_unit, f = GIOVANNI_UNITS[var_id]
    assert unit.strip() in accepted, f"{var_id}: đơn vị nguồn '{unit}' không nằm trong {accepted}, không đổi"
    t = pd.Series(pd.to_datetime(pd.Series(time)).to_numpy(), index=values.index)   # căn index với values
    return f(values, t), std_unit


def kelvin_to_c(v):
    """LST (MODIS) đã scale → °C."""
    return v - 273.15
