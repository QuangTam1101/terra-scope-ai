# Phase 3: Gemini chat integration

## Behavior and provider boundary

`POST /api/v1/chat` keeps the Phase 2 request and response fields. `mode` now accepts
`llm` or `template`; the only added warning code is `LLM_FALLBACK`. `/explain` is unchanged.

`app/chat.py` retains `template_response()` as the deterministic source of scientific evidence.
`app/llm/base.py` defines a small async provider protocol and validated reply/error types.
Only `GeminiProvider` is implemented, using the official `google-genai` SDK.
There are no LLM-directed tools, uploads, OpenAI integration or database.

- Conceptual questions and natural follow-ups use bounded conversation history.
- Data-specific questions obtain evidence through the existing trend/explanation services.
- Only allowlisted summary fields go to Gemini. No monthly series, grid arrays or cubes are sent.
- Returned evidence, actions and analysis ID remain backend-generated and unchanged.
- Explicit context is authoritative. Recognized requests to change place/dataset/time return a
  limitation; arbitrary natural-language context resolution is not implemented.

## Grounding policy

For data questions, Gemini selects relevant explanatory sentences from an evidence-dependent
allowlist. It must return an empty free-text answer and approved statement IDs. The backend
renders those sentences alongside the original statistical summary, dataset citation, method,
source type and uncertainty statement. Wrong significance choices, new numeric assertions,
unknown/duplicate statement IDs or additional response fields cause deterministic fallback.
This intentionally constrains data-specific prose rather than trying to prove arbitrary model
paragraphs scientifically correct with regular expressions.

General educational prose is permitted, but conservatively validated: no numbers, measurements,
dataset-specific decisions or causal/forecast assertions. Some valid educational replies may
therefore fall back to the glossary. This check does not prove every conceptual statement correct;
the UI keeps an AI disclaimer. Statistical values never come from educational prose or history.

## Local environment

`app/config.py` loads `backend/.env` by absolute repository path, regardless of the working
directory. Existing process environment variables take precedence. Restart the backend after
editing `.env`; Python source reload does not guarantee environment reload.
Real `backend/.env` is already Git-ignored. Never put the key in frontend variables or Git.

```dotenv
LLM_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-4-argon
LLM_TIMEOUT_SECONDS=30
LLM_MAX_OUTPUT_TOKENS=1024
LLM_REQUESTS_PER_MINUTE=10
```

