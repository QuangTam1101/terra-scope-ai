"""Lỗi theo đúng một dạng cho mọi endpoint (contract §4.11):
{"error": {"code", "message", "details", "retryable"}}."""
import logging

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("terra-scope")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None, retryable: bool = False):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message
        self.details, self.retryable = details or {}, retryable


def _body(code, message, details=None, retryable=False):
    return {"error": {"code": code, "message": message, "details": details or {}, "retryable": retryable}}


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, e: ApiError):
        return JSONResponse(_body(e.code, e.message, e.details, e.retryable), status_code=e.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, e: RequestValidationError):
        errors = jsonable_encoder(e.errors(), custom_encoder={Exception: str})
        return JSONResponse(_body("VALIDATION_ERROR", "Request does not match the API contract.",
                                  {"errors": errors}), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        code = {404: "NOT_FOUND", 405: "VALIDATION_ERROR", 429: "RATE_LIMITED"}.get(e.status_code, "INTERNAL_ERROR")
        return JSONResponse(_body(code, str(e.detail)), status_code=e.status_code)

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, e: Exception):
        log.exception("Unhandled error")
        return JSONResponse(_body("INTERNAL_ERROR", "Unexpected backend error. Please report it to the backend team.",
                                  {"type": type(e).__name__}), status_code=500)
