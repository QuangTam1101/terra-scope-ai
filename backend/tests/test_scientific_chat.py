import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from app import agent, service
from app.llm.base import ProviderReply
from test_agent import proposal, done
from test_detective_repair import ask


@pytest.mark.parametrize('question,expected', [
    ('Why use Seasonal Mann-Kendall?', 'matching calendar months'),
    ('Does autocorrelation affect this result?', 'separate tests'),
    ('What does FDR correction do?', 'no FDR q-value'),
    ("Is the confidence interval for Sen's slope?", 'not a confidence interval'),
    ('Can I conclude climate change caused this trend?', 'Causal attribution'),
    ('Which method should I use for monthly rainfall?', 'seasonal stratification')])
def test_template_method_questions_keep_context(client,monkeypatch,question,expected):
    first=ask(client,'Analyze precipitation in the Mekong Delta from 2001 to 2020.')
    monkeypatch.setattr(service,'trends',lambda _:pytest.fail('Must reuse server evidence'))
    result=ask(client,question,first['resolved_context'])
    assert result['tool_results'][0]['tool']=='advise_statistical_method'
    assert expected in result['answer']
    assert result['evidence'][0]['trend']==first['evidence'][0]['trend']
    assert result['evidence'][0]['scientific_advice']['trust_assessment']['decision_basis']=='raw_seasonal_p'


def test_live_protocol_mock_advisor_and_context_binding(client,monkeypatch):
    first=ask(client,'Analyze precipitation in the Mekong Delta from 2001 to 2020.')
    monkeypatch.setenv('GEMINI_API_KEY','mock-advisor-key')
    session=SimpleNamespace(turn=AsyncMock(side_effect=[proposal('advise_statistical_method',{'analysis_id':first['analysis_id']}),done()]))
    monkeypatch.setattr(agent,'create_session',lambda *a:session)
    monkeypatch.setattr(agent,'create_composer',lambda _:SimpleNamespace(generate=AsyncMock(return_value=ProviderReply(answer='',statement_ids=['contextual_explanation']))))
    result=ask(client,'Why use Seasonal Mann-Kendall?',first['resolved_context'])
    assert result['mode']=='llm' and result['tool_results'][0]['ok']
    assert session.turn.call_args_list[1].args[0][2].parts[0].function_response.name=='advise_statistical_method'
    session.turn.side_effect=[proposal('advise_statistical_method',{'analysis_id':'invented'})]
    rejected=ask(client,'Why use Seasonal Mann-Kendall?',first['resolved_context'])
    assert rejected['mode']=='template'


def test_general_method_guidance_claims_no_computation(client):
    r=ask(client,'Which method should I use for monthly rainfall?')
    assert not r['evidence'] and 'no analysis was performed' in r['answer']


@pytest.mark.parametrize('question,expected', [('What does FDR correction do?', 'multiple testing'), ('Does autocorrelation matter?', 'dependence'), ("Is the confidence interval for Sen's slope?", 'OLS anomaly')])
def test_general_science_without_analysis(client,question,expected):
    r=ask(client,question)
    assert not r['evidence'] and expected in r['answer']
