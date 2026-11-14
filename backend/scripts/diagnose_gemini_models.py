"""Read-only Gemini model metadata; never calls generate_content or prints credentials."""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from google import genai
from google.genai import errors, types
from backend.app import config


def main():
    settings = config.llm_settings()
    safe_model = settings.model if re.fullmatch(r"gemini-[\w.-]{1,80}", settings.model) else "invalid"
    result = {"provider": "gemini", "model": safe_model, "generation_requests": 0}
    if not settings.api_key or not settings.valid or safe_model == "invalid":
        print(json.dumps({**result, "error_category": "missing_or_invalid_configuration"}))
        return 1
    try:
        options = types.HttpOptions(timeout=15000, retry_options=types.HttpRetryOptions(attempts=1))
        with genai.Client(api_key=settings.api_key, enterprise=False, vertexai=False, http_options=options) as client:
            try:
                selected = client.models.get(model=settings.model)
                result["configured_model_http_status"] = 200
                result["configured_model_supports_generation"] = "generateContent" in (selected.supported_actions or [])
            except errors.APIError as error:
                result["configured_model_http_status"] = error.code
                result["configured_model_supports_generation"] = False
            # One page only: bounded read-only metadata, no automatic pagination.
            models = client.models.list(config=types.ListModelsConfig(page_size=100))
            visible = [m.name.removeprefix("models/") for m in models.page
                       if m.name and re.fullmatch(r"(?:models/)?gemini-[\w.-]{1,80}", m.name)
                       and "generateContent" in (m.supported_actions or [])]
            result["model_list_http_status"] = 200
            result["visible_generation_models"] = visible
    except errors.APIError as error:
        result.update(error_category="google_http_error", http_status=error.code)
    except Exception as error:
        category = "timeout" if "timeout" in type(error).__name__.lower() else "network_or_client_error"
        result.update(error_category=category)
    print(json.dumps(result, indent=2))
    return 0 if result.get("model_list_http_status") == 200 else 1


if __name__ == "__main__":
    raise SystemExit(main())
