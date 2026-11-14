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
    "Template Mode: AI unavailable. Answers use the selected context; places, datasets and dates "
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
# Additional reviewed method answers (both audiences) and plain-language versions for Explorer.
FAQ.update({
    "was bh-fdr applied to raw p-values": (
        "Yes. Grid maps apply Benjamini-Hochberg FDR at q = 0.05 across all cells of the map, using raw cell "
        "p-values without serial-dependence correction. A regional result is a single test and is not FDR-adjusted."
    ),
    "what is the basis for the significance verdict": (
        "The verdict uses the raw Seasonal Mann-Kendall p-value against alpha = 0.05, and only when at least "
        "ten years and seventy percent of months have data. The autocorrelation-adjusted p is a diagnostic only."
    ),
    "what should i investigate next": (
        "Try the same place with another NASA dataset, a longer or different period, or compare it with a "
        "nearby region in Hunt. A trend shows what changed, not why; possible causes are hypotheses to check."
    ),
})
FAQ_PLAIN = {
    "what is seasonal mann-kendall": (
        "It is the test Terra uses to check for a steady change. It compares each month only with the same "
        "month in other years, so normal seasons are not mistaken for a trend. It cannot tell why things change."
    ),
    "what is autocorrelation": (
        "It means one month tends to look like the month before. Months that are alike carry less new "
        "information, so a result can look more certain than it really is."
    ),
    "what is trend detection": (
        "It is checking whether something keeps going up or down over many years, once the normal ups and "
        "downs are set aside."
    ),
    "what is a p-value": (
        "A p-value helps us understand how unusual the result would be if there were no real trend, under the "
        "assumptions of the test. Small values mean the trend is unlikely to be chance alone. It does not prove a "
        "cause, and a large p-value does not prove that nothing is changing."
    ),
    "what is sen's slope": (
        "It is the typical change per decade, worked out so that a few unusual months cannot easily distort it. "
        "It describes the past, not the future."
    ),
    "what is a confidence interval": (
        "It is a range of plausible values for the rate of change. A wide range means we are less sure. Terra's "
        "range comes from a slightly different method than the main rate, so it is a rough guide only."
    ),
    "was bh-fdr applied to raw p-values": FAQ["was bh-fdr applied to raw p-values"],
    "what is the basis for the significance verdict": (
        "Terra calls a trend clear only when the test's p-value is below the usual threshold and there are at "
        "least ten years of data. Otherwise the result is shown as not proven yet."
    ),
    "what should i investigate next": FAQ["what should i investigate next"],
}
FAQ_ALIASES = {
    "what is seasonal mann–kendall": "what is seasonal mann-kendall",
    "what does autocorrelation mean": "what is autocorrelation",
    "why use sen's slope": "what is sen's slope",
    "what is a p value": "what is a p-value",
    "what does the p-value mean": "what is a p-value",
    "what does the p-value mean here": "what is a p-value",
    "what does the p value mean here": "what is a p-value",
    "can you explain the p-value": "what is a p-value",
    "can you explain the p value": "what is a p-value",
    "what statistical test was applied": "what is seasonal mann-kendall",
    "how was serial dependence handled": "what is autocorrelation",
    "does the reported confidence interval correspond to sen's slope": "what is a confidence interval",
    "does the reported confidence interval correspond to sen’s slope": "what is a confidence interval",
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
    key = FAQ_ALIASES.get(question, question)
    faq = (FAQ_PLAIN.get(key) if req.audience_mode == "explorer" else None) or FAQ.get(key)
    if faq:
        return ChatResponse(**_base(faq, []))

    # Deliberately limited dispatch. Unsupported requests never receive made-up analysis.
    restricted = re.search(r"\b(why|cause[sd]?|forecast\w*|predict\w*|future|tomorrow)\b|nguyên nhân|dự báo", question)
    statistical = re.search(r"\b(trend\w*|warmer|wetter|drier|rainfall|warming|cooling|result)\b|xu hướng", question)
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
    result = _base(audience_frame(explanation["answer"], cached, req.audience_mode), warnings)
    result["analysis_id"] = cached["trend_id"]
    result["evidence"] = [{"trend": cached, "cited_numbers": explanation["cited_numbers"]}]
    result["actions"] = [
        {"type": "navigate", "page": "explore",
         "label": f"Run this analysis: {catalog.VARIABLES[a['params']['variable_id']].name}", "params": a["params"]}
        for a in explanation["actions"] if a["type"] == "run_trend"
    ]
    return ChatResponse(**result)


def audience_frame(answer: str, trend: dict, audience: str | None) -> str:
    """Wording only. Uses the verdict and values already in the backend trend; never computes anything new."""
    if audience is None:
        return answer
    sig, ok = trend.get("significant"), trend.get("quality", {}).get("sufficient", False)
    if audience == "explorer":
        if not ok or sig is None:
            lead = "In short: there is not enough data here to test for a trend."
        elif sig:
            lead = "In short: the data show a clear trend under the test used; it is unlikely to be chance alone."
        else:
            lead = ("In short: the estimated trend is not strong enough to confirm a clear change under the test used. "
                    "That is not proof that nothing is changing.")
        return f"{lead} {answer}"
    p, alpha = trend.get("p_value"), trend.get("alpha", 0.05)
    if p is None or not ok:
        return f"{answer} Decision basis: not tested (insufficient data)."
    met = "met" if sig else "not met"
    return (f"{answer} Decision basis: raw Seasonal Mann-Kendall p = {p:.4g}, alpha = {alpha}; the significance criterion is {met}. "
            "The autocorrelation-adjusted p is a diagnostic only.")


def _framed(answer: str) -> bool:
    return answer.startswith("In short:") or "Decision basis:" in answer


def with_audience(resp: ChatResponse, audience: str | None) -> ChatResponse:
    """Applies the same wording frame to model answers that carry exactly one verified trend. Evidence is untouched."""
    if audience is None or len(resp.evidence) != 1 or _framed(resp.answer):
        return resp
    trend = resp.evidence[0].trend.model_dump(mode="json")
    return resp.model_copy(update={"answer": audience_frame(resp.answer, trend, audience)})


def respond(req: ChatRequest, *, request_id: str | None = None) -> ChatResponse:
    if req.use_tools:
        from .conversation import respond as converse
        return with_audience(converse(req, template_response, request_id), req.audience_mode)
    from .llm.runtime import enhance
    return with_audience(enhance(req, template_response, request_id=request_id), req.audience_mode)
