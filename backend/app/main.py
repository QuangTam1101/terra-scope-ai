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

from . import bridge, catalog, chat, config, errors, service
from .errors import ApiError
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
    packed = gzip.compress(model.model_validate(data).model_dump_json().encode(), compresslevel=5)
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


app.include_router(api)
