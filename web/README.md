# Terra-scope AI · web (v4 Cute, reference build)

React 19 + TypeScript + Vite frontend wired to the FastAPI backend in `../backend`, following
`FRONTEND_BACKEND_CONTRACT.md` v0.2.1 and the v4 Cute design (`handoff_v4_cute`).
Written with AI assistance (Claude Code). It is a working reference for the `UI` branch, not a replacement for it.

## Run

```bash
# terminal 1: backend (conda env spaceapps)
cd backend
uvicorn app.main:app --port 8000
```
```bash
# terminal 2: frontend
cd web
npm install
npm run dev
```
Open http://localhost:5173. In dev, `/api` is proxied to `http://127.0.0.1:8000` (see `vite.config.ts`).
For a deployed backend set `VITE_API_BASE_URL` (e.g. in `.env.local`).

The backend precomputes the global trend maps at start-up (about 15 s per variable), so the first map can take a little while.

## What is here

| File | Purpose |
|---|---|
| `src/api.ts` | Typed client for every endpoint, error codes → friendly text, no mock fallbacks (rule R13) |
| `src/store.tsx` | Shared state: variables, regions, current selection (variable → dataset → years → place), last run, run history, session chat exchanges |
| `src/WorldMap.tsx` | Canvas world map (equirectangular, `world-atlas` land outline bundled locally): Values heatmap and Trend divergence map, hover readout, click to pick a 1° cell |
| `src/TrendChart.tsx` | Monthly series, Theil–Sen line (dashed when not significant), shaded 95% CI band |
| `src/pages/Home.tsx` | Mascot welcome, topic tiles, featured cases |
| `src/pages/Explore.tsx` | 4-step set-up, map with Values / Trend switch and month filter, result card |
| `src/pages/Hunt.tsx` | Two-place comparison via `POST /compare` (automatic search: coming soon) |
| `src/pages/Detective.tsx` | Chat via `POST /chat`: optional backend Gemini or Template Mode, selected context, session history, retry, evidence/source/method cards, typed actions and warnings. `/explain` remains available. No browser-side Gemini client or key. |
| `src/pages/Report.tsx` | Session results table, method, NASA datasets, limitations, Markdown export, print to PDF |

Rules kept: numbers in Nunito tabular figures (no monospace), no em dash anywhere, increasing = orange,
decreasing = blue, no data = grey, slopes always per decade, every `warnings[]` shown.

## Phase 4 Detective

Phase 6 defers analysis pages with lazy loading, synchronizes browser hash navigation, and adds
five-page offline SSR/API tests. See [QA coverage and pending manual Chrome checks](../backend/PHASE_6_QA.md).
Browser interaction/export are not certified by SSR or HTTP checks.

Phase 5 adds an expandable scientific methods/limitations panel, explicit applied vs recommended
methods, OLS/Sen interval labels, and removes the invalid OLS-as-Sen confidence band. See
[the Phase 5 record](../backend/PHASE_5.md). The statistical engine and original numeric evidence are unchanged.

Detective sends `use_tools: true` and retains backend-resolved context independently of the annual
page selection. Trend, monthly-series, comparison, provenance and catalog cards display backend
evidence. History is session-only and never supplies statistical results. Ambiguous datasets require
clarification. Retry and clear chat are preserved.

Explore/Report navigation waits for the exact analysis to succeed. Hunt receives both catalog
presets. Month-specific periods and unsupported Hunt bounding boxes stay in Detective with a clear
limitation; navigation never silently rounds or substitutes a region.

Run `npm test`, `npm run typecheck`, and `npm run build` from `web`. Navigation tests use Node's
built-in test runner and the installed TypeScript compiler CLI; no additional packages are needed.
See [the Phase 4 validation record](../backend/PHASE_4.md) for localhost commands and pending live/UI checks.
