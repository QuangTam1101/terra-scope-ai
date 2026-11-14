# Live Detective repair record

Date: 2026-11-14. Branch: `feature/chat-foundation`. Existing dirty work is preserved.
This record supersedes the historical "live pending" and Template-only launcher notes in Phase 3/4 reports.

## Verified behavior and fixes

- Launcher supports `-Mode Gemini` (default) and `-Mode Template`. It inspects the running backend
  using read-only `/api/v1/llm/status`, checks process ownership before restarting a mismatched backend,
  and leaves the frontend and unrelated processes alone. Startup does not make billable requests.
  The child process selects the provider; existing absolute-path `.env` loading remains in use.
- Model remains `gemini-4-argon`; credentials and `.env` were not modified or printed.
- Live conceptual generation initially succeeded at Google but was rejected by
  `education_statistical_claim`: a blanket `no trend` match rejected an explanation of the null
  hypothesis. Grounding now distinguishes generic null-hypothesis language and negated cautions
  from claims about actual results. Numeric examples, contextual claims, catalog region claims,
  affirmative causal claims and secrets are still rejected. Data grounding remains controlled
  statement selection with no model-authored statistical numbers or verdicts.
- A live planner was observed calling `analyze_trend`, receiving a typed FunctionResponse and finishing
  on the next turn; separate composition returned `mode=llm`. Safe instrumentation recorded planner
  call names and timing (approximately 6.8 and 4.9 seconds), without raw SDK errors or credentials.
- An earlier agent run timed out after requesting both trend and monthly series. Planner instructions
  now request the tool matching the authoritative intent and stop after sufficient evidence. Argon
  planner and composition use supported low thinking: composition only selects reviewed sentences.
  A subsequent cached slope explanation also reached the original deadline before composition thinking
  was reduced. Timeouts remain enforced, with trustworthy evidence retained in Template Mode.
- Safe diagnostics now include `tool_executed` as a fixed category; timeout and unexpected agent errors
  are also recorded with allowlisted metadata. Inspect the backend PowerShell window for diagnostics.
  No prompt, key, raw URL, tool arguments or raw response is logged by these diagnostics.
- Current glossary terms take precedence over old user history. An earlier confidence-interval question
  can no longer override a new p-value question.
- Contextual p-value, significance, slope, OLS interval, autocorrelation adjustment and FDR explanations
  use compatible server-cached evidence. Gemini can select only the correct reviewed explanation;
  Template Mode renders the same explanation directly. Neither path substitutes OLS interval prose
  for a p-value answer. A p-value is never described as the probability that the null is true.
- "Which dataset was used?" resolves provenance. Context remains the same across plot/comparison
  follow-ups; no observations or history are fabricated.
- Detective shows the selected provider before the first answer, actual response mode afterward,
  backend tool status and deduplicated warnings. Redundant Template Mode warnings are hidden beneath
  the existing mode badge. Mascot, retry, clear chat and navigation are preserved.

## Validation

- Live conceptual `/chat` through the Vite proxy returned `mode=llm` and a valid p-value definition.
- Live agent function calling and controlled composition returned `mode=llm` with actual NASA evidence.
- Template seven-step smoke: all seven passed through `http://localhost:5173/api/v1/chat`.
- Final Gemini seven-step smoke: all seven passed, each returned `mode=llm`, through the Vite proxy.
  The script stops on the first failure and performs no automatic retries. Earlier timeout attempts
  are not counted as passes. Trend, series, comparison and provenance returned their actual tool outputs.
- Scientific reference checked against actual `/api/v1/trends`: slope `3.163604736328125`, raw p-value
  `0.11031644898805326`, `significant=false`, 288 valid months, GPM_3IMERGM, Mekong Delta, 2001-2024.
- Backend regression covers exact contextual topics in both modes, glossary/history precedence,
  educational grounding false positives, cached contradictory prose fallback, and secret-free status.
- Final backend regression: `180 passed`; `pip check` found no broken requirements.
- Frontend: seven navigation tests, typecheck and production build passed. Build retains a nonfatal
  approximately 502 kB bundle warning. No dependency additions or bundling changes were made.
- Browser UI interaction is **not verified**: browser inventory returned "browser access host is
  unavailable". HTTP/module checks and API flow are not represented as interactive browser testing.

## Commands

```powershell
Set-Location 'D:\Projects\terra-scope-ai'
& '.\scripts\start-local.ps1' -Mode Gemini
# Or explicitly select fallback mode:
& '.\scripts\start-local.ps1' -Mode Template
# Stop only launcher-owned servers:
& '.\scripts\start-local.ps1' -Stop
```

Frontend: `http://localhost:5173/#detective`. Backend: `http://127.0.0.1:8000/docs`.
Safe running configuration:

```powershell
Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/llm/status'
```

Explicitly billable, bounded seven-step smoke after starting Gemini Mode:

```powershell
.\.venv\Scripts\python.exe backend/scripts/smoke_detective.py --mode gemini --approve-billable
```

Offline/Template smoke after starting Template Mode:

```powershell
.\.venv\Scripts\python.exe backend/scripts/smoke_detective.py --mode template
```

## Files changed in this repair

Updated: `scripts/start-local.ps1`, `scripts/README.md`, `backend/app/main.py`,
`backend/app/conversation.py`, `backend/app/agent.py`, `backend/app/llm/runtime.py`,
`backend/app/llm/grounding.py`, `backend/app/llm/gemini_provider.py`,
`backend/app/llm/function_calling.py`, `backend/app/llm/diagnostics.py`,
`web/src/api.ts`, `web/src/pages/Detective.tsx`.

Added: `backend/scripts/smoke_detective.py`, `backend/tests/test_detective_repair.py`, this record.

No NASA cube, statistical algorithm, Vite config, NTFS ACL, real `.env`, dependency file or lockfile
was modified by this repair. No commit or push. Phase 5 was not started.

## Limits

Live latency, rate limits, quota and connectivity can still trigger fallback; no success guarantees
are implied for every future request. Conversation parsing remains bounded to supported catalog
aliases, cached evidence is process-local, and no persistent database or unrestricted geocoding exists.
Manual browser QA remains necessary for scrolling, responsive layout, keyboard interaction and visual
navigation. See `PHASE_4.md` for unchanged tool and agent safety limits.
