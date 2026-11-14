"""Phase 4B: allowlisted tools, bounded planning and deterministic scientific verdicts."""
import asyncio
import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from google.genai import types

from . import config
from .schemas import (ChatResponse, ChatWarning, ChatEvidence, ExplainRequest, ExplainContext,
                      TrendResponse, SeriesResponse, CompareResponse, Provenance, RegionCatalog)
from .tools import registry
from .llm.base import GenerationInput, ProviderError
from .llm.function_calling import GeminiFunctionSession
from .llm.gemini_provider import GeminiProvider
from .llm.grounding import validate_and_render
from .llm import runtime
from .scientific_schemas import MethodAdvice

_worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="scientific-tool")
_worker_slot = threading.BoundedSemaphore(1)


@dataclass(frozen=True)
class AgentLimits:
    calls: int = 4
    steps: int = 3
    seconds: float = 40
    evidence_bytes: int = 96000

    @classmethod
    def load(cls):
        try:
            values = cls(int(os.getenv("AGENT_MAX_TOOL_CALLS", "4")), int(os.getenv("AGENT_MAX_STEPS", "3")),
                         float(os.getenv("AGENT_TIMEOUT_SECONDS", "40")), int(os.getenv("AGENT_MAX_EVIDENCE_BYTES", "96000")))
            if not (1 <= values.calls <= 6 and 1 <= values.steps <= 4 and 1 <= values.seconds <= 40 and 4096 <= values.evidence_bytes <= 128000):
                raise ValueError()
            return values
        except ValueError:
            raise ProviderError("config") from None


def create_session(settings, request_id):
    return GeminiFunctionSession(settings, request_id)


def create_composer(settings):
    return GeminiProvider(settings)


def _p_text(p):
    return "unavailable" if p is None else "p < 0.001" if p < 0.001 else f"p = {p:.3f}"


def _difference_sentence(d):
    """Readable statement of the backend difference test (same numbers and verdict; method names in words)."""
    diff = d.difference
    if diff.p_value is None:
        return "The difference between the two trends could not be tested."
    # The comparison summary already states the verdict; this sentence only adds the test result.
    return f"The test of the difference between the two trends gives {_p_text(diff.p_value)}."


def trusted_answer(results):
    parts = []
    for result in results:
        if not result.ok:
            parts.append(result.error.message)
            continue
        d = result.data
        if isinstance(d, TrendResponse):
            parts.append(d.plain_summary + f" Data: {d.source.product} v{d.source.version}.")
        elif isinstance(d, CompareResponse):
            parts.append(d.plain_summary + " " + _difference_sentence(d) + " " + d.a.plain_summary + " " + d.b.plain_summary
                         + f" Data: {d.a.source.product} v{d.a.source.version}.")
        elif isinstance(d, SeriesResponse):
            parts.append(f"Retrieved {len(d.points)} monthly observations in {d.units} from {d.source.product}; missing months: {d.quality.missing_months}.")
        elif isinstance(d, Provenance):
            parts.append(f"{d.variable.name}: {d.variable.source.product} v{d.variable.source.version}, {d.variable.source.provider}. " + " ".join(d.processing_notes))
        elif isinstance(d, RegionCatalog):
            parts.append("Available region presets: " + ", ".join(r.id for r in d.catalog.regions) + ". Supported selections: preset and bbox.")
        elif isinstance(d, MethodAdvice):
            parts.append('Scientific method guidance: ' + ' '.join(m.explanation for m in d.applied_methods) + ' ' + ' '.join(w.explanation for w in d.warnings))
            if d.trust_assessment:
                parts.append(d.trust_assessment.statistical_evidence)
        else:
            parts.append("Available variables: " + ", ".join(v.id for v in d.variables if v.available) + ". Inspect the catalog evidence for units and coverage.")
    return " ".join(parts) + " Past trends do not establish causality or forecast the future."


