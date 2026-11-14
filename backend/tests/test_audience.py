"""Dual audience (Explorer / Scientist): wording may differ, evidence, numbers and verdicts must not."""
import json

from app.llm.base import GenerationInput
from app.llm.prompts import payload

REQUEST = {
    "message": "What is the rainfall trend in the Mekong Delta?",
    "context": {
        "variable_id": "imerg_precip", "dataset_id": "GPM_3IMERGM",
        "region": {"type": "preset", "id": "mekong_delta"},
        "start": "2001-01", "end": "2020-12",
    },
    "history": [],
}


def _chat(client, **extra):
    r = client.post("/api/v1/chat", json={**REQUEST, **extra})
    assert r.status_code == 200, r.text
    return r.json()


def test_audience_is_validated(client):
    r = client.post("/api/v1/chat", json={**REQUEST, "audience_mode": "child"})
    assert r.status_code == 422


def test_same_evidence_in_both_audiences(client):
    base, exp, sci = _chat(client), _chat(client, audience_mode="explorer"), _chat(client, audience_mode="scientist")
    for r in (exp, sci):
        assert r["evidence"] == base["evidence"]            # identical trend, numbers and cited fields
        assert r.get("analysis_id") == base.get("analysis_id")
    t = base["evidence"][0]["trend"]
    assert exp["answer"].startswith("In short:")
    assert base["answer"] in exp["answer"] and base["answer"] in sci["answer"]   # framing only adds wording
    assert "Decision basis: raw Seasonal Mann-Kendall p" in sci["answer"]
    verdict = "not met" if not t["significant"] else "met"
    assert f"criterion is {verdict}" in sci["answer"]
    if t["significant"] is False:
        assert "not proof that nothing is changing" in exp["answer"]


def test_no_audience_keeps_original_wording(client):
    a, b = _chat(client), _chat(client, audience_mode=None)
    assert a["answer"] == b["answer"] and not a["answer"].startswith("In short:")


def test_glossary_plain_and_technical(client):
    q = {**REQUEST, "message": "What is a p-value?"}
    plain = client.post("/api/v1/chat", json={**q, "audience_mode": "explorer"}).json()["answer"]
    tech = client.post("/api/v1/chat", json={**q, "audience_mode": "scientist"}).json()["answer"]
    assert plain != tech
    for text in (plain, tech):
        low = text.casefold()
        assert "probability that the hypothesis is true" not in low.replace("not the probability that the hypothesis is true", "")
        assert "proves there is no trend" not in low
    assert "does not prove that nothing is changing" in plain


def test_scientist_method_questions_are_answered(client):
    for q in ["What statistical test was applied?", "How was serial dependence handled?",
              "Was BH-FDR applied to raw p-values?", "What is the basis for the significance verdict?",
              "Does the reported confidence interval correspond to Sen's slope?"]:
        r = client.post("/api/v1/chat", json={**REQUEST, "message": q, "audience_mode": "scientist"}).json()
        assert not any(w["code"] == "UNSUPPORTED_QUESTION" for w in r["warnings"]), q


def test_audience_reaches_model_payload_only_as_wording():
    req = GenerationInput("education", "What is a p-value?", (), None, {}, "rid", audience="explorer")
    data = json.loads(payload(req))
    assert data["audience"] == "explorer" and data["verified_evidence"] is None
    assert "audience" not in json.loads(payload(GenerationInput("education", "x", (), None, {})))


def test_model_answers_get_the_same_frame_without_changing_evidence(client):
    from app.chat import with_audience
    from app.schemas import ChatResponse
    raw = ChatResponse.model_validate(_chat(client))          # stands in for a model answer: no frame yet
    exp, sci = with_audience(raw, "explorer"), with_audience(raw, "scientist")
    assert exp.evidence == raw.evidence == sci.evidence
    assert exp.answer.startswith("In short:") and "Decision basis:" in sci.answer
    assert with_audience(exp, "explorer").answer == exp.answer   # never framed twice
    assert with_audience(raw, None).answer == raw.answer
