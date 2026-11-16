"""Additive scientific interpretation contracts; no numerical trust score."""
from typing import Literal
from pydantic import BaseModel, Field

MethodId = Literal['ordinary_mk', 'seasonal_mk', 'sen_seasonal', 'sen_annual', 'hamed_rao_anomaly', 'ols_anomaly', 'bh_fdr', 'hac', 'sen_interval']


class MethodGuidance(BaseModel):
    method: MethodId
    status: Literal['applied', 'recommended', 'available_not_applied', 'requires_review', 'unsupported']
    rule_id: str
    explanation: str
    evidence_references: list[str]


class ScientificRule(BaseModel):
    rule_id: str
    explanation: str
    evidence_references: list[str] = Field(default_factory=list)


class MethodAdvice(BaseModel):
    analysis_id: str
    applied_methods: list[MethodGuidance]
    recommended_methods: list[MethodGuidance]
    available_methods: list[MethodGuidance]
    unsupported_methods: list[MethodGuidance]
    assumptions: list[ScientificRule]
    warnings: list[ScientificRule]
    evidence_references: list[str]
    explanations: list[ScientificRule]
    recommendation_status: Literal['conditional', 'requires_review', 'not_assessed']
    trust_assessment: 'TrustAssessment | None' = None


class TrustAssessment(BaseModel):
    analysis_id: str
    status: Literal['supported', 'limited', 'requires_review', 'not_assessed']
    decision_basis: Literal['raw_seasonal_p', 'bh_fdr_q', 'unknown']
    estimated_direction: Literal['positive', 'negative', 'zero', 'unavailable']
    magnitude: float | None
    units: str
    statistical_evidence: str
    limitations: list[ScientificRule]
    cannot_conclude: list[str]
    missing_metadata: list[str]
    evidence_references: list[str]


MethodAdvice.model_rebuild()

