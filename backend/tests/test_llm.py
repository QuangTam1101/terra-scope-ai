"""Mock-only provider, grounding, compatibility and cost-control coverage."""
import asyncio
import json
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import httpx
import httpx2
from google.genai.client import Client as SDKClient
from google import genai
from google.genai import errors, types

from app import chat, config
from app.llm import runtime
from app.llm.base import GenerationInput, ProviderError, ProviderReply
from app.llm.gemini_provider import GeminiProvider
from app.llm.prompts import payload

SECRET = "unit-test-secret-never-a-real-key"
REQUEST = {
    "message": "What is the rainfall trend in the Mekong Delta?",
    "context": {"variable_id": "imerg_precip", "dataset_id": "GPM_3IMERGM",
                "region": {"type": "preset", "id": "mekong_delta"}, "start": "2001-01", "end": "2020-12"},
    "history": [],
}


@pytest.fixture
def provider(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)
    result = SimpleNamespace(generate=AsyncMock(return_value=ProviderReply(answer="", statement_ids=["uncertainty"])))
    monkeypatch.setattr(runtime, "create_provider", lambda settings: result)
    return result


def sdk_mock(monkeypatch, *, answer=None, error=None, finish=types.FinishReason.STOP):
    async def generate(**kwargs):
        if error:
            raise error
        return SimpleNamespace(text=json.dumps(answer), candidates=[SimpleNamespace(finish_reason=finish)])

    generate_mock = AsyncMock(side_effect=generate)

    class AsyncClient:
        models = SimpleNamespace(generate_content=generate_mock)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

    created = []

    def create(**kwargs):
        created.append(kwargs)
        return SimpleNamespace(aio=AsyncClient())

    monkeypatch.setattr(genai, "Client", create)
    return generate_mock, created


def test_official_provider_success_and_limits(monkeypatch):
    generate, created = sdk_mock(monkeypatch, answer={"answer": "A p-value summarizes evidence under a null hypothesis.", "statement_ids": []})
    request = GenerationInput("education", "What is a p-value?", (), None, {})
    result = asyncio.run(GeminiProvider(config.LLMSettings(api_key=SECRET)).generate(request))
    assert result.answer.startswith("A p-value")
    assert created[0]["api_key"] == SECRET and created[0]["vertexai"] is False
    assert created[0]["http_options"].timeout == 30000
    assert created[0]["http_options"].retry_options.attempts == 1
    kwargs = generate.call_args.kwargs
    assert kwargs["model"] == "gemini-4-argon"
    assert kwargs["config"].max_output_tokens == 1024
    assert kwargs["config"].response_schema is None
    assert kwargs["config"].response_json_schema == ProviderReply.model_json_schema()
    assert kwargs["config"].automatic_function_calling.disable is True
    assert not kwargs["config"].tools and SECRET not in kwargs["contents"]


def test_official_sdk_serializes_json_schema_without_live_network(monkeypatch):
    captured = []

    def respond(request):
        body = json.loads(request.content)
        captured.append(body)
        generation = body["generationConfig"]
        assert "responseSchema" not in generation
        assert generation["responseJsonSchema"] == ProviderReply.model_json_schema()
        assert generation["responseJsonSchema"]["additionalProperties"] is False
        return httpx2.Response(200, json={"candidates": [{
            "content": {"role": "model", "parts": [{"text": json.dumps({
                "answer": "A p-value summarizes evidence under a null hypothesis.", "statement_ids": [],
            })}]}, "finishReason": "STOP",
        }]})

    def client(**kwargs):
        # All SDK HTTP traffic is intercepted; no socket or project key is used.
        kwargs["http_options"].httpx_async_client = httpx2.AsyncClient(transport=httpx2.MockTransport(respond))
        return SDKClient(**kwargs)

    monkeypatch.setattr(genai, "Client", client)
    request = GenerationInput("education", "What is a p-value?", (), None, {})
    result = asyncio.run(GeminiProvider(config.LLMSettings(api_key=SECRET)).generate(request))
    assert result.answer.startswith("A p-value") and len(captured) == 1


