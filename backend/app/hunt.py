"""Phase 8.5C: Contradiction Hunter 2.0, a bounded and transparent discovery scan.

How it works (no new statistics):
1. Read the already computed trend map (per-cell Seasonal MK + Sen, BH-FDR across cells) for the period.
2. Split the search extent into square tiles and summarise each tile: valid cells, share of FDR-significant
   increasing cells, share of FDR-significant decreasing cells, mean Sen slope.
3. Rule categories (explicit, deterministic):
   - regions mode: pairs of tiles whose dominant significant direction is opposite;
   - datasets mode: tiles where two compatible products give opposite mean slopes or different
     significance pictures.
4. Ranking: by the weaker tile's significant share (strength of the weaker side), then by the absolute mean
   slope difference, then by distance, then by tile coordinates. No "confidence %" is produced.
5. Regions mode re-tests the top candidates with the existing /compare test (block-bootstrap difference of
   slopes on anomalies). Datasets mode has no approved difference test, so it stays descriptive.
"""
from __future__ import annotations

import math
import time

from .errors import ApiError

MAX_TILES = 600          # bounded work per scan
MAX_CANDIDATES = 8
MAX_RETESTS = 5          # real /compare calls per scan
DOMINANT_SHARE = 0.30    # a tile "leans" one way when ≥ 30% of its valid cells are FDR-significant that way
MIN_VALID = 4            # cells needed for a tile to count

# Products that measure the same physical quantity in the same units. Coverage and generation differ, so a
# comparison is allowed but always described with these caveats.
COMPATIBLE: dict[frozenset, str] = {
    frozenset({"gldas_air_temperature", "merra2_air_temperature_2m"}):
        "Both are near-surface air temperature in °C. GLDAS is a land-surface model (land only, forced by observations); "
        "MERRA-2 is an atmospheric reanalysis (land and sea). They are generated differently, so neither is ground truth.",
    frozenset({"gldas_evapotranspiration", "modis_et"}):
        "Both are actual evapotranspiration in mm/month. GLDAS is a land-surface model; MODIS MOD16 is a satellite-based "
        "estimate available only where AppEEARS data were extracted.",
}


def compatibility(a: str, b: str) -> str | None:
    return COMPATIBLE.get(frozenset({a, b}))


def _tiles(cells: list[dict], extent: tuple, tile: float) -> dict:
    w, s, e, n = extent
    out: dict[tuple, dict] = {}
    for c in cells:
        lon, lat = c["lon"], c["lat"]
        if not (w <= lon < e and s <= lat < n) or not c.get("valid") or c.get("slope_per_decade") is None:
            continue
        key = (math.floor((lon - w) / tile), math.floor((lat - s) / tile))
        t = out.setdefault(key, {"n": 0, "up": 0, "down": 0, "vals": []})
        t["n"] += 1
        t["vals"].append(c["slope_per_decade"])
        if c.get("significant_fdr"):
            t["up" if c["slope_per_decade"] > 0 else "down"] += 1
    res = {}
    for (i, j), t in out.items():
        if t["n"] < MIN_VALID:
            continue
        bw, bs = w + i * tile, s + j * tile
        res[(i, j)] = {"bbox": [round(bw, 4), round(bs, 4), round(min(e, bw + tile), 4), round(min(n, bs + tile), 4)],
                       "n_valid": t["n"], "share_up": round(t["up"] / t["n"], 3), "share_down": round(t["down"] / t["n"], 3),
                       "mean_slope": math.fsum(t["vals"]) / t["n"]}   # fsum: same result in any cell order
    return res


def _lean(t: dict) -> str | None:
    if t["share_up"] >= DOMINANT_SHARE and t["share_up"] > t["share_down"]:
        return "up"
    if t["share_down"] >= DOMINANT_SHARE and t["share_down"] > t["share_up"]:
        return "down"
    return None


def _dist(a: dict, b: dict) -> float:
    ca = ((a["bbox"][0] + a["bbox"][2]) / 2, (a["bbox"][1] + a["bbox"][3]) / 2)
    cb = ((b["bbox"][0] + b["bbox"][2]) / 2, (b["bbox"][1] + b["bbox"][3]) / 2)
    return round(math.hypot(ca[0] - cb[0], ca[1] - cb[1]), 1)


