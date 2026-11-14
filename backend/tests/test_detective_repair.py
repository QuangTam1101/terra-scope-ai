import pytest
from unittest.mock import AsyncMock
from app import agent, service
from app.llm.base import ProviderReply
from app.llm.grounding import validate_and_render
from app.llm.base import GenerationInput, ProviderError


def ask(client, message, context=None, history=None):
    return client.post('/api/v1/chat', json={'message': message, 'context': context or {}, 'history': history or [], 'use_tools': True}).json()


@pytest.mark.parametrize('gemini', [False, True])
def test_contextual_statistical_topics(client, monkeypatch, gemini):
    first = ask(client, 'Analyze precipitation in the Mekong Delta from 2001 to 2020.')
    if gemini:
        monkeypatch.setenv('GEMINI_API_KEY', 'mock-repair-key')
        from test_agent import proposal, done
        async def turn(contents):
            return proposal('advise_statistical_method', {'analysis_id':first['analysis_id']}) if len(contents) == 1 else done()
        monkeypatch.setattr(agent, 'create_session', lambda *args: type('Session', (), {'turn': staticmethod(turn)})())
        monkeypatch.setattr(agent, 'create_composer', lambda _: type('Composer', (), {'generate': AsyncMock(return_value=ProviderReply(answer='', statement_ids=['contextual_explanation']))})())
    monkeypatch.setattr(service, 'trends', lambda _: pytest.fail('Cached questions must not recompute'))
    for question, expected in [('What does that p-value mean?', 'raw seasonal p-value'),
                               ('Is the trend statistically significant?', 'raw seasonal p-value'),
                               ("Why is the slope positive if it isn't significant?", 'variability'),
                               ('Explain that confidence interval.', 'OLS'),
                               ("Explain that Sen slope.", 'pairs'),
                               ('Explain the autocorrelation adjustment.', 'separate tests'),
                               ('Explain that FDR adjustment.', 'no FDR q-value')]:
        result = ask(client, question, first['resolved_context'])
        assert expected in result['answer']
        assert result['analysis_id'] == first['analysis_id']
        assert result['mode'] == ('llm' if gemini else 'template')
        if 'p-value mean' in question:
            assert '95% OLS interval' not in result['answer'] and 'not the probability' in result['answer']


def test_current_glossary_question_wins_over_old_history(client):
    result = ask(client, 'What is a p-value?', history=[{'role':'user', 'content':'What is a confidence interval?'}])
    assert 'not the probability' in result['answer'] and 'OLS' not in result['answer']


def test_safe_conceptual_null_explanation_and_claim_rejection():
    request = GenerationInput('education', 'What is a p-value?', (), None, {})
    text = 'The null hypothesis assumes no trend. A larger p-value does not prove that no trend exists, nor does it prove what caused the pattern.'
    assert validate_and_render(ProviderReply(answer=text, statement_ids=[]), request, '') == text
    for text in ['The result is statistically significant.', 'The trend increased.', 'The p-value is 0.110.', 'Rain causes flooding.', 'Mekong delta has a positive trend.']:
        with pytest.raises(ProviderError):
            validate_and_render(ProviderReply(answer=text, statement_ids=[]), request, '')


def test_status_never_exposes_key(client, monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-status-secret')
    result = client.get('/api/v1/llm/status')
    assert result.json()['provider'] == 'gemini' and result.json()['configured']
    assert 'mock-status-secret' not in result.text


def test_cached_gemini_contradiction_falls_back_with_same_evidence(client, monkeypatch):
    first = ask(client, 'Analyze precipitation in the Mekong Delta from 2001 to 2020.')
    monkeypatch.setenv('GEMINI_API_KEY', 'mock-repair-key')
    monkeypatch.setattr(agent, 'create_composer', lambda _: type('Composer', (), {'generate': AsyncMock(return_value=ProviderReply(answer='The p-value is 0.001 and the increase is significant.', statement_ids=[]))})())
    result = ask(client, 'What does that p-value mean?', first['resolved_context'])
    assert result['mode'] == 'template' and result['evidence'] == first['evidence']
    assert '0.001 and' not in result['answer'] and 'raw seasonal p-value' in result['answer']
    assert any(w['code'] == 'LLM_FALLBACK' for w in result['warnings'])
