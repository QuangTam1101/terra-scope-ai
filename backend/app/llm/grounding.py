"""Deterministic output constraints, in addition to the model instructions."""
import re

from ..schemas import ChatEvidence
from .base import GenerationInput, ProviderError, ProviderReply


def verified_summary(evidence: ChatEvidence) -> dict:
    # Deliberate allowlist: no monthly series, grids, NetCDF data or arbitrary client metadata.
    t = evidence.trend
    fields = ("trend_id", "variable_id", "region", "start", "end", "units", "method", "slope_method",
              "slope_per_decade", "slope_ci", "ci_method", "ci_level", "p_value", "alpha", "significant",
              "p_value_autocorr_adjusted", "autocorrelation_adjusted", "quality", "source", "warnings")
    raw = t.model_dump(mode="json")
    return {field: raw[field] for field in fields}


def approved_statements(evidence: ChatEvidence) -> dict[str, str]:
    t = evidence.trend
    statements = {
        "uncertainty": "This is an estimated past trend, not a forecast or evidence of a cause.",
        "interval": "The interval is fitted with OLS on monthly anomalies; it is not an interval for the seasonal Sen estimator.",
        "autocorrelation": "Nearby months can be related. The adjusted test is reported separately; the selected decision uses the unadjusted seasonal test.",
    }
    if t.significant is True:
        statements["significant"] = "The selected test detects a statistically significant trend under its assumptions. This does not establish causality."
    elif t.significant is False:
        statements["not_significant"] = "The selected test does not detect a statistically significant trend. This is not proof that there is no trend. Variability and limited evidence can obscure change."
    else:
        statements["insufficient"] = "The evidence is insufficient for a significance decision; no significance claim can be made."
    return statements


def validate_and_render(reply: ProviderReply, request: GenerationInput, secret: str) -> str:
    raw = reply.model_dump_json()
    if (secret and secret in raw) or re.search(r"AIza[\w-]{20,}", raw):
        raise ProviderError("grounding", detail="secret_in_output")
    if request.kind == "data":
        # No model-authored scientific prose is admitted for measured results. Selecting
        # false significance, a new number, an unknown claim or extra fields fails closed.
        if reply.answer:
            raise ProviderError("grounding", detail="data_free_text")
        if not reply.statement_ids:
            raise ProviderError("grounding", detail="data_missing_statements")
        if len(set(reply.statement_ids)) != len(reply.statement_ids):
            raise ProviderError("grounding", detail="data_duplicate_statements")
        if any(key not in request.approved_statements for key in reply.statement_ids):
            raise ProviderError("grounding", detail="data_unknown_statement")
        return " ".join(request.approved_statements[key] for key in reply.statement_ids)
    answer = reply.answer.strip()
    # Educational prose has no authority to introduce measurements or significance
    # decisions. Deliberately conservative: reject numeric examples and analysis claims.
    # Same rules as Phase 3; label the exact rejection without logging its text.
    if not answer:
        raise ProviderError("grounding", detail="education_empty")
    if reply.statement_ids:
        raise ProviderError("grounding", detail="education_unexpected_statements")
    rules = {
        "education_numeric": r"\d|[<>=≤≥]|\b(?:slope|p[- ]?value|q[- ]?value)\s+(?:is|equals|of)\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\b",
        "education_statistical_claim": r"\b(?:increased|decreased)\b|\bthe\s+(?:result|trend|analysis|dataset)\s+(?:is|was|shows?|indicates?|has)\b",
        "education_causal_or_forecast_claim": r"\b(?:causes?|caused|proves?|proven|forecast|predicts?)\b",
        "education_context_claim": r"\b(?:selected|current|your|this|our)\s+(?:dataset|region|trend|result|analysis)\b",
    }
    for category, pattern in rules.items():
        checked = answer
        if category == "education_causal_or_forecast_claim":
            # Negated cautions are educational, not causal assertions. Do not
            # discard whole sentences: a later affirmative claim must still fail.
            checked = re.sub(r"\b(?:does not|do not|cannot|doesn't|can't|nor does it)\s+(?:prove(?:\s+what caused)?|establish|predict|forecast)\b", "", checked, flags=re.I)
        if re.search(pattern, checked, re.IGNORECASE):
            raise ProviderError("grounding", detail=category)
    from .. import catalog
    if any(re.search(r"\b" + re.escape(r.id.replace('_', ' ')) + r"\b", answer, re.I)
           for r in catalog.REGIONS.values() if r.id != 'global'):
        raise ProviderError("grounding", detail="education_context_claim")
    return answer
