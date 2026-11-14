import asyncio
import base64
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx2
import pytest
from google import genai
from google.genai import types
from google.genai.client import Client as SDKClient

from app import agent, config
from app.llm.base import ProviderReply, ProviderError
from app.llm.function_calling import GeminiFunctionSession, function_declarations

ARGS = {"variable_id": "imerg_precip", "dataset_id": "GPM_3IMERGM", "region": {"type": "preset", "id": "mekong_delta"}, "start": "2001-01", "end": "2020-12"}
REQUEST = {"message": "Analyze the selected trend", "context": ARGS, "use_tools": True}


def proposal(name="analyze_trend", args=None, identifier="call1"):
    return types.Content(role="model", parts=[types.Part(function_call=types.FunctionCall(name=name, args=ARGS if args is None else args, id=identifier), thought_signature=b"signature")])


def done():
    return types.Content(role="model", parts=[types.Part(text="Ready to explain verified results.")])


@pytest.fixture
def fake_agent(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "mock-agent-secret")
    session = SimpleNamespace(turn=AsyncMock(side_effect=[proposal(), done()]))
    composer = SimpleNamespace(generate=AsyncMock(return_value=ProviderReply(answer="", statement_ids=["uncertainty"])))
    monkeypatch.setattr(agent, "create_session", lambda *args: session)
    monkeypatch.setattr(agent, "create_composer", lambda *args: composer)
    return session, composer


def test_one_tool_and_exact_protocol_roundtrip(client, fake_agent):
    session, composer = fake_agent
    response = client.post("/api/v1/chat", json=REQUEST)
    assert response.status_code == 200, response.text
    b = response.json()
    assert b["mode"] == "llm" and b["tool_results"][0]["ok"]
    assert b["evidence"][0]["trend"] == b["tool_results"][0]["data"]
    history = session.turn.call_args_list[1].args[0]
    assert history[1].parts[0].thought_signature == b"signature"
    assert history[2].parts[0].function_response.id == "call1"
    assert composer.generate.call_args.args[0].evidence["tool_results"][0]["ok"]


def test_sequential_discovery_then_analysis(client, fake_agent):
    session, _ = fake_agent
    session.turn.side_effect = [proposal("list_available_variables", {}), proposal(), done()]
    b = client.post("/api/v1/chat", json=REQUEST).json()
    assert b["mode"] == "llm" and len(b["tool_results"]) == 2 and b["evidence"]


@pytest.mark.parametrize("name,args", [("exec", {"command": "whoami"}), ("analyze_trend", {**ARGS, "path": "C:/private"})])
def test_unknown_tool_and_invalid_args_fail_safely(client, fake_agent, name, args):
    session, _ = fake_agent
    session.turn.side_effect = [proposal(name, args)]
    b = client.post("/api/v1/chat", json=REQUEST).json()
    assert b["mode"] == "template" and not b["tool_results"][0]["ok"]
    assert b["tool_results"][0]["error"]["category"] in {"unknown_tool", "invalid_input"}


def test_model_cannot_change_context(client, fake_agent):
    session, _ = fake_agent
    session.turn.side_effect = [proposal(args={**ARGS, "start": "2002-01"})]
    b = client.post("/api/v1/chat", json=REQUEST).json()
    assert b["mode"] == "template" and "tool_results" not in b
    assert any("could not be verified" in w["message"] for w in b["warnings"])


@pytest.mark.parametrize("failure", [ProviderError("timeout"), ProviderError("auth"), ProviderError("rate_limit"), ProviderError("model_unavailable")])
def test_provider_failures_keep_template(client, fake_agent, failure):
    session, _ = fake_agent
    session.turn.side_effect = failure
    assert client.post("/api/v1/chat", json=REQUEST).json()["mode"] == "template"


def test_repeated_tool_and_iteration_limits_preserve_evidence(client, fake_agent):
    session, _ = fake_agent
    session.turn.side_effect = [proposal(), proposal()]
    b = client.post("/api/v1/chat", json=REQUEST).json()
    assert b["mode"] == "template" and len(b["tool_results"]) == 1 and b["evidence"]
    assert any("limit" in w["message"] for w in b["warnings"])


