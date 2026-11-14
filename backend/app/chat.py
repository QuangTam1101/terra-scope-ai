"""Deterministic chat service with optional backend-only model enhancement.

FAQ content describes the methods already documented in service.py and pipeline/api.py.
History is accepted by the provider, but never treated as scientific evidence.
The legacy template path uses explicit context. Phase 4 resolves selections deterministically.
"""
import re

from . import catalog, service
from .errors import ApiError
from .schemas import (ChatRequest, ChatResponse, ExplainContext, ExplainRequest, TrendRequest)


TEMPLATE_NOTICE = (
    "Template Mode — AI unavailable. Answers use the selected context; places, datasets and dates "
    "are not inferred from messages or conversation history. Change the selection in Explore."
)

# Small, reviewed method glossary, not a general-purpose knowledge base.
FAQ = {
    "what is seasonal mann-kendall": (
        "Seasonal Mann-Kendall tests for a monotonic trend while comparing observations within "
        "the same calendar season. A detected trend does not establish a cause or forecast the future."
    ),
    "what is autocorrelation": (
        "Autocorrelation is dependence between observations across time. Related observations "
        "can carry less independent information, which matters when assessing evidence for a trend."
    ),
    "what is trend detection": (
        "Trend detection assesses whether a time series contains a persistent direction of change "
        "relative to its variability, under the assumptions of the selected statistical test."
    ),
    "what is a p-value": (
        "Under the no-trend hypothesis and the test assumptions, a p-value measures how likely a test "
        "statistic at least as extreme as the observed one would be. It is not the probability that "
        "the hypothesis is true and does not establish a cause."
    ),
    "what is sen's slope": (
        "Seasonal Sen's slope estimates the rate of change from pairs in the same calendar season. "
        "Terra reports that rate per decade. It describes the past, not a forecast."
    ),
    "what is a confidence interval": (
        "Terra's trend interval is a 95% OLS interval fitted to monthly anomalies. Its method is "
        "ols_anomaly; it is not a confidence interval for the seasonal Sen estimator."
    ),
}
FAQ_ALIASES = {
    "what is seasonal mann–kendall": "what is seasonal mann-kendall",
    "what does autocorrelation mean": "what is autocorrelation",
    "why use sen's slope": "what is sen's slope",
    "what is a p value": "what is a p-value",
    "what does the p-value mean": "what is a p-value",
    "what does the p-value mean here": "what is a p-value",
    "what does the p value mean here": "what is a p-value",
    "what is sen’s slope": "what is sen's slope",
    "what does the confidence interval mean": "what is a confidence interval",
}


def _base(answer: str, warnings: list[dict]) -> dict:
    return {"answer": answer, "mode": "template", "evidence": [], "actions": [],
            "warnings": [{"code": "TEMPLATE_MODE", "message": TEMPLATE_NOTICE}, *warnings],
            "disclaimer": service.EXPLAIN_DISCLAIMER}


def template_response(req: ChatRequest) -> ChatResponse:
    ctx = req.context
    cached = service.stored_trend(ctx.trend_id) if ctx.trend_id else None
    variable = service.get_variable(ctx.variable_id) if ctx.variable_id is not None else None
    if variable is None and cached is not None:
        variable = service.get_variable(cached["variable_id"])
    if ctx.dataset_id is not None and (variable is None or ctx.dataset_id != variable.product):
        raise ApiError(422, "UNSUPPORTED_DATASET", "dataset_id must match the variable's catalog source.product.",
                       {"dataset_id": ctx.dataset_id, "expected": variable.product if variable else None})
    region = service.resolve_region(ctx.region)[0] if ctx.region is not None else None
    if cached is not None:
        if ((variable is not None and variable.id != cached["variable_id"])
                or (region is not None and region["bbox"] != cached["region"]["bbox"])
                or (ctx.start is not None and (ctx.start, ctx.end) != (cached["start"], cached["end"]))):
            raise ApiError(409, "CONTEXT_MISMATCH", "The analysis does not match the selected context. Run it again.")

    question = re.sub(r"\s+", " ", req.message.casefold()).rstrip("?!. ")
    faq = FAQ.get(FAQ_ALIASES.get(question, question))
    if faq:
        return ChatResponse(**_base(faq, []))

    # Deliberately limited dispatch. Unsupported requests never receive made-up analysis.
    restricted = re.search(r"\b(why|cause[sd]?|forecast\w*|predict\w*|future|tomorrow)\b|nguyên nhân|dự báo", question)
    statistical = re.search(r"\b(trend\w*|warmer|wetter|drier|rainfall|warming|cooling)\b|xu hướng", question)
    if restricted or not statistical:
        return ChatResponse(**_base(
            "Template mode supports the selected region's past trend and a small glossary: "
            "p-value, Sen's slope and confidence interval. It cannot answer this question, infer causes "
            "or forecast. Try 'What is the trend for the current selection?'.",
            [{"code": "UNSUPPORTED_QUESTION", "message": "This question is outside the supported template topics."}]))

    warnings = []
    if cached is None:
        if variable is None or ctx.region is None or ctx.start is None or ctx.end is None:
            if ctx.trend_id:
                raise ApiError(404, "NOT_FOUND", "Analysis is unknown or expired. Supply the full context to recompute it.")
            return ChatResponse(**_base(
                "Choose a variable, region, start and end in Explore, then ask about the trend again.",
                [{"code": "CONTEXT_REQUIRED", "message": "No complete analysis context was supplied."}]))
        cached = service.trends(TrendRequest(variable_id=variable.id, region=ctx.region, start=ctx.start, end=ctx.end))
        if ctx.trend_id:
            warnings.append({"code": "ANALYSIS_WARNING", "message": "The previous analysis expired; the selected context was recomputed."})

    explanation = service.explain(ExplainRequest(
        question=req.message, context=ExplainContext(trend_ids=[cached["trend_id"]])))
    warnings += [{"code": "ANALYSIS_WARNING", "message": w} for w in explanation["warnings"]]
    result = _base(explanation["answer"], warnings)
    result["analysis_id"] = cached["trend_id"]
    result["evidence"] = [{"trend": cached, "cited_numbers": explanation["cited_numbers"]}]
    result["actions"] = [
        {"type": "navigate", "page": "explore",
         "label": f"Run this analysis: {catalog.VARIABLES[a['params']['variable_id']].name}", "params": a["params"]}
        for a in explanation["actions"] if a["type"] == "run_trend"
    ]
    return ChatResponse(**result)


def respond(req: ChatRequest, *, request_id: str | None = None) -> ChatResponse:
    if req.use_tools:
        from .conversation import respond as converse
        return converse(req, template_response, request_id)
    from .llm.runtime import enhance
    return enhance(req, template_response, request_id=request_id)
