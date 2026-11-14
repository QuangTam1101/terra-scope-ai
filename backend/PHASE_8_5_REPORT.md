# Phase 8.5: scientific exploration, Contradiction Hunter 2.0 and professional reports

Date: 2026-11-14. Branch: `integration/phase7` (local, not pushed). All Phase 8.5 work is **uncommitted** and sits on top of the
uncommitted Phase 7 work. No Phase 8 document existed in the repository; this phase builds on Phase 7 (`backend/PHASE_7.md`).

No NASA file, statistical algorithm, threshold or decision rule was changed. New analysis features reuse the production
endpoints (`/series`, `/trends`, `/compare`, cached `/trends/grid`). Everything new that is not a production test is labelled
"descriptive".

## 8.5A Context-aware analysis progress

| Operation | What the user now sees | Where |
| --- | --- | --- |
| Regional analysis (two real requests: `/series` + `/trends`) | "Analyzing {variable} in {place}…" with two steps, each with its own state (running, done, failed): "Building the monthly time series ({dataset}, {start} to {end})" and "Testing the trend for statistical significance"; a **Cancel** button | Result card (Explore) |
| Global grid, not yet computed | "Computing trend statistics across the global grid…" + dataset, period, number of cells (259,200 at 0.5°), "the first time can take about a minute" | Map overlay |
| Global grid, already on disk | "Loading previously computed analysis…" | Map overlay |
| Values map | "Loading the values map…" + month filter | Map overlay |
| Region comparison / discovery scan / dataset agreement | Messages naming the two places, the tile count, or the two datasets | Hunt |

- New backend endpoint `GET /api/v1/grids/status?kind&variable_id&start&end` (no computation) tells whether a map is cached.
- The period always comes from the selection and backend coverage; the old "The full period (2001 to 2025) is ready instantly"
  and "Calculating the trend for every place on Earth" texts are gone. `INVALID_TIME_RANGE` now shows the backend message
  (which contains the real coverage).
- No progress percentages (the backend reports none).
- Stale responses: each regional run aborts the previous one (`AbortController`) and a newer run id wins; grid requests are
  aborted when the user changes dataset/period/layer. The map stays visible and usable under the overlay
  (`pointer-events: none`).
- A user cancel shows nothing as an error (`CANCELLED` code is not toasted).

## 8.5B Scientific Evidence Report

`web/src/report/model.ts` (pure, tested) builds the report from backend responses; `web/src/report/ReportDoc.tsx` renders it as
A4 pages; `web/src/pages/Report.tsx` holds the toolbar.

Pages: (1) cover and executive summary: report id (stable hash of the evidence ids), generation time (UTC), products, one plain
finding per analysis, how to read significance, key limitations; (2) per analysis, time series and trend: fixed-viewBox SVG chart
of monthly anomalies with the seasonal Sen line (dashed when not significant), Sen slope, raw Seasonal MK p (decision basis),
autocorrelation-adjusted p (diagnostic only), OLS anomaly 95% interval labelled "not a Sen confidence interval", sample and
missing months, sufficiency, method + backend version + trend id; (3) per analysis, geographic evidence: locator map with the box,
preset id or "bounding-box approximation", box coordinates, processed vs native resolution, FDR note; (4) comparisons (only if
present): side-by-side table, chart, map, what agrees, what disagrees, strength of evidence, what cannot be concluded;
(5) methods and provenance: product table with links, aggregation, seasonality, test, rate, interval, autocorrelation, comparisons,
software, reproduction, limitations, disclaimer.

Print: `@page` A4 with margins and "Page X of Y" in the page margin boxes; app chrome, toolbar and toasts hidden; no
horizontal scroll; tables `table-layout: fixed` with wrapping; header rows repeat; charts, maps, key-value rows avoid breaking.
Users are told to switch off the browser's own "Headers and footers" in the print dialog.

Exports: **Save as PDF** (browser print), **Markdown** (all context per analysis, comparisons, methods, limitations),
**reproducibility JSON** (`terra-scope-report/1`: the exact request for each analysis plus the result it returned; no secrets).

### Scientific audit: the +3.60 and +3.51 slopes in the owner's PDF

Reproduced on the live backend (0.5° grid, IMERG, same production method):

