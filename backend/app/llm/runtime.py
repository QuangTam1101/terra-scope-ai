"""Optional model enhancement of the deterministic chat response."""
import asyncio
import re
import threading
import time
from collections import deque
from collections.abc import Callable

from .. import catalog, config
from ..schemas import ChatRequest, ChatResponse, ChatWarning
from .base import GenerationInput, LLMProvider, ProviderError
from .gemini_provider import GeminiProvider
from .diagnostics import emit, request_id as new_request_id
from .grounding import approved_statements, validate_and_render, verified_summary

CONCEPT = r"p[- ]?value|sen.?s slope|mann.?kendall|autocorrelation|confidence interval|trend detection"


def classify(req: ChatRequest) -> str:
    message = req.message.casefold()
    if re.search(r"forecast|predict|future|tomorrow|nguyên nhân|dự báo", message):
        return "unsupported"
    if re.search(r"why.*(?:changing|increas|decreas)|what cause", message):
        return "unsupported"
    named_region = any(region.id.replace("_", " ") in message or region.name.casefold().split(",")[0] in message
                       for region in catalog.REGIONS.values())
    contextual = (named_region or re.search(r"\b(?:this|here|result|selected|my|our)\b|\b(?:19|20)\d{2}\b", message))
    if re.search(CONCEPT, message) and not contextual:
        return "education"
    if re.search(CONCEPT, message) and contextual:
        return "data"
    # Only recent USER questions select the follow-up topic. Assistant text is never
    # parsed as an analysis, variable, region, time range, or statistical result.
    previous_user = next((t.content.casefold() for t in reversed(req.history) if t.role == "user"), "")
    if re.search(r"\b(?:it|that|matter|explain more|continue|what about)\b", message) and previous_user and not contextual:
        previous_kind = classify(ChatRequest(message=previous_user))
        if previous_kind in {"data", "education"}:
            return previous_kind
    if re.search(r"trend|precipitation|rainfall|soil moisture|warmer|wetter|drier|significan|uncertainty|interval|autocorrelation|xu hướng", message):
        return "data"
    return "unsupported"


def context_change(req: ChatRequest) -> bool:
    """Recognize explicit changes we cannot execute; never silently switch context."""
    text = req.message.casefold()
    if re.search(r"\b(?:switch|instead|different|another)\b", text):
        return True
    ctx = req.context
    for region in catalog.REGIONS.values():
        aliases = [region.id.replace("_", " "), region.name.casefold().split(",")[0]]
        if any(re.search(r"\b" + re.escape(a) + r"\b", text) for a in aliases):
            if ctx.region is None or ctx.region.type != "preset" or ctx.region.id != region.id:
                return True
    years = re.findall(r"\b(?:19|20)\d{2}\b", text)
    if years and (not ctx.start or any(year not in {ctx.start[:4], ctx.end[:4]} for year in years)):
        return True
    variable = catalog.VARIABLES.get(ctx.variable_id)
    if variable:
        for term, product in [("imerg", "GPM_3IMERGM"), ("gldas", "GLDAS_NOAH025_M"),
                              ("merra", "M2IMNXASM"), ("modis", "MOD")]:
            if term in text and not variable.product.startswith(product):
                return True
        requested = [(r"precipitation|rainfall", "precipitation"), (r"soil moisture", "soil_moisture"),
                     (r"air temperature", "air_temperature")]
        parameter = catalog.VARIABLE_PARAMETER[variable.id][0]
        if any(re.search(pattern, text) and parameter != target for pattern, target in requested):
            return True
    return False


def bounded_history(req: ChatRequest) -> tuple[dict[str, str], ...]:
    turns, remaining = [], 8000
    for turn in reversed(req.history[-8:]):
        content = turn.content[:min(2000, remaining)]
        if not content:
            break
        turns.append({"role": turn.role, "content": content})
        remaining -= len(content)
    return tuple(reversed(turns))


class CallBudget:
    """Per-process rolling limit, two in-flight requests, no queue or automatic retries."""
    def __init__(self):
        self.lock = threading.Lock()
        self.calls = deque()
        self.active = 0
        self.cooldown_until = 0.0
        self.reason = "rate_limit"   # why the last enter() was refused: cooldown, busy or rate_limit

    def enter(self, limit: int) -> bool:
        with self.lock:
            now = time.monotonic()
            while self.calls and now - self.calls[0] >= 60:
                self.calls.popleft()
            if now < self.cooldown_until or len(self.calls) >= limit or self.active >= 2:
                # Phase 8.5 E2E: say the real reason; a pause after a Gemini error is not "the request limit".
                self.reason = "cooldown" if now < self.cooldown_until else "busy" if self.active >= 2 else "rate_limit"
                return False
            self.calls.append(now)
            self.active += 1
            return True

    def leave(self, error: str | None):
        with self.lock:
            self.active -= 1
            if error in {"rate_limit", "auth", "model_unavailable", "service", "network", "invalid_request"}:
                self.cooldown_until = time.monotonic() + 60


budget = CallBudget()


def create_provider(settings: config.LLMSettings) -> LLMProvider:
    return GeminiProvider(settings)


async def _generate(provider: LLMProvider, request: GenerationInput, timeout: float):
    return await asyncio.wait_for(provider.generate(request), timeout=timeout)