def response_from_results(results, context, *, mode="template", extra="", reason=None):
    from . import service
    from .advisor import advise
    evidence = []
    for result in results:
        trends = ([TrendResponse.model_validate(service.stored_trend(result.data.analysis_id))] if result.ok and isinstance(result.data, MethodAdvice) else
                  [result.data] if result.ok and isinstance(result.data, TrendResponse) else
                  [result.data.a, result.data.b] if result.ok and isinstance(result.data, CompareResponse) else [])
        for t in trends:
            explanation = service.explain(ExplainRequest(question="Explain the trend", context=ExplainContext(trend_ids=[t.trend_id])))
            if not any(e.trend.trend_id == t.trend_id for e in evidence):
                evidence.append(ChatEvidence(trend=t, cited_numbers=explanation["cited_numbers"], scientific_advice=advise(t.trend_id)))
    warnings = [ChatWarning(code="ANALYSIS_WARNING", message=w.message) for r in results for w in r.warnings]
    if reason:
        warnings.append(ChatWarning(code="LLM_FALLBACK", message=runtime.FALLBACK_MESSAGES.get(reason, "Agent limit or tool validation failed. Verified results are preserved.")))
    if mode == "template":
        warnings.insert(0, ChatWarning(code="TEMPLATE_MODE", message="Template Mode: AI unavailable. Results come from backend tools."))
    values = dict(answer=trusted_answer(results) + (" " + extra if extra else ""), mode=mode,
                  evidence=evidence, actions=[], warnings=warnings, disclaimer="Backend evidence determines all scientific conclusions. AI interpretation may be wrong.",
                  tool_results=results, resolved_context=context)
    if evidence:
        values["analysis_id"] = evidence[-1].trend.trend_id
    return ChatResponse(**values)


def _bound_to_context(name, args, context):
    if name == 'advise_statistical_method':
        from .conversation import _cached
        if not _cached(context.model_copy(update={'trend_id': args.get('analysis_id')})):
            raise ProviderError('grounding')
        return
    if name not in {"analyze_trend", "get_time_series", "compare_regions", "get_dataset_provenance"}:
        return
    required = ["variable_id"] if name == "get_dataset_provenance" else ["variable_id", "start", "end"]
    for key in required:
        if getattr(context, key) is None or args.get(key) != getattr(context, key):
            raise ProviderError("grounding")
    if args.get("dataset_id") is not None and context.dataset_id is not None and args["dataset_id"] != context.dataset_id:
        raise ProviderError("grounding")
    if name == "get_dataset_provenance":
        return
    for key, ref in ([("region_a", context.region), ("region_b", context.region_b)] if name == "compare_regions" else [("region", context.region)]):
        if ref is None or args.get(key) != ref.model_dump(mode="json", exclude_none=True):
            raise ProviderError("grounding")


async def _execute(name, args):
    if not _worker_slot.acquire(False):
        raise ProviderError("service")
    def work():
        try:
            return registry.execute(name, args)
        finally:
            _worker_slot.release()
    # A timed-out caller never queues another job. Native work is bounded by 4A
    # selection limits and continues under the single-worker gate until completion.
    try:
        future = _worker.submit(work)
    except Exception:
        _worker_slot.release()
        raise
    future.add_done_callback(lambda f: _worker_slot.release() if f.cancelled() else None)
    return await asyncio.wrap_future(future)


def agent_payload(result):
    value = result.model_dump(mode="json")
    if result.ok and isinstance(result.data, SeriesResponse):
        value["data"]["points"] = value["data"]["points"][:3] + value["data"]["points"][-3:]
        value["warnings"].append({"code": "LIMITATION", "message": "Only the first and last three observations are sent to the model; full series remains in backend evidence."})
    return value


async def orchestrate(req, settings, limits, identifier, results):
    session = create_session(settings, identifier)
    contents = [types.Content(role="user", parts=[types.Part.from_text(text=json.dumps({
        "message": req.message, "context": req.context.model_dump(mode="json", exclude_none=True),
        "history": runtime.bounded_history(req)}, ensure_ascii=True))])]
    signatures, total = set(), 0
    for step in range(limits.steps):
        content = await session.turn(contents)
        contents.append(content)
        calls = [p.function_call for p in content.parts if p.function_call]
        if not calls:
            if not any(p.text and not p.thought for p in content.parts):
                raise ProviderError("invalid_response")
            break
        responses = []
        for call in calls:
            total += 1
            if total > limits.calls:
                raise ProviderError("agent_limit")
            if not isinstance(call.args, dict):
                raise ProviderError("invalid_response")
            signature = json.dumps([call.name, call.args], sort_keys=True, allow_nan=False)
            if signature in signatures:
                raise ProviderError("agent_limit")
            signatures.add(signature)
            _bound_to_context(call.name, call.args, req.context)
            result = await _execute(call.name, call.args)
            results.append(result)
            if (len(json.dumps([agent_payload(r) for r in results], ensure_ascii=True).encode()) > limits.evidence_bytes
                    or sum(len(r.model_dump_json().encode()) for r in results) > limits.evidence_bytes):
                results.pop()
                raise ProviderError("agent_limit")
            if not result.ok:
                raise ProviderError("invalid_response")
            from .llm.diagnostics import emit
            emit(settings, identifier, "tool_executed", fallback=False)
            responses.append(types.Part(function_response=types.FunctionResponse(name=call.name, id=call.id, response=agent_payload(result))))
        contents.append(types.Content(role="user", parts=responses))
    else:
        raise ProviderError("agent_limit")
    if not results:
        raise ProviderError("invalid_response")
    allowed = {"uncertainty": "An estimated past trend is not a forecast or evidence of causation.",
               "methods": "A positive slope alone does not establish statistical significance; use the reported decision and its stated test.",
               "interval": "OLS anomaly intervals and seasonal Sen slopes use different estimators and must not be conflated."}
    if req.context.intent == 'advisor':
        from .conversation import statistical_followup, _cached
        stored = _cached(req.context)
        if not stored:
            raise ProviderError('grounding')
        allowed = {'contextual_explanation': statistical_followup(req.message, TrendResponse.model_validate(stored))}
    request = GenerationInput("data", req.message, runtime.bounded_history(req),
                              {"tool_results": [agent_payload(r) for r in results]}, allowed, identifier,
                              audience=getattr(req, "audience_mode", None))
    # Separate request: no tools mixed with response_json_schema.
    composer = create_composer(settings)
    draft = await composer.generate(request)
    try:
        extra = validate_and_render(draft, request, settings.api_key)
    except ProviderError as rejected:
        if rejected.code != "grounding":
            raise
        # Phase 8.5 E2E: the model sometimes drafts prose the grounding check rejects. Ask once more for the
        # explanation only; the verified tool results are reused (no tool is rerun) and the second draft must pass the
        # same check, otherwise the caller falls back to Template Mode as before.
        draft = await composer.generate(request)
        extra = validate_and_render(draft, request, settings.api_key)
    return response_from_results(results, req.context, mode="llm", extra=extra)