| Region | Period | Sen slope (mm/month/decade) | Raw p |
| --- | --- | --- | --- |
| `mekong_delta` (historical reference, 1° cubes, `GRID_V2=0`) | 2001-01..2024-12 | 3.163604736328125 | 0.11031644898805326 |
| `mekong_delta`, 0.5° | 2001-01..2024-12 | 3.4290 | 0.077 |
| `mekong_delta`, 0.5° | 2001-01..2025-12 | 4.2292 | 0.041 |
| **`mekong_region` (whole basin 94 to 110°E, 8 to 35°N), 0.5°** | **2001-01..2025-12** | **3.5084** | 0.024 |
| **`mekong_delta`, 0.5°** | **2008-01..2025-12** | **3.5967** | 0.422 |
| `mekong_region`, 0.5° | 2006-01..2021-12 | 3.6034 | 0.317 |

+3.51 is the whole Mekong basin for 2001 to 2025. +3.60 matches the Mekong Delta for 2008 to 2025 (or the basin for 2006 to 2021;
the PDF itself was not available to confirm which). The differences come from **different regions and periods** (and the 0.5°
grid), not from a method change. The old report table did not show region boxes or periods, which made the rows ambiguous; every
report row now names region, box, period, grid and method version.

### PDF verification

Rendered with headless Chrome (`--print-to-pdf --no-pdf-header-footer`) from case links and inspected page by page:
`backend/phase85_samples/report_single_region.pdf` (5 pages) and `report_multi_region.pdf` (9 pages, two analyses and one
comparison). Found and fixed during inspection: locator map showed the whole world (d3 ring winding), uneven axis labels,
"analysises", and a **wrong sentence** "difference not significant (p = 0.022)": the backend rule is p < α **and** the bootstrap
interval excluding zero, so the text now says the p-value passes but the interval includes zero and the result is inconclusive.
Values in both PDFs match the backend JSON (for example MERRA-2 Mekong Delta +0.187 °C/decade, OLS 0.0908 to 0.252; Sahel vs
Wisconsin difference interval −0.865 to 0.117). No clipped text, overlapping text, missing chart or horizontal scrollbar.
Remaining layout limit: long pages (comparison, methods) continue on the next page with mostly blank space after.

## 8.5C Contradiction Hunter 2.0

Backend `POST /api/v1/hunt/discover` (`backend/app/hunt.py` + `main.py`):

- **Regions mode**: reads the cached global trend map (per-cell Seasonal MK + Sen, BH-FDR), cuts the search extent into tiles,
  and pairs tiles whose dominant FDR-significant direction is opposite (≥ 30% of ≥ 4 valid cells). Ranking (explicit, no
  confidence %): weaker side's significant share, then mean-slope gap, then distance, then position. The top 5 pairs are
  **re-tested with the production `/compare` test**; classification: statistical evidence (`opposite_significant`), inconclusive,
  descriptive (tiles disagree but regional averages agree), unsupported.
- **Datasets mode**: only for compatible pairs (same quantity, same units, same grid): GLDAS vs MERRA-2 air temperature (and
  GLDAS vs MODIS evapotranspiration once MODIS data exist). Flags tiles with opposite mean slopes or different significance
  pictures; regional trends of both products are computed for the top 5. Always **descriptive**: there is no approved test of a
  difference between products, and neither is ground truth.
- Limits: ≤ 600 tiles (`RESOURCE_LIMIT` otherwise), ≤ 8 candidates, ≤ 5 re-tests; `INCOMPATIBLE_DATASETS` for other pairs;
  sync endpoint runs in the thread pool (does not block the event loop); grid reuse through the existing disk/memory cache.
- Measured on the real 0.5° data: Sahel and Sahara, 5° tiles, MERRA-2 2001 to 2025: 60 tiles, 5 re-tests, **4.6 to 6.7 s**;
  datasets mode 2.3 s. Example result: western Sahara box (+0.42 °C/decade) vs Sudan box (−0.78 °C/decade), difference +1.16,
  95% interval +0.80 to +1.51: "Contradiction confirmed". In the same Sudan tile GLDAS gives +1.07 vs MERRA-2 −0.78 (descriptive).

Frontend Hunt has three tabs: **Compare two places** (existing test, plus Add to report and Investigate with Detective),
**Discover contradictions** (area, tile size, optional second dataset, ranked candidate cards with locator maps, reasons, Inspect,
Detective, Add to report, ranking criteria), **Dataset agreement** (see D2). Detective receives a real `compare` context (two boxes,
variable, period); verified live in Gemini mode: the answer cites the backend numbers (+0.422, −0.778, difference test) and no
invented values.