def test_provider_missing_key_never_constructs_client():
    with pytest.raises(ProviderError) as caught:
        asyncio.run(GeminiProvider(config.LLMSettings()).generate(GenerationInput("education", "Hi", (), None, {})))
    assert caught.value.code == "missing_key"


def test_sdk_transport_timeout(monkeypatch):
    sdk_mock(monkeypatch, error=TimeoutError(SECRET))
    with pytest.raises(ProviderError) as caught:
        asyncio.run(GeminiProvider(config.LLMSettings(api_key=SECRET)).generate(GenerationInput("education", "Hi", (), None, {})))
    assert caught.value.code == "timeout" and SECRET not in str(caught.value)


@pytest.mark.parametrize("status,code", [(400, "invalid_request"), (401, "auth"), (403, "auth"), (429, "rate_limit"),
                                       (404, "model_unavailable"), (503, "service"), (504, "timeout")])
def test_provider_sdk_errors_are_typed_and_redacted(monkeypatch, status, code):
    sdk_mock(monkeypatch, error=errors.APIError(status, {"error": {"message": SECRET, "status": "FAIL"}}))
    with pytest.raises(ProviderError) as caught:
        asyncio.run(GeminiProvider(config.LLMSettings(api_key=SECRET)).generate(GenerationInput("education", "Hi", (), None, {})))
    assert caught.value.code == code and caught.value.http_status == status and SECRET not in str(caught.value)


def diagnostic_records(caplog):
    return [json.loads(record.message) for record in caplog.records
            if record.name == "uvicorn.error.terra_scope.llm"]


def test_missing_key_diagnostic_and_request_id(client, caplog):
    caplog.set_level(logging.INFO, logger="uvicorn.error.terra_scope.llm")
    response = client.post("/api/v1/chat", json={"message": "What is a p-value?"})
    logs = diagnostic_records(caplog)
    assert logs[-1]["request_id"] == response.headers["X-Request-ID"]
    assert logs[-1]["error_category"] == "missing_key" and logs[-1]["fallback"] is True
    assert logs[-1]["http_status"] is None and not any(x["error_category"] == "sdk_call_started" for x in logs)
    assert set(logs[-1]) == {"request_id", "provider", "model", "error_category", "http_status", "fallback", "grounding_rejection"}


@pytest.mark.parametrize("status", [400, 401, 403, 404, 429, 503])
def test_sdk_http_diagnostics_have_status_and_no_payload(client, monkeypatch, caplog, status):
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)
    caplog.set_level(logging.INFO, logger="uvicorn.error.terra_scope.llm")
    sdk_mock(monkeypatch, error=errors.APIError(status, {"error": {"message": SECRET, "status": "FAIL"}}))
    response = client.post("/api/v1/chat", json={"message": "What is a p-value?"})
    logs = diagnostic_records(caplog)
    assert logs[0]["error_category"] == "sdk_call_started"
    assert logs[-1]["http_status"] == status and logs[-1]["fallback"] is True
    assert all(x["request_id"] == response.headers["X-Request-ID"] for x in logs)
    assert SECRET not in caplog.text and SECRET not in response.text


def test_explicit_key_invalid_reason_is_auth(monkeypatch):
    sdk_mock(monkeypatch, error=errors.APIError(400, {"error": {
        "message": SECRET, "status": "INVALID_ARGUMENT", "details": [{"reason": "API_KEY_INVALID"}],
    }}))
    with pytest.raises(ProviderError) as caught:
        asyncio.run(GeminiProvider(config.LLMSettings(api_key=SECRET)).generate(GenerationInput("education", "Hi", (), None, {})))
    assert caught.value.code == "auth" and caught.value.http_status == 400


