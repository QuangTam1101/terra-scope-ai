"""Phase 3.5 smoke tests. Template is isolated; live calls require an explicit flag.

Never print keys, raw SDK exceptions, HTTP error bodies or environment contents.
Run from the repository root with the existing .venv. No test writes data or settings.
"""
import argparse
import itertools
import json
import math
import os
import re
import sys
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

TREND_REQUEST = {
    "variable_id": "imerg_precip",
    "region": {"type": "preset", "id": "mekong_delta"},
    "start": "2001-01", "end": "2024-12",
}


class SmokeFailure(Exception):
    """Only fixed, non-secret failure messages may be used."""
    def __init__(self, message, diagnostics=None):
        super().__init__(message)
        self.diagnostics = diagnostics


def require(condition, message):
    if not condition:
        raise SmokeFailure(message)


def call(client, path, body=None, *, trace=None):
    response = client.get(path) if body is None else client.post(path, json=body)
    if trace is not None:
        identifier = response.headers.get("X-Request-ID", "")
        trace["request_id"] = identifier if re.fullmatch(r"[0-9a-f]{32}", identifier) else None
    require(response.status_code == 200, f"HTTP check failed: {path} ({response.status_code})")
    return response.json()


def require_mode(reply, expected, stage, trace):
    if reply["mode"] == expected:
        return
    # Preserve only fixed fallback categories and a server-generated correlation ID.
    # Never print an arbitrary response body, warning, model answer or SDK error.
    from backend.app.llm.runtime import FALLBACK_MESSAGES
    categories = {message: category for category, message in FALLBACK_MESSAGES.items()}
    category = next((categories[w.get("message")] for w in reply.get("warnings", [])
                     if w.get("code") == "LLM_FALLBACK" and w.get("message") in categories), "unknown_fallback")
    raise SmokeFailure(f"{stage} answer fell back; live Gemini is not verified", {
        "request_id": trace.get("request_id"), "error_category": category, "fallback": True,
    })


def check_reference(trend):
    require(trend["variable_id"] == "imerg_precip" and trend["region"]["id"] == "mekong_delta",
            "Unexpected variable or region")
    require((trend["start"], trend["end"]) == ("2001-01", "2024-12"), "Unexpected period")
    require(trend["source"]["product"] == "GPM_3IMERGM" and trend["source"]["version"] == "07",
            "Unexpected source dataset")
    require(math.isclose(trend["slope_per_decade"], 3.1636047363, rel_tol=0, abs_tol=1e-9),
            "NASA slope differs from regression reference")
    require(math.isclose(trend["p_value"], 0.110316449, rel_tol=0, abs_tol=1e-9),
            "NASA p-value differs from regression reference")
    require(trend["significant"] is False and trend["n"] == 288,
            "Unexpected significance decision or number of months")


def check_scientific_answer(reply, trend):
    from backend.app.llm.base import GenerationInput, ProviderError, ProviderReply
    from backend.app.llm.grounding import approved_statements, validate_and_render
    from backend.app.schemas import ChatEvidence

    require(reply.get("analysis_id") == trend["trend_id"], "Chat analysis ID differs from deterministic result")
    require(len(reply["evidence"]) == 1 and reply["evidence"][0]["trend"] == trend,
            "Chat evidence differs from deterministic result")
    require(trend["plain_summary"] in reply["answer"], "Answer does not preserve the verified summary")
    evidence = ChatEvidence.model_validate(reply["evidence"][0])
    statements = approved_statements(evidence)
    require("significant" not in statements and "not_significant" in statements,
            "Grounding allowlist permits a conflicting significance decision")
    guard_request = GenerationInput("data", "Explain the selected result", (), None, statements)
    try:
        validate_and_render(ProviderReply(answer="", statement_ids=["significant"]), guard_request, "")
    except ProviderError:
        pass
    else:
        raise SmokeFailure("Grounding accepted a false significant-increase claim")
    if reply["mode"] == "llm":
        # Exact closed-set check; a free-form positive claim, new number or extra
        # assertion cannot be hidden behind correct evidence fields.
        suffix = (
            f" Source: {trend['source']['product']} v{trend['source']['version']}, "
            f"{trend['source']['provider']} (satellite-derived observations). "
            f"Method: {trend['method']}; slope: {trend['slope_method']}; interval: {trend['ci_method']}. "
            "These results describe the past and do not establish causality or predict the future."
        )
        allowed = {
            trend["plain_summary"] + " " + " ".join(parts) + suffix
            for count in range(1, min(4, len(statements)) + 1)
            for parts in itertools.permutations(statements.values(), count)
        }
        require(reply["answer"] in allowed, "Gemini explanation contains unapproved scientific prose")


