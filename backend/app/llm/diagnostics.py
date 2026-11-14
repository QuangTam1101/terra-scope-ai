"""Allowlisted local diagnostics. Never record prompts, responses, URLs or secrets."""
import json
import logging
import re
from uuid import uuid4

from ..config import LLMSettings

logger = logging.getLogger("uvicorn.error.terra_scope.llm")
ERROR_CATEGORIES = {
    "tool_executed",
    "agent_limit",
    "sdk_call_started", "success", "context_limit", "unsupported_question", "context_required",
    "config", "missing_key", "auth", "rate_limit", "timeout", "model_unavailable", "service",
    "network", "invalid_request", "invalid_response", "grounding",
}
DETAIL_CATEGORIES = {
    "missing_candidates", "non_stop_finish", "empty_response", "response_too_large", "secret_in_output",
    "schema_missing_fields", "schema_validation", "malformed_json", "invalid_payload", "unexpected_client_error",
    "data_free_text", "data_missing_statements", "data_duplicate_statements", "data_unknown_statement",
    "education_empty", "education_unexpected_statements", "education_numeric",
    "education_statistical_claim", "education_causal_or_forecast_claim", "education_context_claim",
    "google_failed_precondition", "google_billing_requirement", "google_region_restriction",
    "google_api_not_enabled", "request_schema", "request_temperature", "request_candidate_count",
    "request_output_limit", "request_thinking_config", "request_parameter_unspecified",
}


def request_id(value: str | None = None) -> str:
    return value if value and re.fullmatch(r"[0-9a-f]{32}", value) else uuid4().hex


def emit(settings: LLMSettings, identifier: str, category: str, *, fallback: bool,
         http_status: int | None = None, detail: str | None = None):
    provider = settings.provider if settings.provider in {"gemini", "template"} else "unsupported"
    model = settings.model if re.fullmatch(r"gemini-[a-zA-Z0-9.-]{1,80}", settings.model) else "invalid"
    if settings.api_key and settings.api_key in model:
        model = "redacted"
    category = category if category in ERROR_CATEGORIES else "service"
    detail = detail if detail in DETAIL_CATEGORIES else None
    logger.info(json.dumps({
        "request_id": request_id(identifier), "provider": provider, "model": model,
        "error_category": category + (f".{detail}" if detail and category != "grounding" else ""),
        "http_status": http_status if isinstance(http_status, int) and 100 <= http_status <= 599 else None,
        "fallback": fallback, "grounding_rejection": detail if category == "grounding" else None,
    }))