@pytest.mark.parametrize("message,status,detail", [
    ("Billing must be enabled for this model", "FAILED_PRECONDITION", "google_billing_requirement"),
    ("User location is not supported for this API", "FAILED_PRECONDITION", "google_region_restriction"),
    ("Project prerequisites are not met", "FAILED_PRECONDITION", "google_failed_precondition"),
    ("Invalid JSON schema in response_schema", "INVALID_ARGUMENT", "request_schema"),
    ("temperature is unsupported", "INVALID_ARGUMENT", "request_temperature"),
    ("Invalid maxOutputTokens", "INVALID_ARGUMENT", "request_output_limit"),
    ("An invalid parameter was supplied", "INVALID_ARGUMENT", "request_parameter_unspecified"),
])
def test_google_400_details_are_classified_without_logging_message(monkeypatch, message, status, detail):
    sdk_mock(monkeypatch, error=errors.APIError(400, {"error": {"message": message + SECRET, "status": status}}))
    with pytest.raises(ProviderError) as caught:
        asyncio.run(GeminiProvider(config.LLMSettings(api_key=SECRET)).generate(GenerationInput("education", "Hi", (), None, {})))
    assert caught.value.code == "invalid_request" and caught.value.detail == detail
    assert message not in str(caught.value) and SECRET not in str(caught.value)


def test_network_failure_is_not_auth_or_google_http(client, monkeypatch, caplog):
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)
    caplog.set_level(logging.INFO, logger="uvicorn.error.terra_scope.llm")
    sdk_mock(monkeypatch, error=httpx.ConnectError(SECRET))
    response = client.post("/api/v1/chat", json={"message": "What is a p-value?"})
    assert response.json()["mode"] == "template"
    assert diagnostic_records(caplog)[-1]["error_category"] == "network"
    assert diagnostic_records(caplog)[-1]["http_status"] is None
    assert SECRET not in caplog.text


def test_sdk_missing_fields_have_specific_diagnostic(client, monkeypatch, caplog):
    monkeypatch.setenv("GEMINI_API_KEY", SECRET)
    caplog.set_level(logging.INFO, logger="uvicorn.error.terra_scope.llm")
    sdk_mock(monkeypatch, answer={"answer": "A conceptual definition."})
    response = client.post("/api/v1/chat", json={"message": "What is a p-value?"})
    log = diagnostic_records(caplog)[-1]
    assert log["error_category"] == "invalid_response.schema_missing_fields"
    assert log["http_status"] == 200 and log["grounding_rejection"] is None
    assert "A conceptual definition" not in caplog.text
    assert response.json()["mode"] == "template"


@pytest.mark.parametrize("answer,category", [
    ("The threshold is 0.05.", "education_numeric"),
    ("The result is statistically significant.", "education_statistical_claim"),
    ("The result proves causality.", "education_causal_or_forecast_claim"),
    ("Your dataset indicates a change.", "education_context_claim"),
])
def test_grounding_logs_exact_rule_without_model_prose(client, provider, caplog, answer, category):
    caplog.set_level(logging.INFO, logger="uvicorn.error.terra_scope.llm")
    provider.generate.return_value = ProviderReply(answer=answer, statement_ids=[])
    response = client.post("/api/v1/chat", json={"message": "What is a p-value?"})
    log = diagnostic_records(caplog)[-1]
    assert log["error_category"] == "grounding" and log["grounding_rejection"] == category
    assert log["http_status"] == 200 and log["fallback"] is True
    assert answer not in caplog.text and SECRET not in caplog.text
    assert response.json()["mode"] == "template"


def test_diagnostics_reject_untrusted_field_values(caplog):
    from app.llm.diagnostics import emit

    caplog.set_level(logging.INFO, logger="uvicorn.error.terra_scope.llm")
    emit(config.LLMSettings(api_key=SECRET, model="gemini-" + SECRET, provider=SECRET), SECRET, SECRET,
         fallback=True, detail=SECRET)
    log = diagnostic_records(caplog)[-1]
    assert log["model"] == "redacted" and log["provider"] == "unsupported"
    assert log["error_category"] == "service" and SECRET not in caplog.text


