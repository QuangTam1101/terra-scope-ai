# Phase 4 implementation and validation

Validation date: 2026-11-14. Branch: `feature/chat-foundation`.
All work is uncommitted. Existing Phase 3, localhost launcher and Vite/NTFS repairs were preserved.
No NASA cube, pipeline algorithm, statistical service or significance rule was changed.

## Milestones

| Milestone | Checkpoint | Implementation |
| --- | --- | --- |
| 4A | 142 backend tests passed; frontend typecheck/build passed | Six typed tools directly invoking existing services |
| 4B | 156 backend tests passed; frontend typecheck/build passed | Real Gemini function-call protocol, mocked SDK transport and bounded orchestration |
| 4C and final regression | 174 backend tests and 7 frontend navigation tests passed; typecheck/build passed | Deterministic context, evidence cards, navigation and additional limits regressions |

These checkpoints were completed sequentially. Backend unit tests use synthetic NetCDF fixtures
and forbid live Gemini client creation unless a test explicitly replaces the SDK transport with a mock.
NASA regression was verified separately against the actual local cubes and running backend.

## Architecture

`POST /api/v1/chat` accepts the existing message/context/history plus optional `use_tools` (default
`false`). Existing callers and `/api/v1/explain` remain compatible. Detective opts into `use_tools: true`.

1. `conversation.prepare` resolves supported catalog aliases, explicit dataset/region/date changes,
   and missing selections deterministically. It validates coverage and spatial budgets before work.
2. Template Mode executes the selected operation directly through `tools.registry`.
3. With configured Gemini, `agent.run` supplies only six function declarations to the planner.
   `GeminiFunctionSession` uses `models.generate_content`, with automatic function execution disabled.
4. Every proposed name/argument passes the backend allowlist, strict Pydantic schema, context binding
   and resource validation before execution. No command, Python, SQL, file or URL execution path exists.
5. Original model `Content`, function-call IDs and thought signatures are retained. Typed
   `FunctionResponse` parts return results to the planner. Partial calls and executable parts are rejected.
6. A separate Gemini composition request uses `response_json_schema` without tools. For data answers
   it may select approved explanation IDs only. All result prose, numbers, source and verdict are
   rendered by the backend from typed tool outputs. Free-form statistical prose triggers fallback.
7. Verified results survive subsequent provider/composition/grounding failures. Empty or rejected
   execution returns a limitation, never manufactured evidence.