def run(req, template, identifier=None):
    from .llm.diagnostics import request_id, emit
    settings = config.llm_settings()
    identifier = request_id(identifier)
    if settings.provider != "gemini" or not settings.api_key:
        return runtime.enhance(req, template, request_id=identifier)
    if not settings.valid:
        return runtime.fallback(template(req), "config")
    results = []
    if not runtime.budget.enter(settings.requests_per_minute):
        return runtime.fallback(template(req), runtime.budget.reason)
    error = None
    try:
        limits = AgentLimits.load()
        response = asyncio.run(asyncio.wait_for(orchestrate(req, settings, limits, identifier, results), timeout=limits.seconds))
        emit(settings, identifier, "success", fallback=False, http_status=200)
        return response
    except (TimeoutError, asyncio.TimeoutError):
        error = "timeout"
        emit(settings, identifier, error, fallback=True)
    except ProviderError as failure:
        error = failure.code
        emit(settings, identifier, error, fallback=True, http_status=failure.http_status, detail=failure.detail)
    except Exception:
        error = "service"
        emit(settings, identifier, error, fallback=True, detail="unexpected_client_error")
    finally:
        runtime.budget.leave(error)
    if results:
        return response_from_results(results, req.context, reason=error)
    empty = ChatResponse(answer="No verified tool result was obtained. Please narrow the selection or retry later.", mode="template",
                         evidence=[], actions=[], warnings=[], disclaimer="No statistical conclusion was generated.")
    return runtime.fallback(empty, error)


def explain_results(req, results, detail, identifier=None):
    """Compose a follow-up from cached backend evidence; never rerun a scientific tool."""
    from .llm.diagnostics import request_id, emit
    settings = config.llm_settings()
    base = response_from_results(results, req.context, extra=detail)
    if settings.provider != "gemini" or not settings.api_key or not settings.valid:
        return base
    if not runtime.budget.enter(settings.requests_per_minute):
        return runtime.fallback(base, runtime.budget.reason)
    identifier = request_id(identifier)
    error, status, reason = None, None, None
    try:
        request = GenerationInput("data", req.message, runtime.bounded_history(req),
            {"tool_results": [agent_payload(r) for r in results]}, {"contextual_explanation": detail}, identifier,
            audience=getattr(req, "audience_mode", None))
        async def compose():
            composer = create_composer(settings)
            draft = await composer.generate(request)
            try:
                return validate_and_render(draft, request, settings.api_key)
            except ProviderError as rejected:
                if rejected.code != "grounding":
                    raise
                draft = await composer.generate(request)        # one more draft of the same verified evidence
                return validate_and_render(draft, request, settings.api_key)
        rendered = asyncio.run(asyncio.wait_for(compose(), timeout=settings.timeout))
        return response_from_results(results, req.context, mode="llm", extra=rendered)
    except ProviderError as failure:
        error, status, reason = failure.code, failure.http_status, failure.detail
    except TimeoutError:
        error = "timeout"
    except Exception:
        error = "service"
    finally:
        runtime.budget.leave(error)
        emit(settings, identifier, error or "success", fallback=bool(error), http_status=status or (200 if not error else None), detail=reason)
    return runtime.fallback(base, error)