def test_smoke_failure_preserves_only_safe_category_and_id():
    from backend.scripts.smoke_gemini import SmokeFailure, require_mode
    from backend.app.llm.runtime import FALLBACK_MESSAGES

    with pytest.raises(SmokeFailure) as caught:
        require_mode({"mode": "template", "warnings": [
            {"code": "LLM_FALLBACK", "message": FALLBACK_MESSAGES["grounding"]},
            {"code": "OTHER", "message": SECRET},
        ]}, "llm", "Conceptual", {"request_id": "a" * 32})
    assert caught.value.diagnostics == {"request_id": "a" * 32, "error_category": "grounding", "fallback": True}
    assert SECRET not in json.dumps(caught.value.diagnostics)


def test_project_model_diagnostics_only_read_metadata(monkeypatch, capsys):
    from backend.scripts import diagnose_gemini_models

    monkeypatch.setenv("GEMINI_API_KEY", SECRET)
    model = SimpleNamespace(name="models/gemini-4-argon", supported_actions=["generateContent"])

    class MetadataClient:
        models = SimpleNamespace(get=lambda **kwargs: model, list=lambda **kwargs: SimpleNamespace(page=[model]))

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

    monkeypatch.setattr(genai, "Client", lambda **kwargs: MetadataClient())
    assert diagnose_gemini_models.main() == 0
    output = capsys.readouterr().out
    report = json.loads(output)
    assert report["generation_requests"] == 0 and report["configured_model_http_status"] == 200
    assert report["visible_generation_models"] == ["gemini-4-argon"] and SECRET not in output


@pytest.mark.parametrize("answer,finish", [
    ({"answer": SECRET, "statement_ids": []}, types.FinishReason.STOP),
    ({"answer": "Hello", "statement_ids": [], "evidence": {"slope": 999}}, types.FinishReason.STOP),
    ({"answer": "partial", "statement_ids": []}, types.FinishReason.MAX_TOKENS),
    ({"answer": "blocked", "statement_ids": []}, types.FinishReason.SAFETY),
])
def test_provider_rejects_secret_extra_fields_and_truncation(monkeypatch, answer, finish):
    sdk_mock(monkeypatch, answer=answer, finish=finish)
    with pytest.raises(ProviderError) as caught:
        asyncio.run(GeminiProvider(config.LLMSettings(api_key=SECRET)).generate(GenerationInput("education", "Hi", (), None, {})))
    assert caught.value.code == "invalid_response"


def test_missing_key_chat_keeps_contract_and_template(client):
    body = client.post("/api/v1/chat", json=REQUEST).json()
    assert body["mode"] == "template" and body["evidence"]
    assert set(body) == {"answer", "mode", "evidence", "warnings", "actions", "disclaimer", "analysis_id"}
    assert body["warnings"][-1]["code"] == "LLM_FALLBACK"


def test_llm_data_preserves_exact_evidence_actions_and_id(client, provider):
    template = chat.template_response(runtime.ChatRequest(**REQUEST)).model_dump(mode="json", exclude_unset=True)
    response = client.post("/api/v1/chat", json=REQUEST)
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "llm"
    for field in ["evidence", "actions", "analysis_id"]:
        assert body[field] == template[field]
    assert "GPM_3IMERGM" in body["answer"] and "seasonal_mk" in body["answer"]
    assert template["evidence"][0]["trend"]["plain_summary"] in body["answer"]
    sent = provider.generate.call_args.args[0]
    assert sent.kind == "data" and "trend_line" not in sent.evidence
    assert "points" not in sent.evidence and "cells" not in sent.evidence


def test_general_concept_and_natural_follow_up(client, provider):
    provider.generate.return_value = ProviderReply(answer="Autocorrelation describes dependence between observations across time.", statement_ids=[])
    first = client.post("/api/v1/chat", json={"message": "What does autocorrelation mean?"}).json()
    assert first["mode"] == "llm" and first["evidence"] == [] and "analysis_id" not in first
    provider.generate.return_value = ProviderReply(answer="It matters because related observations carry less independent information.", statement_ids=[])
    history = [{"role": "user", "content": "What does autocorrelation mean?"}, {"role": "assistant", "content": first["answer"]}]
    second = client.post("/api/v1/chat", json={"message": "Why does it matter for trend detection?", "history": history}).json()
    assert second["mode"] == "llm" and second["evidence"] == []
    sent = provider.generate.call_args.args[0]
    assert sent.kind == "education" and sent.history == tuple(history) and sent.evidence is None