The code default when `GEMINI_MODEL` is absent is `gemini-4-argon` (the selected default).
The example now matches that default; `gemini-3.8-flash` is another configurable option.
Google lists `gemini-2.5-flash` as deprecated, with access limited to existing users before
December 1, 2026 and automatic routing after that date. See the
[official model notice](https://aistudio.google.com/docs/models/gemini-2.5-flash).
No automatic model switching occurs. Model access depends on the Google project; unavailable
models safely fall back. A nonempty key does not prove validity or authorize billable calls;
live verification requires a successful API response and explicit user approval.

## Phase 3.5 smoke tests

The reusable smoke script compares the actual NASA result with the regression reference,
checks exact chat evidence against `/trends`, and rejects unapproved scientific prose.
It does not change the statistical engine or data. Reference: GPM IMERG V07, Mekong Delta,
2001–2024; slope `3.1636047363`, p-value `0.110316449`, `significant: false`.

Offline Template Mode uses an isolated process with an empty key and a blocked Gemini
client constructor; the existing `.env` and running server are not modified:

```powershell
Set-Location D:\Projects\terra-scope-ai
.\.venv\Scripts\python.exe backend\scripts\smoke_gemini.py --template
```

After adding a key locally, restart the backend so its environment is refreshed. The following
is an explicitly billable smoke test: at most one conceptual request and one NASA request,
without automatic retries. The user must approve these calls before an agent runs it.
Running the command yourself with `--approve-billable` explicitly opts into those calls:

```powershell
.\.venv\Scripts\python.exe backend\scripts\smoke_gemini.py --live --approve-billable --base-url http://127.0.0.1:8000
```

The script requires `mode: llm` for both live answers; a template fallback is reported as
not verified. Even with live success, conceptual accuracy needs human review. The scientific
check requires unchanged evidence, the nonsignificant decision and only backend-approved
explanation sentences. It also checks the Vite proxy without sending another chat request:

```powershell
Invoke-RestMethod -Uri 'http://localhost:5173/api/v1/health'
```

## Windows PowerShell setup and startup

Terminal 1, repository root:

```powershell
Set-Location D:\Projects\terra-scope-ai
.\.venv\Scripts\Activate.ps1
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if (-not (Test-Path -LiteralPath backend\.env)) {
    Copy-Item -LiteralPath backend\.env.example -Destination backend\.env
}
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --reload-dir backend/app --host 127.0.0.1 --port 8000
```

If PowerShell blocks `Activate.ps1`, activation is optional: the explicit `.venv` executable
commands above work without changing execution policy.
The reload directory is limited to backend source so installing packages into `.venv`
does not trigger a reload storm. A full backend restart is still required after editing `.env`.

Terminal 2:

```powershell
Set-Location D:\Projects\terra-scope-ai\web
npm run dev -- --host localhost --port 5173 --strictPort
```

URLs:

- Health: http://127.0.0.1:8000/api/v1/health
- Swagger: http://127.0.0.1:8000/docs
- Frontend: http://localhost:5173/

## Template Mode without a key

Leave `GEMINI_API_KEY` empty in `.env`, then start the backend and run:

```powershell
$body = @{
    message = 'What is the rainfall trend in the Mekong Delta?'
    context = @{
        variable_id = 'imerg_precip'
        dataset_id = 'GPM_3IMERGM'
        region = @{ type = 'preset'; id = 'mekong_delta' }
        start = '2001-01'
        end = '2024-12'
    }
    history = @()
} | ConvertTo-Json -Depth 8

$reply = Invoke-RestMethod -Method Post `
    -Uri 'http://127.0.0.1:8000/api/v1/chat' `
    -ContentType 'application/json; charset=utf-8' -Body $body
$reply | Select-Object mode, answer, analysis_id, warnings
$reply.evidence[0].trend | Select-Object slope_per_decade, p_value, significant, source
```

Expect `mode: template`, real NASA evidence and a non-secret configuration warning.
To force Template Mode with a key already installed, set `LLM_PROVIDER=template` locally and
restart the backend. This intentionally disables the model and returns a fallback warning.

## Install a key locally and verify Gemini

Create a key in [Google AI Studio](https://aistudio.google.com/api-keys), then open
`backend/.env` in your editor and enter it after `GEMINI_API_KEY=`. Do not paste it into
chat, print it in a terminal, or add it to Git. Set `LLM_PROVIDER=gemini` and select a model
available to your Google project. Restart the backend in Terminal 1.

Run the NASA request above again. `mode: llm` means the SDK succeeded and the grounding
checks passed; `template` plus `LLM_FALLBACK` means it did not. Inspect the safe warning,
not a key dump or raw SDK exception. No startup call is made to Gemini.

Conceptual question and follow-up (also usable without a key to test fallback):

```powershell
$question = 'What is a p-value?'
$first = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/api/v1/chat' `
    -ContentType 'application/json' -Body (@{ message = $question; history = @() } | ConvertTo-Json)
$followUp = @{
    message = 'Why does it matter for trend detection?'
    history = @(
        @{ role = 'user'; content = $question }
        @{ role = 'assistant'; content = $first.answer }
    )
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/api/v1/chat' `
    -ContentType 'application/json' -Body $followUp
```

Change the NASA request URI to `http://localhost:5173/api/v1/chat` to verify Vite proxying.
In Detective, check the per-response mode label, evidence, history across navigation, retry
and clear chat. Browser interaction must be reported separately from HTTP verification.

Stop each server with **Ctrl+C** in its terminal. Run `deactivate` if the virtual environment
was activated. Do not kill unrelated Python/Node processes.

## Error handling and limits

### Diagnose a live fallback without exposing credentials

Confirmed local reproduction on November 14, 2026: project-authenticated model GET/list returned
HTTP 200 for `gemini-4-argon`. Two approved conceptual reproductions reached the SDK and Google
returned HTTP 400; the detailed category was `invalid_request.request_schema`. Grounding did not
run. The provider previously sent Pydantic JSON Schema through `response_schema` (the Schema/OpenAPI
field). It now uses `response_json_schema=ProviderReply.model_json_schema()`. Pydantic parsing and
all grounding constraints are unchanged. An actual SDK serialization test with a mocked HTTP
transport verifies `responseJsonSchema` on the wire and rejects use of `responseSchema`.
This is a schema compatibility fix, not an API-key change. Successful live generation after
the fix still requires a newly approved verification; do not treat passing mocked tests as live success.

The old smoke failure reported only the mode mismatch and discarded the reason. It cannot
prove whether a previous request reached Google or failed grounding. Updated smoke failures
include a safe `error_category` and `request_id`. The API returns `X-Request-ID` without adding
internal details or stack traces to its JSON contract.

First check the configured project's metadata (GET only; no generation):

```powershell
Set-Location D:\Projects\terra-scope-ai
.\.venv\Scripts\python.exe backend\scripts\diagnose_gemini_models.py
```

HTTP 200 here proves metadata access and lists visible models. It does not prove generation
quota, generation permission or a successful chat response. This command never changes the
configured model. A generic Google HTTP 400 is categorized as `invalid_request`, not `auth`;
only explicit authentication reasons or authentication status codes select `auth`.

Restart FastAPI to load the latest source and `.env`. In its own PowerShell terminal:

```powershell
Set-Location D:\Projects\terra-scope-ai
$diagnosticLog = Join-Path $env:TEMP 'terra-scope-gemini-diagnostics.log'
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --reload-dir backend/app --host 127.0.0.1 --port 8000 --log-level info --no-access-log 2>&1 | Tee-Object -FilePath $diagnosticLog
```

In another terminal, view only the structured diagnostics:

```powershell
Get-Content (Join-Path $env:TEMP 'terra-scope-gemini-diagnostics.log') -Wait -Tail 50 | Select-String '"request_id"'
```

Each diagnostic contains only `request_id`, `provider`, `model`, `error_category`, `http_status`,
`fallback`, `grounding_rejection`. No prompt, answer, headers, key, URL or raw SDK exception is
logged. `sdk_call_started` means generation was invoked. An HTTP error records Google's status;
network/deadline failures have no HTTP status. Grounding rejection after a successful SDK result
records HTTP 200 and the exact rule category, such as `education_numeric` or
`education_causal_or_forecast_claim`. Those rules have not been relaxed merely to force LLM mode.

After explicit approval for potentially billable calls, reproduce one conceptual request:

```powershell
$conceptResponse = Invoke-WebRequest -UseBasicParsing -Method Post `
    -Uri 'http://127.0.0.1:8000/api/v1/chat' -ContentType 'application/json' `
    -Body '{"message":"What is a p-value?","history":[]}'
$conceptResponse.Headers['X-Request-ID']
$conceptResponse.Content | ConvertFrom-Json | Select-Object mode, warnings
```

For the NASA-specific request use the complete body in the Template Mode section, with the
backend configured for Gemini. Compare `evidence[0].trend` against a deterministic request:

```powershell
$trendBody = @{
    variable_id = 'imerg_precip'
    region = @{ type = 'preset'; id = 'mekong_delta' }
    start = '2001-01'
    end = '2024-12'
} | ConvertTo-Json -Depth 5
$verified = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/api/v1/trends' `
    -ContentType 'application/json' -Body $trendBody
$verified | Select-Object slope_per_decade, p_value, significant
```

`/trends` and `/explain` do not call Gemini. `/chat` may be billable. Use either the two-request
smoke command or individual conceptual/NASA requests; running both methods sends additional
requests. A request rejected by grounding is not evidence of an invalid key. Use its matching
safe diagnostic before deciding what to fix. Previous failures cannot be retroactively diagnosed
if no response warnings or diagnostic record was retained.

- One Gemini generation per eligible request, no SDK retries, wall-clock timeout plus SDK
  transport timeout. Default: thirty seconds. Configuration range: one to sixty seconds.
- Message: at most two thousand characters; incoming history: at most twenty-four turns.
- Provider history: at most eight recent turns, eight thousand characters in total.
- Serialized provider input: at most twenty-four thousand characters; output default: one
  thousand twenty-four tokens, capped at two thousand forty-eight by configuration.
- Per process: two concurrent calls, rolling ten calls per minute by default. No wait queue.
- Authentication/model/service/rate-limit failures trigger a sixty-second cooldown.
- No key, invalid settings, SDK failures, timeouts, safety blocks, truncation, invalid JSON
  and grounding failures all retain Template Mode. Provider exceptions and secrets are not
  serialized or logged by application code.
- These are local/demo limits, not distributed per-user quotas. Multiple workers have separate
  budgets. There is no persistent memory, streaming or LLM-directed tool calling.

## Tests and review

```powershell
Set-Location D:\Projects\terra-scope-ai
.\.venv\Scripts\python.exe -m pytest -q backend/tests
.\.venv\Scripts\python.exe -m pip check
Set-Location web
npm run typecheck
npm run build
Set-Location ..
git status --short
git diff --stat
git diff --check
git diff
git diff --cached
git ls-files --others --exclude-standard
git check-ignore backend/.env
```

Tests clear developer keys, block live SDK client creation by default and use mocked SDK
responses. No live Gemini call is needed. New/untracked files must also be reviewed in the editor.

Official references consulted:
[Google GenAI SDK](https://googleapis.github.io/python-genai/),
[structured output](https://aistudio.google.com/docs/structured-output),
[models](https://aistudio.google.com/docs/models),
[troubleshooting](https://aistudio.google.com/docs/troubleshooting).
