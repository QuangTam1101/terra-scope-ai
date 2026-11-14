# Terra-scope AI: how to test everything

One command runs every layer (from the `terra-scope-ai` folder, servers started first with `scripts/start-local.ps1`):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-all.ps1            # all layers, no billable model calls
powershell -ExecutionPolicy Bypass -File .\scripts\test-all.ps1 -Gemini    # also real Gemini checks (server in -Mode Gemini, costs a few requests)
powershell -ExecutionPolicy Bypass -File .\scripts\test-all.ps1 -SkipLive  # offline only: unit tests, typecheck, build
```

| Layer | Command | Data | What it covers |
| --- | --- | --- | --- |
| Backend unit | `pytest -q backend/tests` | fake cubes | API contract, statistics wiring, grid cache, discovery rules, chat routing, Gemini agent with a mocked model, grounding, retries, rate limits |
| Frontend unit | `npm run test` (in `web`) | offline | pages render, routing, tutorial, demo config, loading messages, report model and exports, cases, helpers |
| Typecheck and build | `npm run typecheck`, `npm run build` | | TypeScript and production bundle |
| Live API end to end | `pytest -q backend/tests_e2e` | real 0.5° NASA data on the running server | every endpoint, Mekong reference values, significance rule, maps and FDR, cache (ETag/304), comparison rule, discovery (regions and datasets, limits), explain; with `TERRA_E2E_GEMINI=1`: grounded trend answer, two-region comparison, prompt injection, follow-up wording |
| Browser end to end | `npm run e2e` (in `web`) | real app in headless Chrome | landing, tutorial, Explore (progress steps, numbers equal the API, Giovanni link, map messages), Explore further, Hunt (discover, inspect, add to report, dataset agreement), Detective, Report (pages, PDF, save, reload, reopen), 375 px layout, no JavaScript errors |

Notes
- Live tests skip themselves when the server is not running. Gemini checks run only with `-Gemini` / `TERRA_E2E_GEMINI=1` and are capped (at most 9 requests in the API suite, 1 or 2 in the browser suite).
- A transient Gemini outage (provider error, network, deadline, or the app's 60 s pause after one) is retried once after the pause, as a user would. Verification (grounding) and logic failures are never retried by the tests.
- The browser suite drives the installed Chrome or Edge through the DevTools protocol (`web/e2e/cdp.mjs`), no extra npm package. Set `CHROME_PATH` if Chrome is elsewhere. Output (PDF, phone screenshot, logs) goes to `web/e2e/out/` (git-ignored).
- Reference values in `backend/tests_e2e` are for the 0.5° grid (see `backend/PHASE_7.md`). The historical 1° reference is checked by the unit suite and by `GRID_V2=0`.

Results on 2026-11-14 (Gemini mode, real data): backend unit 243 passed; frontend unit 32 passed; typecheck and build pass; live API 18 passed; browser 10 passed.

Bugs found by these tests and fixed
1. Detective refused regions the rest of the app accepts (Sahel box: 1504 cells on the 0.5° grid > old 1000-cell cap); the cap now follows the 1000 deg² area limit (`app/tools.py`).
2. A two-region question containing the word "trends" was routed to a single-region trend, so only region A was explained; a selection with two regions now stays a comparison and the backend runs the comparison itself, the model only explains it (`app/conversation.py`).
3. Gemini drafts occasionally failed the grounding check and fell back to Template Mode; one more draft of the same verified evidence is now requested (no tool rerun) before falling back (`app/agent.py`).
4. The pause after a Gemini service error was reported as "The AI request limit was reached"; the fallback now names the real reason (pause, busy, or limit) (`app/llm/runtime.py`).
