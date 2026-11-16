"""FastAPI app. Chạy (từ thư mục backend/):  uvicorn app.main:app --reload --port 8000
Swagger: http://localhost:8000/docs · OpenAPI: http://localhost:8000/openapi.json"""
import logging
import os
import gzip
import hashlib
import json
import threading
from functools import lru_cache
from uuid import uuid4
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import APIRouter, FastAPI, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from . import bridge, catalog, chat, config, errors, forecast_service, hunt, service, timelapse
from .errors import ApiError
from pydantic import BaseModel, Field
from .schemas import (ChatRequest, ChatResponse, CompareRequest, CompareResponse, ExplainRequest, ExplainResponse, GridResponse,
                      HealthResponse, RegionsResponse, SeriesRequest, SeriesResponse, TrendRequest, TrendResponse,
                      ValueGridResponse, VariablesResponse)

log = logging.getLogger("terra-scope")


def _warm_up():
    """Tính sẵn bản đồ xu hướng toàn kỳ cho mọi biến có cube (lần đầu ~15 s/biến ở lưới 1° toàn cầu),
    để người dùng / giám khảo không phải chờ ở lần bấm đầu. Chạy nền, lỗi chỉ ghi log."""
    for v in catalog.VARIABLES.values():
        m = bridge.meta(v.pipeline_id)
        if not m:
            continue
        start = m["start"] if m["start"].endswith("-01") else f"{int(m['start'][:4]) + 1}-01"
        end = m["end"] if m["end"].endswith("-12") else f"{int(m['end'][:4]) - 1}-12"
        try:
            _grid_bytes("trend", v.id, start, end, None, config.DEFAULT_ALPHA)   # đọc từ đĩa nếu đã tính trước đó
            log.info("warm-up done: %s %s..%s", v.id, start, end)
        except Exception:
            log.exception("warm-up failed: %s", v.id)


@asynccontextmanager
async def lifespan(_app):
    if os.getenv("WARM_UP", "1") == "1":
        threading.Thread(target=_warm_up, daemon=True, name="grid-warm-up").start()
    yield


app = FastAPI(title="Terra-scope AI API", version=config.VERSION, lifespan=lifespan,
              description="Regional trend analysis on NASA Earth observation data "
                          "(contract: FRONTEND_BACKEND_CONTRACT v0.2).")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["GET", "POST", "OPTIONS"],
                   allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)          # heatmap toàn cầu ~8 MB JSON → nén còn khoảng 1/5
errors.install(app)

api = APIRouter(prefix="/api/v1")


@api.get("/health", response_model=HealthResponse)
def health():
    return {"status": "ok", "version": config.VERSION, "available_variables": service.available_variables()}


@api.get("/variables", response_model=VariablesResponse)
def variables():
    return service.variables()


@api.get("/llm/status")
def llm_status():
    settings = config.llm_settings()
    import re
    model = settings.model if re.fullmatch(r"gemini-[a-zA-Z0-9.-]{1,80}", settings.model) else "invalid"
    if settings.api_key and settings.api_key in model:
        model = "redacted"
    return {"provider": settings.provider if settings.provider in {"gemini", "template"} else "unsupported",
            "model": model, "configured": bool(settings.api_key) and settings.valid}


@api.get("/regions", response_model=RegionsResponse)
def regions():
    return service.regions()


@api.post("/series", response_model=SeriesResponse)
def series(req: SeriesRequest):
    return service.series(req)


@api.post("/trends", response_model=TrendResponse)
def trends(req: TrendRequest):
    return service.trends(req)


# Bản đồ lưới 0,5° toàn cầu có 259.200 ô: tính thống kê ~70 s/biến, dựng JSON ~5 s. Nên lưu bản JSON đã nén gzip
# (1) trong RAM, (2) ra đĩa (GRID_CACHE_DIR) để khởi động lại không tính lại, (3) cho trình duyệt giữ (ETag +
# Cache-Control) để mở tab khác không tải lại. Khoá có thời điểm sửa file dữ liệu: dữ liệu đổi thì khoá đổi.
def _grid_key(kind: str, args: tuple) -> str:
    v = catalog.VARIABLES.get(args[0])
    p = bridge.cube_path(v.pipeline_id) if v else None
    stamp = int(p.stat().st_mtime) if p and p.exists() else 0
    text = json.dumps([kind, list(args), str(p), stamp, config.VERSION])
    return hashlib.sha1(text.encode()).hexdigest()[:20]