def test_data_follow_up_uses_current_evidence_not_history(client, provider):
    request = {**REQUEST, "message": "Why is this result not statistically significant?",
               "history": [{"role": "assistant", "content": "A previous analysis had slope 999999 and p-value zero."}]}
    body = client.post("/api/v1/chat", json=request).json()
    assert body["mode"] == "llm" and "999999" not in body["answer"]
    sent = provider.generate.call_args.args[0]
    assert sent.evidence["trend_id"] == body["analysis_id"]
    assert sent.evidence["slope_per_decade"] == body["evidence"][0]["trend"]["slope_per_decade"]


@pytest.mark.parametrize("reply", [
    ProviderReply(answer="The slope is 999 and p-value is zero.", statement_ids=[]),
    ProviderReply(answer="", statement_ids=["fabricated_q_value"]),
    ProviderReply(answer="", statement_ids=["uncertainty", "uncertainty"]),
])
def test_hallucination_falls_back_to_original_template(client, provider, reply):
    provider.generate.return_value = reply
    expected = chat.template_response(runtime.ChatRequest(**REQUEST))
    body = client.post("/api/v1/chat", json=REQUEST).json()
    assert body["mode"] == "template" and body["answer"] == expected.answer
    assert "999" not in body["answer"]
    assert "could not be verified" in body["warnings"][-1]["message"]


def test_conflicting_significance_and_insufficient_data(client, provider):
    provider.generate.return_value = ProviderReply(answer="", statement_ids=["significant"])
    body = client.post("/api/v1/chat", json={**REQUEST, "context": {**REQUEST["context"], "end": "2005-12"}}).json()
    assert body["mode"] == "template"
    assert body["evidence"][0]["trend"]["significant"] is None
    assert body["evidence"][0]["trend"]["slope_ci"] is None


def test_conflicting_significance_rejected_on_sufficient_data(client, provider):
    provider.generate.return_value = ProviderReply(answer="", statement_ids=["not_significant"])
    body = client.post("/api/v1/chat", json={**REQUEST, "message": "What is the trend for the current selection?", "context": {
        **REQUEST["context"], "region": {"type": "bbox", "bbox": [100, 5, 104, 10]},
    }}).json()
    assert body["evidence"][0]["trend"]["significant"] is True
    assert body["mode"] == "template"


def test_concept_does_not_require_selected_cube(client, provider):
    provider.generate.return_value = ProviderReply(answer="Seasonal tests compare observations within matching calendar seasons.", statement_ids=[])
    body = client.post("/api/v1/chat", json={**REQUEST, "message": "Explain Seasonal Mann-Kendall trend detection", "context": {
        **REQUEST["context"], "variable_id": "merra2_air_temperature_2m", "dataset_id": "M2IMNXASM",
    }}).json()
    assert body["mode"] == "llm" and body["evidence"] == [] and "analysis_id" not in body


def test_named_region_pvalue_question_is_data_specific(client, provider):
    body = client.post("/api/v1/chat", json={**REQUEST, "message": "What is the p-value for the Mekong Delta?"}).json()
    assert body["mode"] == "llm" and body["evidence"]
    assert provider.generate.call_args.args[0].kind == "data"


@pytest.mark.parametrize("code", ["auth", "rate_limit", "timeout", "model_unavailable", "service", "invalid_response"])
def test_provider_failure_template_and_no_secret_leak(client, provider, code, caplog):
    provider.generate.side_effect = ProviderError(code)
    body = client.post("/api/v1/chat", json=REQUEST)
    assert body.status_code == 200 and body.json()["mode"] == "template"
    assert SECRET not in body.text and SECRET not in caplog.text


def test_unexpected_error_no_secret_leak(client, provider, caplog):
    provider.generate.side_effect = RuntimeError(SECRET)
    response = client.post("/api/v1/chat", json=REQUEST)
    assert response.status_code == 200 and response.json()["mode"] == "template"
    assert SECRET not in response.text and SECRET not in caplog.text


