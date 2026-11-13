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
| `src/pages/Detective.tsx` | Template chat via `POST /chat`: selected context, session history, retry, evidence/source/method cards, typed actions and warnings. No LLM connected. `/explain` remains available. |
| `src/pages/Report.tsx` | Session results table, method, NASA datasets, limitations, Markdown export, print to PDF |

Rules kept: numbers in Nunito tabular figures (no monospace), no em dash anywhere, increasing = orange,
decreasing = blue, no data = grey, slopes always per decade, every `warnings[]` shown.