@lru_cache(maxsize=24)
def _grid_bytes(kind: str, *args) -> tuple[bytes, str]:
    key = _grid_key(kind, args)
    path = config.GRID_CACHE_DIR / f"{kind}_{args[0]}_{key}.json.gz"
    if path.exists():
        return path.read_bytes(), key
    data = service.trend_grid(*args) if kind == "trend" else service.value_grid(*args)
    model = GridResponse if kind == "trend" else ValueGridResponse
    # exclude_unset: lat/lon cells carry no hemi/row/col (only polar-grid cells set them)
    packed = gzip.compress(model.model_validate(data).model_dump_json(exclude_unset=True).encode(), compresslevel=5)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        tmp.write_bytes(packed)
        tmp.replace(path)
    except OSError:
        log.warning("cannot write grid cache %s", path)
    return packed, key


def _grid_response(request: Request, kind: str, *args) -> Response:
    packed, key = _grid_bytes(kind, *args)
    etag = f'"{key}"'
    headers = {"ETag": etag, "Cache-Control": "public, max-age=86400", "Vary": "Accept-Encoding"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    if "gzip" in request.headers.get("accept-encoding", ""):
        return Response(packed, media_type="application/json", headers={**headers, "Content-Encoding": "gzip"})
    return Response(gzip.decompress(packed), media_type="application/json", headers=headers)


@api.get("/trends/grid", response_model=GridResponse)
def trends_grid(request: Request, variable_id: str, start: str = Query(..., examples=["2001-01"]),
                end: str = Query(..., examples=["2020-12"]),
                bbox: Optional[str] = Query(None, description="west,south,east,north", examples=["102,8,110,24"]),
                alpha: float = Query(config.DEFAULT_ALPHA, gt=0, lt=0.5)):
    return _grid_response(request, "trend", variable_id, start, end, bbox, alpha)


@api.get("/values/grid", response_model=ValueGridResponse)
def values_grid(request: Request, variable_id: str, start: str = Query(..., examples=["2001-01"]),
                end: str = Query(..., examples=["2024-12"]),
                bbox: Optional[str] = Query(None, description="west,south,east,north"),
                month: Optional[int] = Query(None, description="1–12: only average this calendar month")):
    return _grid_response(request, "values", variable_id, start, end, bbox, month)


@api.get("/values/frames")
def values_frames(variable_id: str, start: str = Query(..., examples=["2001-01"]), end: str = Query(..., examples=["2025-12"]),
                  bbox: Optional[str] = Query(None, description="west,south,east,north"),
                  kind: str = Query("anomaly", pattern="^(value|anomaly)$"),
                  hemi: str = Query("N", pattern="^[NS]$", description="sea ice only: which pole")):
    """Time-lapse frames for the 2D map (display only; see app/timelapse.py)."""
    v = service.get_variable(variable_id)
    service._check_time(v, start, end)
    return timelapse.frames(v, start, end, service._parse_bbox(bbox), kind, hemi)


@api.get("/grids/status")
def grids_status(kind: str = Query(..., pattern="^(trend|values)$"), variable_id: str = Query(...),
                 start: str = Query(...), end: str = Query(...), bbox: Optional[str] = Query(None),
                 month: Optional[int] = Query(None), alpha: float = Query(config.DEFAULT_ALPHA, gt=0, lt=0.5)):
    """Cheap check (no computation): is this map already computed? Lets the web say "loading a saved map"
    instead of "computing the global grid" (Phase 8.5A). Unknown variables answer cached=false."""
    args = (variable_id, start, end, bbox, alpha) if kind == "trend" else (variable_id, start, end, bbox, month)
    v = catalog.VARIABLES.get(variable_id)
    if v is None or not bridge.is_available(v.pipeline_id):
        return {"kind": kind, "cached": False, "available": False, "cell_size_deg": None}
    key = _grid_key(kind, args)
    cached = (config.GRID_CACHE_DIR / f"{kind}_{variable_id}_{key}.json.gz").exists()
    return {"kind": kind, "cached": cached, "available": True,
            "cell_size_deg": bridge.meta(v.pipeline_id)["cell_size_deg"]}


class DiscoverRequest(BaseModel):
    variable_id: str
    variable_id_b: Optional[str] = None        # set for a two-dataset scan
    start: str = Field(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    end: str = Field(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    extent: list[float] = Field(..., min_length=4, max_length=4)
    tile_deg: float = Field(5.0, ge=1.0, le=20.0)
    max_candidates: int = Field(5, ge=1, le=hunt.MAX_CANDIDATES)


def _grid_cells(variable_id: str, start: str, end: str) -> list[dict]:
    packed, _ = _grid_bytes("trend", variable_id, start, end, None, config.DEFAULT_ALPHA)   # cached map, computed once
    return json.loads(gzip.decompress(packed))["cells"]


def _region_out(t: dict) -> dict:
    keep = ("trend_id", "slope_per_decade", "p_value", "significant", "quality", "start", "end", "units", "region", "source")
    return {k: t[k] for k in keep}


def _ds_name(variable_id: str) -> str:
    return catalog.VARIABLE_PARAMETER.get(variable_id, ("", variable_id))[1]


@api.post("/hunt/discover")
def hunt_discover(req: DiscoverRequest):
    """Phase 8.5C: bounded discovery of candidate disagreements (rules in app/hunt.py). Runs in the thread pool
    (sync def), reuses the cached trend maps and re-tests at most hunt.MAX_RETESTS candidates."""
    timer = hunt.Timer()
    extent = tuple(float(x) for x in req.extent)
    hunt.check_extent(extent, req.tile_deg)
    v = service.get_variable(req.variable_id)
    service._check_time(v, req.start, req.end)
    criteria = {"tile_deg": req.tile_deg, "dominant_share": hunt.DOMINANT_SHARE, "min_valid_cells": hunt.MIN_VALID,
                "ranking": ["weaker side's FDR-significant share (desc)", "absolute mean-slope gap (desc)", "distance (asc)", "tile position"]}
    limits = {"max_tiles": hunt.MAX_TILES, "max_candidates": hunt.MAX_CANDIDATES, "max_retests": hunt.MAX_RETESTS}
    warnings = ["Exploratory scan: candidates are places worth investigating, not conclusions. Tiles summarise per-cell tests "
                "with Benjamini-Hochberg FDR on raw cell p-values without serial-dependence correction."]
    if req.variable_id_b is None:
        pairs, scanned = hunt.region_candidates(_grid_cells(v.id, req.start, req.end), extent, req.tile_deg, req.max_candidates)
        out = []
        for i, p in enumerate(pairs):
            cand = {"rank": i + 1, "type": "opposite_direction", "a": p["a"], "b": p["b"],
                    "metrics": {"weaker_share": p["weaker_share"], "slope_gap": p["slope_gap"], "distance_deg": p["distance_deg"]},
                    "reasons": [f"Tile A: {p['a']['share_up']:.0%} of {p['a']['n_valid']} cells are significant increases (FDR).",
                                f"Tile B: {p['b']['share_down']:.0%} of {p['b']['n_valid']} cells are significant decreases (FDR).",
                                f"Mean Sen slopes of the tiles differ by {p['slope_gap']:.3g} {v.display_units} per decade."],
                    "test": None, "regional": None, "classification": "descriptive",
                    "classification_text": "Map pattern only; not tested as two regions (only the top candidates are re-tested)."}
            if i < hunt.MAX_RETESTS:
                try:
                    cmp = service.compare(CompareRequest(variable_id=v.id, region_a={"type": "bbox", "bbox": p["a"]["bbox"]},
                                                         region_b={"type": "bbox", "bbox": p["b"]["bbox"]}, start=req.start, end=req.end))
                    cls, text = hunt.classify_compare(cmp["verdict"])
                    cand.update(test={"compare_id": cmp["compare_id"], "verdict": cmp["verdict"], "difference": cmp["difference"]},
                                regional={"a": _region_out(cmp["a"]), "b": _region_out(cmp["b"])},
                                classification=cls, classification_text=text)
                except ApiError as e:
                    cand.update(classification="unsupported", classification_text=e.message)
            out.append(cand)
        return {"mode": "regions", "variable_id": v.id, "variable_id_b": None, "start": req.start, "end": req.end,
                "extent": list(extent), "criteria": criteria, "tiles_scanned": scanned, "candidates": out,
                "compatibility": None, "runtime_ms": timer.ms(), "limits": limits, "warnings": warnings}

    vb = service.get_variable(req.variable_id_b)
    note = hunt.compatibility(v.id, vb.id)
    if note is None or v.display_units != vb.display_units:
        raise ApiError(400, "INCOMPATIBLE_DATASETS",
                       f"{v.name} ({v.id}) and {vb.name} ({vb.id}) do not measure the same quantity in the same units, so they are not compared.",
                       {"a": v.id, "b": vb.id})
    service._check_time(vb, req.start, req.end)
    ma, mb = bridge.meta(v.pipeline_id), bridge.meta(vb.pipeline_id)
    if not ma or not mb or ma["cell_size_deg"] != mb["cell_size_deg"]:
        raise ApiError(400, "INCOMPATIBLE_DATASETS", "The two products are not on the same processed grid.")
    rows, scanned = hunt.dataset_candidates(_grid_cells(v.id, req.start, req.end), _grid_cells(vb.id, req.start, req.end),
                                            extent, req.tile_deg, req.max_candidates)
    na, nb = _ds_name(v.id), _ds_name(vb.id)
    out = []
    for i, r in enumerate(rows):
        reasons = []
        if "opposite_direction" in r["reasons"]:
            reasons.append(f"Mean Sen slope over the tile: {na} {r['a']['mean_slope']:+.3g} vs {nb} {r['b']['mean_slope']:+.3g} "
                           f"{v.display_units} per decade (opposite signs).")
        if "different_significance_picture" in r["reasons"]:
            reasons.append(f"Significant cells (FDR): {na} {r['a']['share_up']:.0%} up / {r['a']['share_down']:.0%} down; "
                           f"{nb} {r['b']['share_up']:.0%} up / {r['b']['share_down']:.0%} down.")
        cand = {"rank": i + 1, "type": "dataset_disagreement", "a": r["a"], "b": r["b"], "reasons": reasons, "rule": r["reasons"],
                "metrics": {"weaker_share": r["weaker_share"], "slope_gap": r["slope_gap"]},
                "classification": "descriptive",
                "classification_text": "Descriptive disagreement between products: no approved statistical test of the difference.",
                "test": None, "regional": None}
        if i < hunt.MAX_RETESTS:
            region = {"type": "bbox", "bbox": r["a"]["bbox"]}
            try:
                ta = service.trends(TrendRequest(variable_id=v.id, region=region, start=req.start, end=req.end))
                tb = service.trends(TrendRequest(variable_id=vb.id, region=region, start=req.start, end=req.end))
                cand["regional"] = {"a": _region_out(ta), "b": _region_out(tb)}
            except ApiError as e:
                cand["classification_text"] += f" Regional trends unavailable: {e.message}"
        out.append(cand)
    return {"mode": "datasets", "variable_id": v.id, "variable_id_b": vb.id, "start": req.start, "end": req.end,
            "extent": list(extent), "criteria": criteria, "tiles_scanned": scanned, "candidates": out, "compatibility": note,
            "runtime_ms": timer.ms(), "limits": limits, "warnings": warnings + ["No product is treated as ground truth."]}


@api.post("/compare", response_model=CompareResponse)
def compare(req: CompareRequest):
    return service.compare(req)


@api.post("/explain", response_model=ExplainResponse)
def explain(req: ExplainRequest):
    return service.explain(req)


@api.post("/chat", response_model=ChatResponse, response_model_exclude_unset=True)
def chat_response(req: ChatRequest, response: Response):
    identifier = uuid4().hex
    response.headers["X-Request-ID"] = identifier
    return chat.respond(req, request_id=identifier)


@api.get("/jobs/{job_id}")
def job_status(job_id: str):
    # Mọi endpoint hiện trả kết quả ngay (200), chưa có job bất đồng bộ.
    raise ApiError(404, "NOT_FOUND", f"Job '{job_id}' not found: this server answers every request synchronously.")


@api.post("/trends/sensitivity")
def trends_sensitivity(req: TrendRequest):
    return service.trend_sensitivity(req)


app.include_router(api)
app.include_router(forecast_service.router)
