"""Scientific test matrix. Every geographic case has an exact box (W, S, E, N, degrees, boundaries inclusive)."""
PRESETS = {  # from GET /api/v1/regions on 15 Nov 2026
    "global": (-180.0, -90.0, 180.0, 90.0), "mekong_region": (94.0, 8.0, 110.0, 35.0),
    "mekong_delta": (104.4, 8.5, 106.9, 11.1), "central_highlands": (107.2, 11.2, 109.0, 15.5),
    "hanoi": (105.3, 20.5, 106.1, 21.4), "northern_vietnam": (104.5, 20.1, 107.25, 22.25),
}

P, T, TL, SM, ET = ("imerg_precip", "merra2_air_temperature_2m", "gldas_air_temperature",
                    "gldas_soil_moisture_0_10cm", "gldas_evapotranspiration")


def preset(i):
    return {"type": "preset", "id": i}, PRESETS[i]


def box(b, name=None):
    r = {"type": "bbox", "bbox": list(b)}
    if name:
        r["name"] = name
    return r, tuple(b)


# expect: "ok" (a computed trend), "insufficient" (series returned, no test), or an HTTP error code + API code
CASES = [
    ("TC-01", "Mekong Delta, Vietnam", P, *preset("mekong_delta"), "2001-01", "2024-12", "ok"),
    ("TC-02", "Hanoi, Vietnam", T, *preset("hanoi"), "2001-01", "2025-12", "ok"),
    ("TC-03", "Sahara Desert", T, *box((-10, 18, 30, 30), "Sahara"), "2001-01", "2025-12", "ok"),
    ("TC-04", "Amazon Basin", P, *box((-75, -15, -50, 5), "Amazon Basin"), "2001-01", "2024-12", "ok"),
    ("TC-05", "California, USA", SM, *box((-124.5, 32.5, -114, 42), "California"), "2001-01", "2025-12", "ok"),
    ("TC-06a", "Australia", T, *box((113, -39, 154, -11), "Australia"), "2001-01", "2025-12", "ok"),
    ("TC-06b", "Australia", TL, *box((113, -39, 154, -11), "Australia"), "2001-01", "2025-12", "ok"),
    ("TC-07", "Arctic (north of 66.5 N)", T, *box((-180, 66.5, 180, 90), "Arctic"), "2001-01", "2025-12", "ok"),
    ("TC-08", "Central Africa (Congo Basin)", ET, *box((10, -5, 30, 5), "Central Africa"), "2001-01", "2025-12", "ok"),
    ("TC-09", "Coastal Bangladesh (land and sea cells)", SM, *box((88, 21, 92.5, 23), "Coastal Bangladesh"), "2001-01", "2025-12", "ok"),
    ("TC-10", "User box: Wisconsin, USA", T, *box((-92.9, 42.5, -86.8, 47.1)), "2001-01", "2025-12", "ok"),
    ("TC-11", "Whole world", T, *preset("global"), "2001-01", "2025-12", "ok"),
    ("TC-12", "Box crossing the antimeridian", T, *box((170, -20, -170, -10)), "2001-01", "2025-12", (422, None)),
    ("TC-13", "Mekong Delta, March start and November end", T, *preset("mekong_delta"), "2003-03", "2024-11", "ok"),
    ("TC-14", "Open Pacific Ocean, land-only variable", SM, *box((-150, -10, -140, 0)), "2001-01", "2025-12", (404, "NO_DATA")),
    ("TC-15", "Mekong Delta, 7 years only", P, *preset("mekong_delta"), "2018-01", "2024-12", "insufficient"),
    ("TC-16", "Mekong Delta, period including months without IMERG data", P, *preset("mekong_delta"), "2001-01", "2025-12", "ok"),
    ("TC-17", "Central Highlands, Vietnam", ET, *preset("central_highlands"), "2001-01", "2025-12", "ok"),
    ("TC-18", "Northern Vietnam", SM, *preset("northern_vietnam"), "2001-01", "2025-12", "ok"),
    ("TC-19", "Mekong region (whole basin)", P, *preset("mekong_region"), "2001-01", "2024-12", "ok"),
    ("TC-20a", "Sahel", T, *box((-17, 10, 30, 18), "Sahel"), "2001-01", "2025-12", "ok"),
    ("TC-20b", "Sahel", TL, *box((-17, 10, 30, 18), "Sahel"), "2001-01", "2025-12", "ok"),
    ("TC-21", "Box smaller than one grid cell", T, *box((105.1, 10.1, 105.2, 10.2)), "2001-01", "2025-12", (400, "REGION_TOO_SMALL")),
    ("TC-22", "Southern Ocean and Antarctica (south of 60 S)", T, *box((-180, -90, 180, -60)), "2001-01", "2025-12", "ok"),
    ("TC-23", "Sahara Desert, precipitation (many tied zero months)", P, *box((-10, 18, 30, 30), "Sahara"), "2001-01", "2024-12", "ok"),
]