def run(client, live):
    require(call(client, "/api/v1/health")["status"] == "ok", "Backend health failed")
    require(client.get("/docs").status_code == 200, "Swagger is unavailable")
    trend = call(client, "/api/v1/trends", TREND_REQUEST)
    check_reference(trend)
    explanation = call(client, "/api/v1/explain", {
        "question": "Explain the trend", "context": {"trend_ids": [trend["trend_id"]]},
    })
    require(explanation["model"] == "template-v1 (no language model)", "Explain compatibility failed")
    concept_trace = {}
    concept = call(client, "/api/v1/chat", {"message": "What is a p-value?", "history": []}, trace=concept_trace)
    expected_mode = "llm" if live else "template"
    require_mode(concept, expected_mode, "Conceptual", concept_trace)
    require(not concept["evidence"] and "analysis_id" not in concept,
            "Conceptual answer created an unverified analysis")
    scientific_trace = {}
    reply = call(client, "/api/v1/chat", {
        "message": "What is the precipitation trend in the Mekong Delta? Is the increase statistically significant?",
        "context": {**TREND_REQUEST, "dataset_id": "GPM_3IMERGM", "trend_id": trend["trend_id"]},
        "history": [],
    }, trace=scientific_trace)
    require_mode(reply, expected_mode, "Scientific", scientific_trace)
    check_scientific_answer(reply, trend)
    if not live:
        require(reply["answer"] == explanation["answer"], "Template differs from deterministic explanation")
        require(any(w["code"] == "LLM_FALLBACK" for w in reply["warnings"]), "Missing no-key fallback warning")
    return {
        "status": "passed", "mode": expected_mode, "live_gemini_verified": live,
        "analysis_id": trend["trend_id"], "source": "GPM_3IMERGM.07", "months": trend["n"],
        "slope_per_decade": trend["slope_per_decade"], "p_value": trend["p_value"],
        "significant": trend["significant"], "exact_evidence_match": True,
        "false_significance_rejected": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--template", action="store_true", help="No Gemini network calls; ignore the local key in this process")
    modes.add_argument("--live", action="store_true", help="Up to two potentially billable Gemini calls via the local backend")
    parser.add_argument("--approve-billable", action="store_true", help="Explicit approval for live calls")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    if args.live and not args.approve_billable:
        parser.error("Live calls require explicit --approve-billable approval")
    try:
        if args.template:
            # Real .env stays untouched; override=False in config preserves this empty key.
            os.environ["GEMINI_API_KEY"] = ""
            os.environ["LLM_PROVIDER"] = "gemini"
            os.environ["WARM_UP"] = "0"
            from fastapi.testclient import TestClient
            from backend.app.main import app
            from backend.app import config

            require(not config.llm_settings().api_key, "Template process did not clear the effective key")
            with patch("google.genai.Client", side_effect=AssertionError("Gemini is blocked in template smoke tests")) as blocked:
                with TestClient(app) as client:
                    result = run(client, live=False)
                require(blocked.call_count == 0, "Template mode attempted to construct a Gemini client")
        else:
            parsed = urlsplit(args.base_url)
            require(parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}
                    and not parsed.username and not parsed.password and parsed.path in {"", "/"}
                    and not parsed.query and not parsed.fragment, "Use a plain localhost backend URL")
            from backend.app import config

            settings = config.llm_settings()
            require(bool(settings.api_key) and settings.provider == "gemini" and settings.valid,
                    "Gemini is not configured; no live chat request was sent")
            with httpx.Client(base_url=args.base_url, timeout=120, trust_env=False) as client:
                result = run(client, live=True)
        print(json.dumps(result, indent=2))
        return 0
    except SmokeFailure as error:
        report = {"status": "failed", "live_gemini_verified": False, "reason": str(error)}
        if error.diagnostics:
            report["diagnostics"] = error.diagnostics
        print(json.dumps(report))
    except Exception as error:
        # Do not expose response bodies, SDK exception messages or environment values.
        print(json.dumps({"status": "failed", "live_gemini_verified": False, "error_type": type(error).__name__}))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