Official references consulted:
[Gemini 4 Argon capabilities](https://aistudio.google.com/docs/models/gemini-4-argon),
[function calling](https://aistudio.google.com/docs/function-calling), and
[Google Gen AI Python SDK](https://googleapis.github.io/python-genai/).
The model page lists function calling and structured outputs as supported. Documentation and offline
serialization do not prove successful generation or access for the current project. No model was changed.

## Registry and evidence

| Tool | Existing implementation | Typed data |
| --- | --- | --- |
| `list_available_variables` | `service.variables` | `VariablesResponse` with actual cube availability/coverage |
| `list_available_regions` | `service.regions` | `RegionCatalog`, presets and supported selection types |
| `get_time_series` | `service.series` | `SeriesResponse`, real monthly points, quality and source |
| `analyze_trend` | `service.trends` | Original `TrendResponse` |
| `compare_regions` | `service.compare`, existing `POST /api/v1/compare` | Original `CompareResponse`, both regional trends and difference test |
| `get_dataset_provenance` | Catalog and `service.variables` | `Provenance`, documented processing notes, units and resolution |

`registry.list_tools()` exposes input and output schemas. `registry.execute(name, arguments)` returns
`ToolResult`: `tool`, `ok`, typed `data`, structured `warnings`, `provenance`, and optional typed `error`.
Categories cover invalid input, unknown tool/region, unsupported dataset, no observations, unavailable
data/service, failed computation and resource limits. Internal exception text is not returned.

The chat response retains `answer`, `mode`, `evidence`, `warnings`, `actions`, `analysis_id` and
`disclaimer`. Additive fields are `tool_results`, `resolved_context`, `clarification` and
`suggested_questions`. Each evidence card retains the original backend trend and cited-number mapping.
Raw seasonal p-values, autocorrelation-adjusted p-values and the reported raw-test decision remain
separate. OLS anomaly intervals are explicitly attributed; they are not described as Sen intervals.
Comparison prose distinguishes regional descriptions from the existing between-region difference test.

## Limits

| Limit | Default / cap |
| --- | --- |
| Tool temporal selection | 288 months, ordered valid YYYY-MM dates |
| Tool spatial selection | Preset or bbox; at most 1000 grid cells and 1000 square degrees |
| Tool arguments / result | 4096 / 65536 bytes |
| `AGENT_MAX_TOOL_CALLS` | 4 / 6 |
| `AGENT_MAX_STEPS` | 3 / 4 |
| `AGENT_TIMEOUT_SECONDS` | 40 / 40 seconds for planning, tools and composition together |
| `AGENT_MAX_EVIDENCE_BYTES` | 96000 / 128000; minimum 4096 |
| History sent to Gemini | Last 8 messages, 2000 characters each, 8000 characters total |
| Message / accepted history | 2000 characters / 24 messages |
| `LLM_MAX_OUTPUT_TOKENS` | 1024 by default; existing configuration caps at 2048 per SDK call |
| Provider call timeout | Existing `LLM_TIMEOUT_SECONDS=30` by default |
| Chat AI budget | Existing 10 requests/minute default, two in flight, no retry queue |
| Computational concurrency | One statistical tool at a time, one bounded agent worker |

A user request can produce up to `AGENT_MAX_STEPS` planner SDK calls plus one composition call.
The request budget counts chat requests, not individual SDK calls. Repeated identical tools stop the
agent. Transport retries are disabled. Full series remain in API evidence; only first/last three
observations are sent to Gemini. No NetCDF files or global arrays are uploaded.

Timeout cancels the waiting agent, not native numerical work already running in its worker thread.
Such work remains bounded by selection limits and occupies the single worker until completion; a new
job cannot accumulate behind it. These per-process limits are intended for localhost, not a distributed
production quota or hard OS-level CPU interruption.

## Conversation and frontend

`resolved_context` adds optional `region_b`, `intent` and `parameter`. Backend context transitions
do not parse assistant history as evidence. A compatible server-side `trend_id` can answer a p-value
follow-up without recomputing. Changing a region, dataset, variable or period invalidates the cached
reference. Temperature dataset ambiguity requires an explicit compatible choice (MERRA-2 or GLDAS).
Unsupported regions/variables, absent cubes and missing observations remain visible errors or limitations.

Detective preserves the mascot, session history, retry, clear chat and mode badges. It adds monthly
series, comparison, catalog/provenance cards, clarification, suggestions, accessible loading/error states
and exact-context actions. React renders all model text as text, not HTML.

Explore/Report currently accept whole years; month-specific evidence cannot navigate by rounding.
Hunt receives both preset IDs, preserving its existing comparison behavior. Bbox comparisons stay in
Detective because Hunt's controls currently support presets only. Failed analysis does not navigate to
an unrelated old Report. No Home/Explore/Report redesign was performed.

## Final verification

- Backend: `174 passed`, no failures. Existing chat/explain compatibility, all six tools, provider
  failures, timeout, invalid arguments, sequential tools, preserved evidence, context injection,
  grounding failures, call/step/evidence limits and conversation transitions are covered offline.
- `python -m pip check`: no broken requirements. No Phase 4 dependency installation or lockfile change.
- Frontend: `7 passed`, typecheck passed, production build passed under the normal Windows MSI user.
  Build emits a nonfatal warning for a 501 kB JavaScript chunk; bundling configuration was preserved.
- Launcher reused healthy managed servers with Template Mode enforced. HTTP 200: backend health/docs,
  frontend, main/Detective/ToolDetails development modules and proxied health.
- `POST /api/v1/chat` through Vite: conceptual answer, natural NASA trend, cached p-value follow-up,
  changed period, 288-point series, provenance and Mekong/Hanoi comparison succeeded in Template Mode.
- `/api/v1/explain` still returns `template-v1 (no language model)`.
- Actual Mekong IMERG analysis for 2001-01 through 2024-12 matched `/api/v1/trends` exactly:
  slope `3.163604736328125`, raw p-value `0.11031644898805326`, `significant=false`, 288 valid months.
  These are a recorded regression result, not hardcoded runtime evidence. The response explicitly
  says the estimated positive trend is not statistically significant.
- Interactive browser testing remains pending: browser host unavailable, then Windows Computer Use
  stopped because it could not confidently determine Chrome's current URL. No UI pass is claimed.
- Live Gemini generation and live function calling remain **not verified**. No billable requests
  were made. The launcher intentionally disables Gemini in its backend process.

## Windows localhost commands

From PowerShell:

```powershell
Set-Location 'D:\Projects\terra-scope-ai'
& '.\scripts\start-local.ps1'

# Frontend: http://localhost:5173/#detective
# Backend docs: http://127.0.0.1:8000/docs
$body = @{
    message = 'Analyze precipitation in the Mekong Delta from 2001 to 2024.'
    use_tools = $true
    context = @{}
    history = @()
} | ConvertTo-Json -Depth 10
$result = Invoke-RestMethod -Method Post -Uri 'http://localhost:5173/api/v1/chat' `
    -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 50
$result | Select-Object mode, answer, analysis_id
$result.evidence[0].trend | Select-Object slope_per_decade, p_value, significant

$followup = @{
    message = 'What does that p-value mean?'
    use_tools = $true
    context = $result.resolved_context
    history = @()
} | ConvertTo-Json -Depth 10
Invoke-RestMethod -Method Post -Uri 'http://localhost:5173/api/v1/chat' `
    -ContentType 'application/json; charset=utf-8' -Body $followup -TimeoutSec 50

# Stop only servers owned by the launcher.
& '.\scripts\start-local.ps1' -Stop
```

Offline checks:

```powershell
Set-Location 'D:\Projects\terra-scope-ai'
.\.venv\Scripts\python.exe -m pytest -q backend/tests
.\.venv\Scripts\python.exe -m pip check
Set-Location '.\web'
npm test
npm run typecheck
npm run build
```

Keep `backend/.env` private. It is automatically loaded with process environment taking precedence.
`backend/.env.example` contains placeholders and optional limits only. The current configured model
remains `gemini-4-argon`; the running launcher's provider is `template`.
Do not run a billable test merely to close this report. A separately approved live test should first
verify one bounded tool call and compare every returned NASA value with the deterministic endpoint.
Existing `smoke_gemini.py` checks Phase 3 generation; it does not certify Phase 4 function calling.

## Phase 4 file review

Added:

- `backend/app/tools.py`, `backend/app/agent.py`, `backend/app/conversation.py`
- `backend/app/llm/function_calling.py`
- `backend/tests/test_tools.py`, `backend/tests/test_agent.py`, `backend/tests/test_conversation.py`
- `web/src/ToolDetails.tsx`, `web/src/chatNavigation.ts`, `web/tests/chatNavigation.test.mjs`
- `backend/PHASE_4.md`

Updated during Phase 4:

- `backend/app/chat.py`, `backend/app/schemas.py`
- `backend/app/llm/base.py`, `backend/app/llm/diagnostics.py`, `backend/app/llm/runtime.py`
- `backend/.env.example`, `backend/README.md`
- `web/src/api.ts`, `web/src/store.tsx`, `web/src/pages/Detective.tsx`, `web/src/pages/Hunt.tsx`
- `web/package.json`, `web/README.md`

Several files above were already uncommitted before Phase 4; changes were extended rather than
replaced. Other dirty files (including Phase 3 config/provider/tests, requirements, Vite config and
launcher) predate this task. NASA data, `service.py`, pipeline algorithms, Vite config and launcher
were not edited by Phase 4. Real `.env`, node_modules, cache, dist and launcher state remain ignored.

Safe review commands (do not reset or automatically stage the existing mixed work):

```powershell
git status --short
git branch --show-current
git diff --stat
git diff --check
git diff -- backend/app/chat.py backend/app/schemas.py web/src
git ls-files --others --exclude-standard
# Ordinary git diff omits untracked files. Review new files individually in VS Code.
# Do not print or stage backend/.env.
```

## Remaining scope

Natural-language resolution is deliberately limited to catalog aliases and explicit year/month
patterns, with selected Vietnamese aliases. This is not unrestricted geocoding or semantic search.
Data explanations are controlled generation rather than free-form numerical narrative. Context/history
and evidence references are in memory and expire with reload/restart; no persistent database was added.
Global analyses are excluded from conversational tools even though existing non-chat map APIs support
them. A future phase may extend capabilities after approved live verification and interactive UI QA.
Phase 5 was not started.
