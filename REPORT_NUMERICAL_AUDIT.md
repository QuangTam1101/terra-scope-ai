# Report numerical audit

Date: 15 November 2026. Scope: the numbers a person reads on screen (Explorer and Scientist modes) and in the exported PDFs (Explorer and Scientist editions), compared with the independent oracle (`validation/oracle.py`) reading the NetCDF files directly.

How it was run: `web/e2e/scientific.e2e.mjs` drives the real app in Chrome headless (backend on :8000, Vite on :5173). For each scenario it chooses the place and variable the way a person would, captures every API request, saves the screen text and a screenshot in both modes, then walks the Report wizard and exports both PDFs with the browser's own "Save as PDF". `validation/run_ui_pdf.py` formats the oracle values with the same rules as the UI (`ui.tsx`, `model.ts`) and searches for those exact strings on screen and in the PDF text extracted with PyMuPDF.

Evidence: screenshots `web/e2e/out/scientific/UI-0*-{explorer,scientist}.png`, PDFs `web/e2e/out/scientific/report-{explorer,scientist}.pdf`, page images `validation/results/pdf_pages/`, detailed checks `validation/results/ui_pdf_cases.json`.

## Scenarios

| ID | Place (how chosen) | Variable | Box (W,S,E,N) | Oracle slope/decade | Raw p | Hamed-Rao p | OLS 95% CI | Explorer label | Status |
|---|---|---|---|---|---|---|---|---|---|
| UI-01 (TC-01) | Mekong Delta (search) | IMERG precipitation, 2001 to 2024 | 104.4, 8.5, 106.9, 11.1 | +3.43 mm/month | 0.077 | 0.293 | -1.09 to 18.33 | Not proven yet | PASS |
| UI-02 (TC-02) | Hanoi, Vietnam (search) | MERRA-2 air temperature, 2001 to 2025 | 105.3, 20.5, 106.1, 21.4 | +0.228 °C | < 0.001 | 0.090 | -0.0354 to 0.325 | Clear trend (significant) | PASS |
| UI-03 | Australia (search, country box) | MERRA-2 air temperature, 2001 to 2025 | 113, -44, 154, -10 | +0.254 °C | < 0.001 | < 0.001 | 0.198 to 0.372 | Clear trend (significant) | PASS |
| UI-04 | Coordinates 23.3 N, 10.2 E (one cell) | MERRA-2 air temperature, 2001 to 2025 | 10, 23, 10.5, 23.5 | +0.201 °C | 0.045 | 0.175 | -0.0448 to 0.337 | Clear trend (significant) | PASS |
| UI-05 (TC-17) | Central Highlands (search) | GLDAS evapotranspiration, 2001 to 2025 | 107.2, 11.2, 109.0, 15.5 | +6.79 mm/month | < 0.001 | < 0.001 | 5.64 to 9.11 | Clear trend (significant) | PASS |

Checks per scenario (17 each, all passed):
1. The captured request carries the chosen variable and years.
2. Backend slope, raw p and verdict equal the oracle.
3. Explorer screen shows the oracle slope, the oracle p and the right verdict label; for a non-significant result the wording stays hedged.
4. Scientist screen shows slope, raw p, Hamed-Rao p and the decision sentence.
5. Switching mode sends no new request (0 in all five), so both modes show the same result.
6. Explorer PDF contains the slope; Scientist PDF contains slope, raw p, Hamed-Rao p, the OLS interval, and the table row with n months and verdict.

Note: in UI-02 and UI-04 the raw p is below 0.05 while Hamed-Rao is not. The app says "significant" because the approved rule uses the raw p; Scientist mode shows the Hamed-Rao value next to it. See finding B2 in [SCIENTIFIC_VALIDATION_RESULTS.md](SCIENTIFIC_VALIDATION_RESULTS.md).

## PDF content and layout (PDF-01): PASS

| Check | Explorer (9 pages) | Scientist (10 pages) |
|---|---|---|
| Every page has selectable text (characters per page) | 1,051 to 1,839 | 765 to 2,183 |
| No word placed outside the page | yes | yes |
| No long dash | yes | yes |
| NASA products named (GPM IMERG, MERRA-2, GLDAS) | yes | yes |
| OLS interval described as "not the Sen slope" / "not a Sen-slope confidence interval" | n/a | yes |
| p-value never read as the probability that the trend is real | yes | n/a |
| Clickable reference links | n/a | 8 (3 GES DISC dataset pages, 5 DOIs) |

The page images in `validation/results/pdf_pages/` were looked at one by one for clipped text, overlapping labels and broken charts.

## Fixes made during the audit (presentation only)

No statistical code, threshold or data was changed.

| Finding | Before | After | Files |
|---|---|---|---|
| D1 chart y-axis title clipped | "Monthly anomaly (mm/month)" cut at both ends | title centred on the axis and shrunk to fit when longer than the plot | `web/src/report/ReportDoc.tsx`, `web/src/report/EditionDoc.tsx` |
| E1 difference test described wrongly | "block-bootstrap p"; "the estimated rates differ by" (simple subtraction presented as the test result) | p is the Hamed-Rao Mann-Kendall p on the anomaly difference series (A minus B), its trend is the Sen slope, the moving-block bootstrap (12-month blocks) gives the 95% interval; the subtraction of two Sen slopes is labelled as such | `web/src/onboarding.ts`, `web/src/pages/Hunt.tsx`, `web/src/report/EditionDoc.tsx`, `web/src/report/ReportDoc.tsx`, `web/src/report/formd.ts`, `web/src/report/model.ts` |

After the fix the multi-region Scientist PDF contains "Hamed-Rao Mann-Kendall p on the anomaly difference", "anomaly difference series" and "-0.383" (CMP-01 oracle value -0.38315), and no longer contains "block-bootstrap p".

## Open recommendations (not changed)

| ID | Item |
|---|---|
| F1 | The Explorer edition turns the rate into a total over the period ("adds up to roughly +8.23 mm/month") even when the trend is not significant (`web/src/report/formd.ts`, line 190). Suggest showing it only for significant results, or adding "if this rate is real". |
| F2 | Large blank space after some table page breaks. |
| C1 | IMERG coverage is listed to 2025-12 but the last month with data is 2025-09. |
