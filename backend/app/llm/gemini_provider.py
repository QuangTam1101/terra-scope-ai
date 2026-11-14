"""Official Google GenAI adapter. SDK exceptions are never exposed or logged."""
import asyncio
import re

from google import genai
from google.genai import errors, types
from pydantic import ValidationError

from ..config import LLMSettings
from .base import GenerationInput, ProviderError, ProviderReply
from .diagnostics import emit
from .prompts import SYSTEM_PROMPT, payload


class GeminiProvider:
    def __init__(self, settings: LLMSettings):
        self.settings = settings

    async def generate(self, request: GenerationInput) -> ProviderReply:
        if not self.settings.api_key:
            raise ProviderError("missing_key")
        try:
            contents = payload(request)
            # Millisecond transport timeout; outer wait_for is the wall-clock deadline.
            options = types.HttpOptions(timeout=int(self.settings.timeout * 1000),
                                        retry_options=types.HttpRetryOptions(attempts=1))
            async with genai.Client(api_key=self.settings.api_key, enterprise=False, vertexai=False, http_options=options).aio as client:
                emit(self.settings, request.request_id, "sdk_call_started", fallback=False)
                response = await client.models.generate_content(
                    model=self.settings.model, contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT, response_mime_type="application/json",
                        response_json_schema=ProviderReply.model_json_schema(), max_output_tokens=self.settings.max_output_tokens,
                        temperature=0.2, candidate_count=1,
                        # Controlled explanations need no long reasoning pass.
                        thinking_config=types.ThinkingConfig(thinking_level="low") if self.settings.model.startswith("gemini-4-") else None,
                        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                    ),
                )
            # Truncation, refusal and safety-blocked responses must never become LLM answers.
            if not response.candidates:
                raise ProviderError("invalid_response", http_status=200, detail="missing_candidates")
            if response.candidates[0].finish_reason != types.FinishReason.STOP:
                raise ProviderError("invalid_response", http_status=200, detail="non_stop_finish")
            raw = response.text or ""
            if not raw:
                raise ProviderError("invalid_response", http_status=200, detail="empty_response")
            if len(raw) > 12000:
                raise ProviderError("invalid_response", http_status=200, detail="response_too_large")
            if self.settings.api_key in raw or re.search(r"AIza[\w-]{20,}", raw):
                raise ProviderError("invalid_response", http_status=200, detail="secret_in_output")
            try:
                return ProviderReply.model_validate_json(raw)
            except ValidationError as error:
                kinds = {item["type"] for item in error.errors(include_input=False, include_context=False)}
                detail = "schema_missing_fields" if "missing" in kinds else "malformed_json" if "json_invalid" in kinds else "schema_validation"
                raise ProviderError("invalid_response", http_status=200, detail=detail) from None
        except ProviderError:
            raise
        except errors.APIError as error:
            status = error.code
            code = {400: "invalid_request", 401: "auth", 403: "auth", 404: "model_unavailable",
                    429: "rate_limit", 408: "timeout", 504: "timeout"}.get(status, "service")
            # A generic HTTP 400 is not proof that the key is invalid. Only an
            # explicit, structured authentication reason can select that category.
            detail = None
            reasons = set()
            pending = [error.details]
            while pending:
                item = pending.pop()
                if isinstance(item, dict):
                    if isinstance(item.get("reason"), str):
                        reasons.add(item["reason"])
                    if item.get("reason") in {"API_KEY_INVALID", "API_KEY_EXPIRED", "API_KEY_NOT_FOUND"}:
                        code = "auth"
                    pending.extend(value for value in item.values() if isinstance(value, (dict, list)))
                elif isinstance(item, list):
                    pending.extend(item)
            # Inspect messages only in memory to choose fixed labels. Never retain
            # or log the message, field value, URL or response body itself.
            message = (error.message or "").replace(self.settings.api_key, "[redacted]").casefold()
            if code == "invalid_request":
                if "SERVICE_DISABLED" in reasons:
                    detail = "google_api_not_enabled"
                elif any(text in message for text in ("user location", "not available in your country", "location is not supported", "country is not supported")):
                    detail = "google_region_restriction"
                elif "billing" in message:
                    detail = "google_billing_requirement"
                elif error.status == "FAILED_PRECONDITION":
                    detail = "google_failed_precondition"
                else:
                    fields = [
                        (("response_schema", "responseschema", "response_json_schema", "additionalproperties", "json schema"), "request_schema"),
                        (("temperature",), "request_temperature"),
                        (("candidate_count", "candidatecount"), "request_candidate_count"),
                        (("max_output_tokens", "maxoutputtokens"), "request_output_limit"),
                        (("thinking_config", "thinkingconfig", "thinking_budget", "thinking_level"), "request_thinking_config"),
                    ]
                    detail = next((label for terms, label in fields if any(term in message for term in terms)), "request_parameter_unspecified")
            raise ProviderError(code, http_status=status, detail=detail) from None
        except (TimeoutError, asyncio.TimeoutError):
            raise ProviderError("timeout") from None
        except (ValidationError, ValueError, TypeError):
            raise ProviderError("invalid_response", detail="invalid_payload") from None
        except Exception as error:
            # Official SDK transport may be httpx or httpx2 depending on installed version.
            name = type(error).__name__
            code = "timeout" if "timeout" in name.lower() else "network" if name in {
                "ConnectError", "NetworkError", "ConnectionError", "ProxyError", "SSLError", "TransportError", "OSError",
            } else "service"
            raise ProviderError(code, detail="unexpected_client_error" if code == "service" else None) from None