def test_max_batch_calls(client, fake_agent, monkeypatch):
    monkeypatch.setenv("AGENT_MAX_TOOL_CALLS", "1")
    session, _ = fake_agent
    first = proposal().parts[0]
    second = proposal("list_available_regions", {}, "call2").parts[0]
    session.turn.side_effect = [types.Content(role="model", parts=[first, second])]
    b = client.post("/api/v1/chat", json=REQUEST).json()
    assert b["mode"] == "template" and len(b["tool_results"]) == 1


def test_invalid_final_prose_and_failure_after_tool_preserve_results(client, fake_agent):
    _, composer = fake_agent
    composer.generate.return_value = ProviderReply(answer="The slope is 999 and it is significant.", statement_ids=[])
    b = client.post("/api/v1/chat", json=REQUEST).json()
    assert b["mode"] == "template" and b["evidence"] and "999" not in b["answer"]


def test_total_deadline(client, fake_agent, monkeypatch):
    monkeypatch.setenv("AGENT_TIMEOUT_SECONDS", "1")
    session, _ = fake_agent
    async def slow(*args):
        await asyncio.sleep(10)
    session.turn.side_effect = slow
    b = client.post("/api/v1/chat", json=REQUEST).json()
    assert b["mode"] == "template" and any("deadline" in w["message"] for w in b["warnings"])


def test_iteration_budget_preserves_completed_tool(client, fake_agent, monkeypatch):
    monkeypatch.setenv("AGENT_MAX_STEPS", "1")
    session, composer = fake_agent
    b = client.post("/api/v1/chat", json=REQUEST).json()
    assert b["mode"] == "template" and b["evidence"] and session.turn.await_count == 1
    composer.generate.assert_not_awaited()


def test_evidence_budget_stops_before_composition(client, fake_agent, monkeypatch):
    monkeypatch.setenv("AGENT_MAX_EVIDENCE_BYTES", "4096")
    session, composer = fake_agent
    session.turn.side_effect = [proposal("get_time_series"), done()]
    b = client.post("/api/v1/chat", json=REQUEST).json()
    assert b["mode"] == "template" and not b["evidence"]
    composer.generate.assert_not_awaited()
    assert any("limit" in w["message"] for w in b["warnings"])


def test_provenance_cannot_change_the_selected_dataset(client, fake_agent):
    session, composer = fake_agent
    session.turn.side_effect = [proposal("get_dataset_provenance", {"variable_id": "gldas_evapotranspiration"})]
    b = client.post("/api/v1/chat", json=REQUEST).json()
    assert b["mode"] == "template" and not b["evidence"]
    composer.generate.assert_not_awaited()


def test_real_sdk_function_schema_and_call_parsing(monkeypatch):
    captured = []
    def handler(request):
        body = json.loads(request.content)
        captured.append(body)
        generation = body["generationConfig"]
        assert "responseJsonSchema" not in generation and "responseSchema" not in generation
        assert len(body["tools"][0]["functionDeclarations"]) == 7
        if len(captured) == 1:
            part = {"functionCall": {"name": "list_available_regions", "args": {}, "id": "fc1"}, "thoughtSignature": base64.b64encode(b"signature").decode()}
        else:
            assert body["contents"][1]["parts"][0]["thoughtSignature"]
            assert body["contents"][2]["parts"][0]["functionResponse"]["id"] == "fc1"
            part = {"text": "Done"}
        return httpx2.Response(200, json={"candidates": [{"content": {"role": "model", "parts": [part]}, "finishReason": "STOP"}]})
    def factory(**kwargs):
        kwargs["http_options"].httpx_async_client = httpx2.AsyncClient(transport=httpx2.MockTransport(handler))
        return SDKClient(**kwargs)
    monkeypatch.setattr(genai, "Client", factory)
    async def execute():
        session = GeminiFunctionSession(config.LLMSettings(api_key="mock-key"), "a" * 32)
        contents = [types.Content(role="user", parts=[types.Part(text="List regions")])]
        first = await session.turn(contents)
        contents += [first, types.Content(role="user", parts=[types.Part(function_response=types.FunctionResponse(name="list_available_regions", id="fc1", response={"ok": True}))])]
        second = await session.turn(contents)
        assert second.parts[0].text == "Done"
    asyncio.run(execute())
    assert len(captured) == 2 and len(function_declarations()) == 7