def test_total_deadline_cancels_generation(client, provider, monkeypatch):
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "1")

    async def slow(request):
        await asyncio.sleep(10)

    provider.generate.side_effect = slow
    body = client.post("/api/v1/chat", json={"message": "What is a p-value?"}).json()
    assert body["mode"] == "template" and "deadline" in body["warnings"][-1]["message"]
    assert runtime.budget.active == 0


@pytest.mark.parametrize("text", ["The current dataset has slope 999.", "The p-value equals zero.",
                                  "The result proves causality.", SECRET])
def test_education_rejects_unverified_numbers_and_secrets(client, provider, text):
    provider.generate.return_value = ProviderReply(answer=text, statement_ids=[])
    response = client.post("/api/v1/chat", json={"message": "What is a p-value?"})
    assert response.json()["mode"] == "template" and SECRET not in response.text


def test_history_and_payload_bounds(client, provider):
    provider.generate.return_value = ProviderReply(answer="A p-value is a test summary under a null hypothesis.", statement_ids=[])
    history = [{"role": "user", "content": "x" * 2000}] * 24
    body = client.post("/api/v1/chat", json={"message": "What is a p-value?", "history": history}).json()
    assert body["mode"] == "llm"
    sent = provider.generate.call_args.args[0]
    assert len(sent.history) <= 8 and sum(len(t["content"]) for t in sent.history) <= 8000
    assert len(payload(sent)) <= 24000


def test_rate_limit_and_cooldown_prevent_repeated_calls(client, provider, monkeypatch):
    monkeypatch.setenv("LLM_REQUESTS_PER_MINUTE", "1")
    assert client.post("/api/v1/chat", json=REQUEST).json()["mode"] == "llm"
    assert client.post("/api/v1/chat", json=REQUEST).json()["mode"] == "template"
    assert provider.generate.await_count == 1


def test_upstream_rate_limit_cooldown(client, provider):
    provider.generate.side_effect = ProviderError("rate_limit")
    for _ in range(2):
        assert client.post("/api/v1/chat", json=REQUEST).json()["mode"] == "template"
    assert provider.generate.await_count == 1


def test_concurrency_limit_does_not_queue(client, provider):
    assert runtime.budget.enter(10) and runtime.budget.enter(10)
    body = client.post("/api/v1/chat", json=REQUEST).json()
    assert body["mode"] == "template" and provider.generate.await_count == 0
    runtime.budget.leave(None)
    runtime.budget.leave(None)


@pytest.mark.parametrize("patch", [{"LLM_TIMEOUT_SECONDS": "bad"}, {"LLM_TIMEOUT_SECONDS": "nan"},
                                  {"LLM_MAX_OUTPUT_TOKENS": "999999"}, {"GEMINI_MODEL": ""},
                                  {"LLM_PROVIDER": "openai"}])
def test_invalid_configuration_never_breaks_app(client, provider, monkeypatch, patch):
    for key, value in patch.items():
        monkeypatch.setenv(key, value)
    body = client.post("/api/v1/chat", json=REQUEST).json()
    assert body["mode"] == "template" and provider.generate.await_count == 0


@pytest.mark.parametrize("message", ["What is the rainfall trend in Hanoi?", "Use a different dataset instead",
                                    "Explain the soil moisture trend", "What is the rainfall trend in 2010-2020?",
                                    "Explain the GLDAS rainfall trend"])
def test_context_changes_do_not_trigger_tool_calls(client, provider, message):
    body = client.post("/api/v1/chat", json={**REQUEST, "message": message}).json()
    assert body["mode"] == "template" and body["evidence"] == []
    assert provider.generate.await_count == 0


def test_explain_still_template_even_with_configured_gemini(client, provider):
    request = {"question": "What is the trend?", "context": {"variable_id": "imerg_precip",
               "region": REQUEST["context"]["region"], "period": "2001-2020"}}
    body = client.post("/api/v1/explain", json=request).json()
    assert body["model"] == "template-v1 (no language model)" and provider.generate.await_count == 0


def test_secret_not_in_settings_repr():
    assert SECRET not in repr(config.LLMSettings(api_key=SECRET))