Taxonomy coverage: opposite directions (C taxonomy 1) and dataset disagreement (4) are scanned; different significance classes (2)
and magnitude differences (3) are reported in comparison findings and report pages; seasonal windows (5) and period sensitivity
(6) are explored descriptively in Explore (D1, D3), not scanned automatically.

## 8.5D New exploration features

- **D1 Seasonal Trend Explorer** (Explore, "Explore further · Seasons"): yearly mean of a season or a single month from the
  backend series, chart and Theil-Sen slope labelled "descriptive, not tested", with sample size and the warning that the full-year
  verdict answers a different question. A season-specific significance test is a **proposal** needing scientific review.
- **D2 Dataset Agreement** (Hunt tab): two compatible products over the selected place: both production trend results, slope
  difference, correlation of monthly anomalies (descriptive), overlay chart, and a **coverage warning** when the products cover
  different shares of the area (found in QA: Whole world MERRA-2 100% vs GLDAS 24%, land only).
- **D3 Time Window Explorer** (Explore, "Time window"): start/end years, debounced 700 ms, each window tested with the production
  `/trends`, at most 8 windows, explicit note that many windows are many uncorrected tests.
- **D4 Save & Reproduce Case** (Report): save in this browser (localStorage, ≤ 20 cases), copy a `#report?case=` link (parameters
  only), export/import case JSON, reopen (recomputes everything from the backend and reports if results differ from the saved
  ones). Untrusted case files and links are validated (schema, ids, regions, periods). No keys or environment values are stored.
  Limitation: dataset comparisons are saved as two separate analyses.

## API changes

- `GET /api/v1/grids/status` (new, read-only).
- `POST /api/v1/hunt/discover` (new). Errors: `RESOURCE_LIMIT`, `INCOMPATIBLE_DATASETS`, `INVALID_TIME_RANGE`, `NOT_FOUND`.
- No change to existing endpoints or their responses.

## Tests

- Backend `pytest -q backend/tests`: **238 passed** (230 before + 8 in `tests/test_phase85.py`: grid status, discovery opposite
  pair + re-test, same-sign no candidates, incompatible datasets, resource limit, request bounds, dataset rules with missing data
  and ordering, deterministic ranking, compatibility table). `pip check`: no broken requirements.
- Frontend `npm run test`: **32 passed** (25 before + 7 in `tests/phase85.test.mjs`; `pages.test.mjs` store mock updated for the
  new store fields and report wording). `npm run typecheck` and `npm run build` pass.
- Scientific regression: with `GRID_V2=0`, Mekong Delta IMERG 2001-01..2024-12 gives n = 288, Sen 3.163604736328125,
  p 0.11031644898805326, not significant (exact).
- Browser (app pane, 1440 × 900 and 375 × 812): regional progress steps; grid message switches from "Loading" to "Computing …
  259,200 grid cells" for an uncomputed period; discovery scan, Inspect, Add to report, dataset agreement with coverage warning,
  Detective in Gemini mode (1 live request), report list, save case, reload, reopen (4 items recomputed, results match); seasons and
  time window views; no horizontal overflow on Explore, Hunt (incl. results), Detective, Report, Home at 375 px.
- Not verified: browser print dialog itself (PDFs were produced by headless Chrome with the same print CSS), Letter paper,
  screen reader, Firefox/Safari print engines (page margin boxes for page numbers need a recent Chromium).

## Known defects and limits

- Detective answers still show raw identifiers (for example `seasonal_mk`, p-values like 4.4695558365503985e-10) from Tâm's
  code paths.
- Dataset comparisons reopen as two separate analyses.
- Discovery uses tiles (boxes), not exact geometries, and only opposite-direction rules; seasonal and period-sensitivity
  contradictions are not scanned.
- MODIS variables (AppEEARS) are still "not available": three AppEEARS tasks were submitted on 2026-11-14 and are processing.

## Next recommended steps

1. Đăng reviews: the 0.5° + 2025 sensitivity of the Mekong rainfall verdict, the dataset-agreement coverage rule, and the
   proposal for a season-specific test.
2. Add MODIS (AppEEARS) data when the tasks finish, then enable the GLDAS vs MODIS evapotranspiration pair.
3. Render Detective method identifiers in plain language.
4. Optional: native PDF generation if browsers without CSS page margin boxes must be supported.

## Start commands

```powershell
cd "C:\NUS CS\Y1\Nasa Challenge\terra-scope-ai"
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Mode Template   # or -Mode Gemini
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -Stop
```