FALLBACK_MESSAGES = {
    "agent_limit": "The agent reached a tool, iteration or evidence limit. Verified evidence is preserved; narrow the request.",
    "config": "Gemini configuration is invalid or disabled. Using Template Mode.",
    "missing_key": "Gemini is not configured. Using Template Mode.",
    "auth": "Gemini authentication failed. Check the backend key locally. Using Template Mode.",
    "rate_limit": "The AI request limit was reached. Try again later. Using Template Mode.",
    "cooldown": "Gemini had a temporary error a moment ago, so Terra pauses AI answers for about a minute. Using Template Mode.",
    "busy": "Two AI answers are already being prepared. Try again in a moment. Using Template Mode.",
    "timeout": "Gemini exceeded the response deadline. Using Template Mode.",
    "model_unavailable": "The configured Gemini model is unavailable. Using Template Mode.",
    "service": "Gemini is temporarily unavailable. Using Template Mode.",
    "network": "The backend could not connect to Gemini. Using Template Mode.",
    "invalid_request": "Gemini rejected the generation parameters. Using Template Mode.",
    "invalid_response": "Gemini returned an unusable response. Using Template Mode.",
    "grounding": "The AI response could not be verified against the scientific constraints. Using Template Mode.",
}


def fallback(base: ChatResponse, code: str) -> ChatResponse:
    return base.model_copy(update={"warnings": [*base.warnings, ChatWarning(
        code="LLM_FALLBACK", message=FALLBACK_MESSAGES[code])]})


def enhance(req: ChatRequest, template: Callable[[ChatRequest], ChatResponse], *, request_id: str | None = None) -> ChatResponse:
    settings = config.llm_settings()
    identifier = new_request_id(request_id)

    def finish(response, category, *, http_status=None, detail=None):
        emit(settings, identifier, category, fallback=response.mode == "template", http_status=http_status, detail=detail)
        return response

    def use_template(response, category, *, http_status=None, detail=None):
        return finish(fallback(response, category), category, http_status=http_status, detail=detail)

    kind = classify(req)
    template_req = req
    if kind == "education":
        # Conceptual questions do not need a cube, even with an unavailable dataset
        # selected in the UI. Preserve context validation, but use a glossary fallback.
        topic_texts = [req.message.casefold()] + [t.content.casefold() for t in reversed(req.history) if t.role == "user"]
        topics = [(r"autocorrelation", "What is autocorrelation?"), (r"mann.?kendall", "What is Seasonal Mann-Kendall?"),
                  (r"sen.?s slope", "What is Sen's slope?"), (r"confidence interval", "What is a confidence interval?"),
                  (r"p[- ]?value", "What is a p-value?")]
        glossary_question = next((question for text in topic_texts for pattern, question in topics if re.search(pattern, text)), "What is trend detection?")
        template_req = req.model_copy(update={"message": glossary_question})
    base = template(template_req)  # Existing ID, region and dataset validation always runs first.
    if kind != "education" and context_change(req):
        return finish(ChatResponse(answer="This request names a different context. Change the variable, dataset, region or years in Explore, then ask again.",
                            mode="template", evidence=[], actions=[], disclaimer=base.disclaimer,
                            warnings=[ChatWarning(code="UNSUPPORTED_QUESTION", message="Automatic context switching is not supported.")]), "context_limit")
    if not settings.valid or settings.provider != "gemini" or not re.fullmatch(r"gemini-[a-zA-Z0-9.-]{1,80}", settings.model):
        return use_template(base, "config")
    if not settings.api_key:
        return use_template(base, "missing_key")
    if kind == "unsupported":
        return finish(base, "unsupported_question")
    if kind == "data" and not base.evidence:
        # Questions such as "Why is this result not statistically significant?" still
        # obtain fresh verified evidence through the existing deterministic service.
        base = template(req.model_copy(update={"message": "What is the trend for the current selection?"}))
        if not base.evidence:
            return finish(base, "context_required")
    evidence = base.evidence[0] if kind == "data" else None
    request = GenerationInput(kind=kind, message=req.message, history=bounded_history(req),
                              evidence=verified_summary(evidence) if evidence else None,
                              approved_statements=approved_statements(evidence) if evidence else {}, request_id=identifier)
    if not budget.enter(settings.requests_per_minute):
        return use_template(base, budget.reason)
    error = None
    http_status, detail = None, None
    try:
        reply = asyncio.run(_generate(create_provider(settings), request, settings.timeout))
        http_status = 200  # SDK returned successfully; subsequent rejection is application grounding.
        explanation = validate_and_render(reply, request, settings.api_key)
    except (TimeoutError, asyncio.TimeoutError):
        error = "timeout"
    except ProviderError as failure:
        error = failure.code
        http_status = failure.http_status or http_status
        detail = failure.detail
    except Exception:
        error = "service"  # Never serialize or log raw provider exceptions.
        detail = "unexpected_client_error"
    finally:
        budget.leave(error)
    if error:
        return use_template(base, error, http_status=http_status, detail=detail)
    if evidence:
        t = evidence.trend
        source_kind = ("model/reanalysis output, not a direct observation" if t.variable_id.startswith(("gldas", "merra"))
                       else "satellite-derived observations")
        answer = (f"{t.plain_summary} {explanation} "
                  f"Source: {t.source.product} v{t.source.version}, {t.source.provider} ({source_kind}). "
                  f"Method: {t.method}; slope: {t.slope_method}; interval: {t.ci_method}. "
                  "These results describe the past and do not establish causality or predict the future.")
    else:
        answer = explanation
    return finish(base.model_copy(update={
        "answer": answer, "mode": "llm",
        "warnings": [w for w in base.warnings if w.code not in {"TEMPLATE_MODE", "UNSUPPORTED_QUESTION"}] + (
            [ChatWarning(code="ANALYSIS_WARNING", message="This explanation uses the selected context only. Automatic dataset, place and period changes are unavailable; change the selection in Explore.")]
            if evidence else []),
        "disclaimer": "AI-assisted explanation. Verified statistics remain in the evidence cards. Conceptual explanations can be wrong; past trends do not establish causes or forecasts.",
    }), "success", http_status=http_status)
