from app import service
from app.schemas import TrendRequest, TrendResponse
from app.advisor import advise, advise_trend
from app.tools import registry


def trend(client):
    return TrendResponse.model_validate(service.trends(TrendRequest(variable_id='imerg_precip', region={'type':'preset','id':'mekong_delta'}, start='2001-01', end='2020-12')))


def test_advisor_repeatable_server_reference(client):
    t = trend(client)
    a = advise(t.trend_id)
    assert a == advise(t.trend_id)
    assert {m.method for m in a.applied_methods} == {'seasonal_mk','sen_seasonal','hamed_rao_anomaly','ols_anomaly'}
    assert any(m.rule_id == 'OLS_NOT_SEN_INTERVAL' for m in a.applied_methods)
    assert {m.method for m in a.unsupported_methods} == {'ordinary_mk','hac','sen_interval'}
    assert registry.execute('advise_statistical_method', {'analysis_id':t.trend_id}).data == a


def test_missing_adjustment_and_observations(client):
    t = trend(client)
    t = t.model_copy(update={'p_value_autocorr_adjusted':None, 'quality':t.quality.model_copy(update={'missing_months':12, 'sufficient':False})})
    a = advise_trend(t)
    assert a.recommendation_status == 'requires_review'
    assert any(m.method == 'hamed_rao_anomaly' for m in a.available_methods)
    assert any(w.rule_id == 'COMPLETENESS' for w in a.warnings)


def test_advisor_rejects_invalid_refs_and_client_statistics(client):
    assert not registry.execute('advise_statistical_method', {'analysis_id':'unknown'}).ok
    assert registry.execute('advise_statistical_method', {'analysis_id':'x','p_value':0.001}).error.category == 'invalid_input'


def test_monthly_guidance_distinguishes_recommendation(client):
    a = advise(trend(client).trend_id)
    assert all(m.status == 'recommended' for m in a.recommended_methods)
    assert any(m.rule_id == 'REGIONAL_NOT_GRID_FDR' for m in a.available_methods)
    assert 'not an additional computation' in a.recommended_methods[0].explanation
