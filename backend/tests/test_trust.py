import pytest
from app.trust import assess_trend, assess_grid
from app.schemas import GridResponse
from test_advisor import trend


@pytest.mark.parametrize('slope', [3.0,-3.0])
def test_non_significance_is_not_zero_or_direction(client,slope):
    t=trend(client).model_dump(mode='json');t.update(slope_per_decade=slope,p_value=.11,significant=False,direction='no_trend')
    a=assess_trend(t)
    assert a.estimated_direction == ('positive' if slope>0 else 'negative')
    assert 'does not detect' in a.statistical_evidence and 'absence' in a.statistical_evidence
    assert a.magnitude==slope and any(r.rule_id=='DIRECTION_LABEL' for r in a.limitations)


def test_supported_decision_and_adjustment_separation(client):
    t=trend(client).model_dump(mode='json');t.update(p_value=.01,p_value_autocorr_adjusted=.9,significant=True)
    a=assess_trend(t)
    assert a.decision_basis=='raw_seasonal_p' and 'detects a statistically significant' in a.statistical_evidence
    assert a.status=='limited' and any(r.rule_id=='INTERVAL_ESTIMATOR_MISMATCH' for r in a.limitations)
    assert 'causation' in a.cannot_conclude[0]


@pytest.mark.parametrize('patch,rule', [({'method':'unknown'},'AMBIGUOUS_BASIS'), ({'p_value':.9,'significant':True},'VERDICT_CONFLICT')])
def test_ambiguous_or_conflicting_verdict(client,patch,rule):
    t=trend(client).model_dump(mode='json');t.update(patch)
    a=assess_trend(t)
    assert a.status=='requires_review' and any(r.rule_id==rule for r in a.limitations)


def test_missing_provenance_and_partial_observations(client):
    t=trend(client).model_dump(mode='json');t.pop('source');t['quality'].update(missing_months=10,sufficient=False)
    a=assess_trend(t)
    assert 'source' in a.missing_metadata and any(r.rule_id=='DATA_COMPLETENESS' for r in a.limitations)


def test_grid_fdr_caveat_without_computing_grid():
    g=GridResponse(variable_id='imerg_precip',units='mm/month',start='2001-01',end='2024-12',cell_size_deg=1,fdr_method='benjamini_hochberg',alpha=.05,value_range={'min_slope':0,'max_slope':0},cells=[],precomputed=True,warnings=[])
    a=assess_grid(g)
    assert a.decision_basis=='bh_fdr_q' and a.status=='requires_review'
    assert {r.rule_id for r in a.limitations}=={'GRID_SERIAL_DEPENDENCE','GRID_COMPLETENESS_TIES'}