def check_extent(extent: tuple, tile: float) -> None:
    w, s, e, n = extent
    if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
        raise ApiError(422, "VALIDATION_ERROR", "extent must be west,south,east,north inside the globe.")
    tiles = math.ceil((e - w) / tile) * math.ceil((n - s) / tile)
    if tiles > MAX_TILES:
        raise ApiError(400, "RESOURCE_LIMIT",
                       f"This search would scan {tiles} tiles; the limit is {MAX_TILES}. Use larger tiles or a smaller extent.",
                       {"tiles": tiles, "max_tiles": MAX_TILES})


def region_candidates(cells: list[dict], extent: tuple, tile: float, top: int) -> tuple[list[dict], int]:
    tiles = _tiles(cells, extent, tile)
    ups = [t for t in tiles.values() if _lean(t) == "up"]
    downs = [t for t in tiles.values() if _lean(t) == "down"]
    ups.sort(key=lambda t: (-t["share_up"], t["bbox"]))
    downs.sort(key=lambda t: (-t["share_down"], t["bbox"]))
    pairs = []
    for a in ups[:15]:
        for b in downs[:15]:
            pairs.append({"a": a, "b": b, "weaker_share": min(a["share_up"], b["share_down"]),
                          "slope_gap": abs(a["mean_slope"] - b["mean_slope"]), "distance_deg": _dist(a, b)})
    pairs.sort(key=lambda p: (-p["weaker_share"], -p["slope_gap"], p["distance_deg"], p["a"]["bbox"], p["b"]["bbox"]))
    out, used = [], set()
    for p in pairs:                       # each tile appears at most once so candidates are distinct places
        ka, kb = tuple(p["a"]["bbox"]), tuple(p["b"]["bbox"])
        if ka in used or kb in used:
            continue
        used |= {ka, kb}
        out.append(p)
        if len(out) >= top:
            break
    return out, len(tiles)


def dataset_candidates(cells_a: list[dict], cells_b: list[dict], extent: tuple, tile: float, top: int) -> tuple[list[dict], int]:
    ta, tb = _tiles(cells_a, extent, tile), _tiles(cells_b, extent, tile)
    rows = []
    for k in sorted(set(ta) & set(tb)):
        a, b = ta[k], tb[k]
        la, lb = _lean(a), _lean(b)
        opposite = a["mean_slope"] * b["mean_slope"] < 0
        reasons = []
        if opposite:
            reasons.append("opposite_direction")
        if la != lb:
            reasons.append("different_significance_picture")
        if not reasons:
            continue
        rows.append({"a": a, "b": b, "reasons": reasons, "lean_a": la, "lean_b": lb,
                     "weaker_share": min(max(a["share_up"], a["share_down"]), max(b["share_up"], b["share_down"])),
                     "slope_gap": abs(a["mean_slope"] - b["mean_slope"]), "both_lean_opposite": bool(la and lb and la != lb)})
    rows.sort(key=lambda r: (-r["both_lean_opposite"], -("opposite_direction" in r["reasons"]), -r["weaker_share"], -r["slope_gap"], r["a"]["bbox"]))
    return rows[:top], len(set(ta) & set(tb))


def classify_compare(verdict: str) -> tuple[str, str]:
    return {
        "opposite_significant": ("statistical_evidence", "Opposite directions, and the difference between the two trends is statistically significant."),
        "opposite_not_significant": ("inconclusive", "Opposite directions in the regional test, but the difference is not statistically confirmed."),
        "same_direction": ("descriptive", "The map tiles lean opposite ways, but the regional averages point the same way: not a contradiction."),
        "insufficient_data": ("unsupported", "Not enough data to test this pair."),
    }.get(verdict, ("unsupported", "No test result."))


class Timer:
    def __init__(self):
        self.t0 = time.perf_counter()

    def ms(self) -> int:
        return int((time.perf_counter() - self.t0) * 1000)
