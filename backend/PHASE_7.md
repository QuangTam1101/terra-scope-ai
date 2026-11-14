# Phase 7: landing page, guided tutorial, big map and demo readiness

Date: 2026-11-14. Branch: `integration/phase7` (local, not pushed), created from `UI_Backend_Integration` (`8d5d610`)
with `feature/phase6-scientific-validation` merged in (`776901f`). Phase 7 work after the merge is **uncommitted**.

## Architecture and routes

The app keeps its hash router (`web/src/pageRouting.ts`); no router library was added.

| Hash | Page |
| --- | --- |
| none, `#`, `#/`, `#landing` | **Public landing page** (new, rendered without the app sidebar) |
| `#home`, `#explore`, `#hunt`, `#detective`, `#report` (also `#/explore` style) | Application pages (unchanged deep links) |
| any other hash | Application guide (Home); never an empty page, never a redirect loop |

Direct reloads keep the current page; browser back/forward follow `hashchange`. The app sidebar has
**Replay Tutorial** and **About Terra-scope** (back to the landing page); on phones (sidebar hidden) the same two actions
are on the Home page. `web/src/chrome.ts` exposes them to pages without circular imports.

## 7A. Landing page (`web/src/pages/Landing.tsx`)

Sections: sticky header (Features, NASA data, Demo, Get Started), hero ("Discover Earth's Changing Story.", Get Started,
Watch Demo, decorative globe labelled "Illustration, not data" plus the Terra mascot), six features (only implemented
ones), How it works (Select, Explore, Analyse, Explain) with an example question (no numbers), NASA data cards (GPM IMERG
satellite estimate, GLDAS Noah land model, MERRA-2 reanalysis; links to GES DISC), demo video, scientific transparency
(no forecasts, no causes, preliminary), team ("a student project ... not an official NASA product, NASA does not endorse
or operate it"; no names because the repository documentation does not list the team), footer attribution.
The landing page loads no map, grid or analysis data.

### Demo video: how to add the real one

Edit only `web/src/config/demo.ts`:

```ts
// local file in web/public/demo/
export const DEMO_VIDEO: DemoVideo = { kind: "file", title: "Terra-scope demo", src: "/demo/terra-scope-demo.mp4",
  poster: "/demo/poster.jpg", captions: "/demo/terra-scope-demo.en.vtt" };
// or YouTube (11-character id)
export const DEMO_VIDEO: DemoVideo = { kind: "youtube", title: "Terra-scope demo", id: "XXXXXXXXXXX" };
```

Until then the page shows "Product Demo: Coming Soon" in a 16:9 frame, with no player and no media URL. Only `.mp4`/`.webm`
paths starting with `/` or `https://` and well-formed YouTube ids are accepted (`hasPlayableVideo`, tested). Space Apps
rule: 30 seconds or shorter, English or English subtitles.

## 7B. Guided tutorial (`web/src/Tour.tsx`, `web/src/onboarding.ts`)

Twelve steps: Welcome; variable; dataset; map; place; time range; Run analysis; Hunt; Detective input; evidence panel;
Report; finish (Start Exploring / Replay Tutorial). Each highlighted target is an existing control marked with
`data-tour="..."`; a test checks every target exists on its page. If a target is missing at run time the step is shown
centred with a note instead of pointing at nothing.

Behaviour: starts automatically only when a first-time user presses Get Started on the landing page; never on refresh or
deep links; Skip and Finish both store `terra-scope:onboarding:v1 = "done"` (nothing else is stored); blocked storage
never throws (the tour may then show again next visit). The tour only navigates and highlights: it does not run an
analysis, call Gemini or change the selection (verified from the browser network log). Accessibility: role dialog with
aria-modal, labelled title/body, progressbar with value text, Escape closes, Left/Right arrows move, Tab is trapped in
the card, focus moves to the primary button and returns afterwards (to the main content if the opener is gone), a click
shield prevents accidental changes, no position animation (reduced motion also stops the card animation).

## 7C. Map experience

- Layout: set-up column (250 to 290 px, sticky, scrolls on its own) and the map takes the rest; result and chart sit
  under the map. Measured at 1440 × 900: map card **73%** of the workspace (canvas 797 px wide, previously about 380 px).
  Single column under 1100 px; 311 px wide map on a 375 px phone with no horizontal overflow.
- **Expand map**: the map card fills the window (canvas 1280 × 640 at 1440 × 900) with legend and controls; optional
  browser **Full screen**; **Exit expanded view** or Escape leaves it (Escape is captured before the map's own
  clear-selection shortcut). Selection, layer, view and legend are preserved. Flat map and 3D globe both work inside it.
- Legend: unchanged six classes plus a line under the map: "Map cells: 0.5° processed grid, each cell an area average of
  the NASA product (native resolution X°). Every cell is tested on its own; significance uses Benjamini-Hochberg FDR
  across all cells of this map."

### Native NASA resolution vs display resolution

| Product | Native resolution (NASA) | Processed grid served on this branch |
| --- | --- | --- |
| GPM IMERG V07 | 0.1° | 0.5° (area average) |
| GLDAS Noah 2.1 | 0.25° | 0.5° (area average) |
| MERRA-2 M2IMNXASM | 0.5° × 0.625° | 0.5° (regridded) |

On this branch the 0.5° cells are **real processed data** (Long's `preprocess/clean.py`, a 0.5° cell keeps a value only
if at least 50% of its area has valid source data), not a display subdivision. Each map cell is an independent test.
The 0.5° files are not in git; without them the backend falls back to the 1° cubes (the label then says 1°), and
`GRID_V2=0` forces the 1° data.

## Scientific integrity and an important finding

No statistical code, threshold, decision policy or NASA file was changed. Mekong Delta IMERG reference:

| Data | Period | Sen slope (mm/month/decade) | Raw p | Verdict |
| --- | --- | --- | --- | --- |
| 1° cubes (`GRID_V2=0`), reference | 2001-01..2024-12 | 3.163604736328125 | 0.11031644898805326 | not significant (reproduced exactly) |
| 0.5° grid (default on this branch) | 2001-01..2024-12 | 3.4289956416012144 | 0.07695691823494677 | not significant |
| 0.5° grid | 2001-01..2025-12 (new default period) | 4.229186375793963 | 0.04084805489842469 | **significant** |

The change comes only from the input data (finer grid, plus 2025). Per the Phase 6B benchmark the raw Seasonal MK
over-rejects under serial dependence, so a p of 0.041 is fragile. **Đăng must review before this is presented.**
`backend/scripts/smoke_science.py` and `smoke_detective.py` assert the 1° reference; run them with `GRID_V2=0`.

## Tests

- Backend `pytest -q backend/tests`: **224 passed**; `pip check`: no broken requirements.
- Frontend `npm run test`: **25 passed** (16 existing + 9 new in `web/tests/phase7.test.mjs`: demo configuration,
  onboarding storage including blocked storage, step definitions, every tour target exists, no forecast wording,
  routing, landing page content, closed tour renders nothing). `npm run typecheck` and `npm run build` pass.
- Real browser (app browser pane, 1440 × 900 and 375 × 812): landing render; Watch Demo scroll; Get Started opens
  Explore and starts the tour for a first-time user; all 12 steps highlight the right element with 0 px offset and the
  card inside the viewport on desktop and phone; Next/Back/Skip/Escape/Finish/Replay; refresh does not restart it;
  completion stored; Expand map/Escape; no horizontal overflow on 6 pages at 375 px; tour makes no chat/trend requests.
- Live Gemini after the merge (1 request): `mode=llm`, `analyze_trend` ok, evidence equals `/trends`.
- Not verified: browser Full screen API (needs a real user gesture outside the test pane), screen reader, touch gestures
  on a physical device, Export Markdown / Print downloads.

## Known limitations

- Detective answers still show raw method identifiers ("Method: seasonal_mk; slope: sen_seasonal; interval:
  ols_anomaly") from `backend/app/agent.py` / `llm/runtime.py` (Tâm's code, left unchanged).
- The 0.5° data must be downloaded and cleaned on each machine (about 3.4 GB); see WIKI.
- The first map for a new time range takes about a minute (259,200 cells); 2001 to 2025 maps are cached on disk.

## Demo walkthrough (about 3 minutes)

1. Open `http://localhost:5173/` (landing). Point at the headline, NASA data cards and transparency section.
2. Press **Watch Demo** (placeholder until the video exists), then **Get Started**.
3. Follow the tour with Next (12 steps), finish with **Start Exploring**.
4. Explore: Air temperature, MERRA-2; show the big trend map, hover a cell, **Expand map**, switch to **3D globe**, Escape.
5. Type "Vietnam" in step 4 or click the Mekong Delta; press **Run analysis**; read verdict, rate, p-values, chart.
6. Detective: ask "Is the precipitation trend in the Mekong Delta significant?" and open the evidence.
7. Report: show the collected analyses and the method text.
8. Sidebar **Replay Tutorial** to show it can be replayed; **About Terra-scope** returns to the landing page.

## Start commands

```powershell
cd "C:\NUS CS\Y1\Nasa Challenge\terra-scope-ai"
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Mode Template   # or -Mode Gemini
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Stop
```
