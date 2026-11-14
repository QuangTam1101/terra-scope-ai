"""Deterministic guidance on existing server evidence. Never runs a new statistic."""
from . import service
from .errors import ApiError
from .schemas import TrendResponse
from .scientific_schemas import MethodAdvice, MethodGuidance, ScientificRule


def advise(analysis_id: str) -> MethodAdvice:
    stored = service.stored_trend(analysis_id)
    if stored is None:
        raise ApiError(404, 'NOT_FOUND', 'Analysis reference is unknown or expired. Run a bounded trend analysis first.')
    from .trust import assess_trend
    return advise_trend(TrendResponse.model_validate(stored)).model_copy(update={'trust_assessment': assess_trend(stored)})


def advise_trend(t: TrendResponse) -> MethodAdvice:
    """Internal typed evidence only; never accept caller-supplied statistical summaries at the API."""
    prefix = f'trends.{t.trend_id}.'
    def method(name, status, rule, text, fields):
        return MethodGuidance(method=name, status=status, rule_id=rule, explanation=text,
                              evidence_references=[prefix + f for f in fields])
    applied, recommended, available, unsupported, warnings = [], [], [], [], []
    if t.method == 'seasonal_mk' and t.p_value is not None:
        applied.append(method('seasonal_mk', 'applied', 'MONTHLY_SEASONAL_TEST',
            'The regional backend compares matching calendar months for a monotonic trend. Monthly cadence makes seasonal stratification relevant; it does not prove seasonality was detected.', ['method', 'p_value', 'start', 'end']))
    if t.slope_method == 'sen_seasonal' and t.slope_per_decade is not None:
        applied.append(method('sen_seasonal', 'applied', 'SLOPE_NOT_SIGNIFICANCE',
            f'Seasonal Sen slope estimates rate of change in {t.units} per decade; its sign and size are distinct from statistical significance and practical importance.', ['slope_method', 'slope_per_decade', 'units']))
    if t.p_value_autocorr_adjusted is not None:
        applied.append(method('hamed_rao_anomaly', 'applied', 'ADJUSTMENT_SEPARATE',
            'Hamed-Rao MK was computed on monthly anomalies. It is a separate adjusted result; the regional verdict still uses raw Seasonal MK p.', ['p_value_autocorr_adjusted', 'autocorrelation_adjusted']))
    else:
        available.append(method('hamed_rao_anomaly', 'available_not_applied', 'ADJUSTMENT_UNAVAILABLE',
            'The regional pipeline supports Hamed-Rao on anomalies, but this result contains no usable adjusted p-value. Do not claim it was applied successfully.', ['p_value_autocorr_adjusted']))
    if t.slope_ci is not None and t.ci_method == 'ols_anomaly':
        applied.append(method('ols_anomaly', 'applied', 'OLS_NOT_SEN_INTERVAL',
            'This interval targets OLS slope on monthly anomalies. It is not uncertainty around the seasonal Sen estimator. The calculation uses scipy linregress and a Student-t multiplier, not HAC.', ['slope_ci', 'ci_method', 'ci_level']))
    recommended.append(method('seasonal_mk', 'recommended', 'MONTHLY_CONDITIONAL',
        'For monthly rainfall with a scientifically justified seasonal structure, consider the supported seasonal test after reviewing missingness and serial dependence. This recommendation is not an additional computation.', ['method', 'quality']))
    recommended.append(method('hamed_rao_anomaly', 'recommended', 'DEPENDENCE_REVIEW',
        'Review serial dependence and compare available raw and adjusted evidence before choosing a future inference policy. The current verdict policy is unchanged.', ['p_value', 'p_value_autocorr_adjusted']))
    available.append(method('bh_fdr', 'available_not_applied', 'REGIONAL_NOT_GRID_FDR',
        'BH-FDR is available for the separate grid workflow over the full variable/time grid before spatial slicing. No regional FDR q-value is supplied.', ['p_value']))
    for name, text in [('ordinary_mk', 'Ordinary MK assesses monotonic trends under its assumptions, but is not a selectable standalone regional operation here; suitability for seasonal monthly series requires review.'),
                       ('hac', 'HAC/Newey-West covariance is not implemented in the regional OLS interval.'),
                       ('sen_interval', 'A confidence interval targeting the regional seasonal Sen estimator is not supplied.')]:
        unsupported.append(method(name, 'requires_review' if name == 'ordinary_mk' else 'unsupported', 'NO_UNVERIFIED_METHOD', text, ['method', 'ci_method']))
    if not t.quality.sufficient or t.quality.missing_months:
        warnings.append(ScientificRule(rule_id='COMPLETENESS', explanation=f'{t.quality.n_months} valid months; {t.quality.missing_months} missing. Regional sufficiency requires at least 10 distinct years with observations and 70% of requested months. This is not a guarantee of valid inference.', evidence_references=[prefix+'quality']))
    warnings.append(ScientificRule(rule_id='RAW_VERDICT_DEPENDENCE', explanation='The regional verdict does not account for autocorrelation through its separate adjusted p-value. Serial dependence can affect inference.', evidence_references=[prefix+'autocorrelation_adjusted', prefix+'p_value']))
    return MethodAdvice(analysis_id=t.trend_id, applied_methods=applied, recommended_methods=recommended,
        available_methods=available, unsupported_methods=unsupported, warnings=warnings,
        assumptions=[ScientificRule(rule_id='ASSUMPTIONS_NOT_TESTED', explanation='Monotonic trend suitability, seasonal structure, sampling representativeness and dependence require scientific review; no automatic assumption test is claimed.')],
        evidence_references=[prefix+f for f in ['method','slope_method','quality','source']],
        explanations=[ScientificRule(rule_id='NO_CAUSALITY', explanation='A temporal trend does not establish causality or forecast the future; statistical significance is not practical importance.')],
        recommendation_status='conditional' if t.quality.sufficient else 'requires_review')
