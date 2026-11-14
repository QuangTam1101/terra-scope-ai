# Scientific end-to-end test plan

Date: 15 November 2026. Branch `integration/phase7` (HEAD `22a8ef4` plus uncommitted work). Data: processed 0.5 degree grids in `data-pipeline/data/processed/grid/` (2001-01 to 2025-12).

This plan checks that the numbers Terra-scope shows are the numbers the NASA files and the documented method produce. It covers the data layer, the statistics, the API, the browser screens in both Experience modes (Explorer and Scientist), and the exported PDFs. An HTTP 200 alone never counts as a pass.

## 1. Independent oracle

`validation/oracle.py` is written from the method description, not from the production code.

| Concern | Oracle | Production |
|---|---|---|
| Reading data | `xarray.open_dataset` on the NetCDF file, boolean box mask on cell centres (inclusive) | `pipeline` region extraction |
| Area weighting | cos(latitude), NaN cells skipped per month | same rule, separate code |
| Seasonal Mann-Kendall | own S, tie-corrected variance, continuity-corrected Z, two-sided p via `math.erfc` | `pymannkendall.seasonal_test` |
| Seasonal Sen slope | own pairwise slopes within each calendar month | `pymannkendall` |
| Hamed-Rao | own implementation (ranks of the Sen-detrended series, biased ACF, lags outside 1.96/sqrt(n)) | `pymannkendall.hamed_rao_modification_test` |
| OLS anomaly interval | own least squares; only `scipy.stats.t.ppf` is shared | `scipy.stats.linregress` |
| Grid map | own vectorised seasonal MK and Sen over all cells, two variants (no ties, tie-corrected) | `pipeline.grid_trend` |
| FDR | own Benjamini-Hochberg over the full family of valid cells | `pipeline.bh_fdr` |
| Sufficiency | at least 10 years and at least 70% of months present | backend |

The oracle never imports the backend or `pipeline`. It was not edited to match production; where the two disagree by design (tie correction on the grid) both variants are reported.

## 2. Tolerances

| Quantity | Tolerance | Reason |
|---|---|---|
| Monthly regional values, anomalies | 6e-7 absolute | API rounds to 6 decimals |
| Coverage fraction | 5e-4 | API rounds to 3 decimals |
| Sen slope | 1e-9 relative | same arithmetic, float order only |
| Z, raw p, Hamed-Rao p | 1e-7 relative (or 1e-12 absolute near 0) | floating point; p near 0 underflows to 0 in the API |
| Grid slope, p, q | 6e-7 absolute | API rounds to 6 decimals |
| Grid significance flags | exact, except cells whose q lies within rounding of alpha | rounding can flip a flag only at the threshold |
| Screen and PDF numbers | exact string after the same formatter as the UI (`ui.tsx`, `model.ts`) | display rounding |

## 3. Test matrix

| Group | IDs | What is compared | Script |
|---|---|---|---|
| Regional, real data | TC-01 to TC-23 (25 cases incl. 06a/b, 20a/b) | oracle vs `/series` and `/trends`: time stamps, missing months, every monthly value, chart anomalies, n, coverage, units, sufficiency, slope, Z, p, verdict, Hamed-Rao p, OLS CI, direction | `validation/run_backend.py` |
| Expected errors | TC-12 antimeridian, TC-14 land-only variable over ocean, TC-15 short period, TC-21 box below one cell | status code and error code, no fabricated result | same |
| Grid, full family | GR-01 MERRA-2 2001-2025, GR-02 IMERG 2001-2024 | oracle vs `/trends/grid` for every cell, BH over all valid cells | `validation/run_grid.py` |
| Region comparison | CMP-01 Sahel vs Wisconsin | slopes, difference slope, difference p, decision rule, reproducibility | `validation/run_compare.py` |
| Synthetic | SY01 to SY15 | production `trend_one`, `grid_trend`, `bh_fdr` on generated series with known answers | `validation/test_synthetic.py` |
| Browser | UI-01 to UI-05 | real app in Chrome headless, both modes, request capture, screen text, screenshots | `web/e2e/scientific.e2e.mjs` |
| PDF | PDF-01 | Explorer and Scientist PDFs: numbers vs oracle, selectable text, overflow, links, wording, page images | `validation/run_ui_pdf.py` |

Regions were chosen to cover tropics, desert, polar, ocean, coast, land-only masking, a user box, the whole globe, partial years, missing months, ties (Sahara rainfall) and dataset disagreement (Sahel, Australia).

## 4. Statuses

- PASS: every check in the case met its tolerance.
- FAIL: at least one check outside tolerance.
- BLOCKED: could not run because of an external dependency.
- NOT RUN: designed but not executed.
- INCONCLUSIVE: executed, but the result is a measurement rather than a pass or fail.

## 5. Out of scope or not executed

| Item | Status | Why |
|---|---|---|
| Gemini answers | NOT RUN | the spec forbids using Gemini to verify statistics; Gemini live tests were skipped (no key on this run) |
| Independent recomputation of the bootstrap interval | NOT RUN | seeded resampling; only determinism and the decision rule were checked |
| Entering an arbitrary box in the browser by dragging on the map | NOT RUN | the harness used search and coordinates; boxes were covered through the API |
| Forecast models | NOT RUN | separate task |

## 6. How to re-run

```
cd terra-scope-ai
.venv/Scripts/python.exe validation/run_backend.py      # backend running on :8000
.venv/Scripts/python.exe validation/run_grid.py
.venv/Scripts/python.exe validation/run_compare.py
.venv/Scripts/python.exe -m pytest validation/test_synthetic.py --junitxml=validation/results/synthetic_junit.xml
node web/e2e/scientific.e2e.mjs                         # web dev server on :5173
.venv/Scripts/python.exe validation/run_ui_pdf.py
.venv/Scripts/python.exe validation/build_results.py    # writes scientific_validation_results.json
```

On Windows set `PYTHONUTF8=1`.
