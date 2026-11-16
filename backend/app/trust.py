"""Auditable interpretation checks on trusted backend results. No estimator or verdict changes."""
import math
from .scientific_schemas import TrustAssessment, ScientificRule

NO_CONCLUSIONS = ['A trend alone cannot establish causation or forecast future values.',
                  'A p-value is not the probability that the null hypothesis is true.',
                  'Non-significance does not prove zero trend; significance does not establish practical importance.']


def assess_trend(evidence: dict) -> TrustAssessment:
    t = evidence
    identifier = t.get('trend_id', 'unknown')
    prefix = f'trends.{identifier}.'
    limitations, missing = [], []
    def flag(rule, text, fields):
        limitations.append(ScientificRule(rule_id=rule, explanation=text, evidence_references=[prefix+f for f in fields]))
    required = ['variable_id','region','start','end','units','n','method','slope_method','ci_method','alpha','quality','source','autocorrelation_adjusted']
    missing = [f for f in required if t.get(f) is None or t.get(f) == {}]
    source = t.get('source') or {}
    if not all(source.get(k) for k in ['product','provider','url']):
        missing.append('source.provenance')
    basis = 'raw_seasonal_p' if t.get('method') == 'seasonal_mk' and t.get('autocorrelation_adjusted') is False else 'unknown'
    if basis == 'unknown':
        flag('AMBIGUOUS_BASIS', 'The result does not establish the audited raw Seasonal MK decision policy. No adjusted result is substituted.', ['method','autocorrelation_adjusted','significant'])
    p, alpha, verdict = t.get('p_value'), t.get('alpha'), t.get('significant')
    valid_p = isinstance(p,(float,int)) and math.isfinite(p) and 0 <= p <= 1
    valid_alpha = isinstance(alpha,(float,int)) and math.isfinite(alpha) and 0 < alpha < 1
    inconsistent = valid_p and valid_alpha and isinstance(verdict,bool) and verdict != (p < alpha)
    if inconsistent:
        flag('VERDICT_CONFLICT', 'Reported verdict conflicts with the audited raw p < alpha rule; scientific review is required. No value is changed.', ['p_value','alpha','significant'])
    flag('DEPENDENCE_NOT_IN_VERDICT', 'Regional raw Seasonal MK inference does not use the separate Hamed-Rao anomaly p-value. Serial dependence assumptions remain a limitation.', ['p_value','p_value_autocorr_adjusted','autocorrelation_adjusted'])
    if t.get('p_value_autocorr_adjusted') is None:
        flag('ADJUSTED_NOT_AVAILABLE', 'No usable autocorrelation-adjusted p-value is reported; no successful adjustment is claimed.', ['p_value_autocorr_adjusted'])
    if t.get('slope_ci') is not None:
        if t.get('ci_method') == 'ols_anomaly' and t.get('slope_method') in ('sen_seasonal', 'sen_annual'):
            flag('INTERVAL_ESTIMATOR_MISMATCH', 'OLS anomaly confidence interval targets an OLS estimator, not the Sen slope. HAC uncertainty is not implemented for this interval.', ['slope_ci','ci_method','slope_method'])
        else:
            flag('INTERVAL_REVIEW', 'The interval estimator is not established by the audited OLS/Sen pairing; inspect its metadata.', ['slope_ci','ci_method','slope_method'])
    else:
        flag('INTERVAL_UNAVAILABLE', 'No confidence interval is supplied; do not invent uncertainty bounds.', ['slope_ci'])
    q = t.get('quality') or {}
    missing.extend('quality.'+field for field in ['n_months','missing_months','coverage_fraction','sufficient'] if field not in q)
    if not q.get('sufficient') or q.get('missing_months',0):
        flag('DATA_COMPLETENESS', 'Inspect valid/missing month counts. The regional backend requires 10 distinct observed years and 70% monthly completeness; passing does not establish representativeness.', ['quality'])
    if q.get('coverage_fraction',1) < .5:
        flag('SPATIAL_COVERAGE', 'The backend reports mean spatial coverage below its 0.5 warning threshold; only available cells contribute.', ['quality.coverage_fraction'])
    if t.get('variable_id','').startswith(('gldas','merra')):
        flag('MODEL_REANALYSIS', 'This catalog product represents land-model/reanalysis output, not a direct local measurement; consult product provenance and notes.', ['variable_id','source','warnings'])
    for warning in t.get('warnings',[]):
        flag('BACKEND_QUALITY_NOTE', warning, ['warnings'])
    slope = t.get('slope_per_decade')
    if not isinstance(slope,(float,int)) or not math.isfinite(slope):
        slope = None
    direction = 'unavailable' if slope is None else 'positive' if slope > 0 else 'negative' if slope < 0 else 'zero'
    if t.get('direction') == 'no_trend' and slope:
        flag('DIRECTION_LABEL', 'The legacy direction label no_trend follows significance. It is not a zero slope; estimated direction is derived separately from the reported slope.', ['direction','slope_per_decade','significant'])
    if not valid_p or not valid_alpha or verdict is None:
        statistical = 'Insufficient reported evidence for a significance interpretation; no significance conclusion is made.'
    elif basis == 'unknown' or inconsistent:
        statistical = f'Reported p-value={p}, alpha={alpha}, verdict={verdict}; decision basis requires review.'
    else:
        statistical = f'Raw Seasonal MK p-value={p}; alpha={alpha}. The reported test ' + ('detects a statistically significant trend.' if verdict else 'does not detect a statistically significant trend. This does not prove absence of a trend.')
    status = 'requires_review' if missing or basis == 'unknown' or inconsistent else 'not_assessed' if not valid_p or verdict is None else 'limited'
    return TrustAssessment(analysis_id=identifier, status=status, decision_basis=basis, estimated_direction=direction,
        magnitude=slope, units=f"{t.get('units','unavailable')} per decade", statistical_evidence=statistical,
        limitations=limitations, cannot_conclude=NO_CONCLUSIONS, missing_metadata=sorted(set(missing)),
        evidence_references=[prefix+f for f in ['slope_per_decade','p_value','alpha','significant','source','quality']])


def assess_grid(grid) -> TrustAssessment:
    """Internal GridResponse only; never launches or accepts an LLM-supplied grid analysis."""
    return TrustAssessment(analysis_id=f'grid:{grid.variable_id}:{grid.start}:{grid.end}', status='requires_review',
        decision_basis='bh_fdr_q' if grid.fdr_method == 'benjamini_hochberg' else 'unknown',
        estimated_direction='unavailable', magnitude=None, units=f'{grid.units} per decade',
        statistical_evidence='Grid decisions use q < alpha, after BH correction across the full variable/time grid before bbox slicing. No single regional verdict is inferred.',
        limitations=[ScientificRule(rule_id='GRID_SERIAL_DEPENDENCE', explanation='Grid BH-FDR uses raw seasonal cell p-values without Hamed-Rao or another serial-dependence correction. FDR does not repair invalid marginal test assumptions.', evidence_references=['pipeline.grid.grid_trend','pipeline.trends.bh_fdr']),
                     ScientificRule(rule_id='GRID_COMPLETENESS_TIES', explanation='Grid requires at least 10 years with any finite month; it does not enforce the regional 70% monthly rule. The vectorized variance omits tie correction. These choices require scientific review.', evidence_references=['pipeline.grid.grid_trend'])],
        cannot_conclude=NO_CONCLUSIONS, missing_metadata=['cell-level serial-dependence diagnostics','source provenance in GridResponse'],
        evidence_references=['fdr_method','alpha','cells.p_value','cells.q_value','cells.significant_fdr'])
