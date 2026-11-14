# Report export redesign (Explorer and Scientist PDFs)

Date: 2026-11-14. Branch: `integration/phase7` (uncommitted on top of `22a8ef4`).
Scope: report wording, layout and export only. No NASA cube, statistical algorithm or backend verdict was changed.

## 1. Root cause: how the PDF is made

- The report is a React page (`web/src/report/EditionDoc.tsx`) printed by the browser (`window.print()`, "Save as PDF").
  There is no server-side PDF renderer and no canvas or screenshot step.
- Chrome's "Save as PDF" writes real text with embedded fonts, so text is selectable and searchable. This was verified
  on 6 generated PDFs (see section 7): every page has a text layer and no page is an image.
- An image-only PDF can only appear when a different path is used, for example "Microsoft Print to PDF", a
  virtual printer that rasterises, or a screenshot tool. The print dialog hint now says to choose "Save as PDF".
- Real defects found and fixed while diagnosing:
  - The Experience switch and other app controls were printed. Print CSS now hides every app control.
  - The PDF title metadata was the app name. `document.title` is now the report title while the preview is open.
  - CSS `text-transform: uppercase` changed the copied text (for example "STATISTICAL TEST OUTCOME"). Content
    labels no longer use it.
  - Long titles pushed the cover onto two pages, and one result page overflowed so a page held only the author note.

## 2. Architecture

| Part | File |
|---|---|
| Report data (numbers, verdicts, provenance) | `web/src/report/model.ts` (unchanged logic) |
| Wording for both editions, Markdown export, glossary, references | `web/src/report/formd.ts` |
| Printable document, both editions | `web/src/report/EditionDoc.tsx` |
| Charts and locator map (fixed-viewBox SVG) | `web/src/report/ReportDoc.tsx` (axis titles added) |
| Wizard, title, author, notes, appendix option, document title | `web/src/pages/Report.tsx` |
| Print rules, page boxes, page numbers | `web/src/styles.css` (`@page`, `@media print`) |
| Code revision printed in the report | `web/vite.config.ts` (`__GIT_REV__` from `git rev-parse --short HEAD`) |
| PDF generator for tests (headless Chrome, CDP `Page.printToPDF`) | `web/e2e/report-pdf.mjs` |
| PDF checks (PyMuPDF) | `backend/tests_e2e/test_report_pdf.py` |

## 3. Why the text is selectable

- All text is HTML text, and charts are SVG with `<text>` elements, so Chrome emits text runs with embedded
  fonts (Nunito, Fredoka). Nothing is drawn on a canvas or turned into an image.
- Custom title, author and notes are rendered as React text nodes (never as HTML), with `white-space: pre-line`, so
  line breaks are kept and markup typed by the user is shown as text.

## 4. Explorer and Scientist changes

User text (Part C): the custom title, "Prepared by" and author notes are never overwritten. They survive edition
switches and every export. A notes box is labelled "Author note: written by the report author, not part of the
evidence". The default title ("{Variable} Trend Analysis: {place}") is used only when the title is empty. Limits:
title 200 characters, note 1000. Markdown export escapes `&`, `<`, `>`.

Explorer (Part D):
- Pages: cover with Summary of findings, one "Understanding the evidence" page per finding, About the data and methods.
- D4 wording templates for significant, not significant and insufficient results, driven only by the backend verdict
  and the slope sign. Rate in everyday terms ("About +3.43 mm/month every 10 years ... adds up to roughly +8.23").
- D5: the "Strength of evidence" meter is removed. A "Statistical test outcome" box says "Meets / Does not meet the
  selected significance threshold" or "Not tested", with the p-value in words.
- D6: yearly bar chart with axis titles ("Year", "Compared with usual (units)"), a "usual" zero line, a legend, and a
  dashed trend line when the trend is not confirmed.
- D7: "What this report cannot tell us", glossary (6 terms), references with DOIs.
- Optional technical appendix with every number, including "95% CI for the OLS anomaly slope".

Scientist (Part E):
- Cover: research question, report ID, UTC time, datasets with versions, regions, periods, abstract, Table 1, decision rule.
- Result pages separate "Used for the verdict" (Sen slope, raw Seasonal MK p, sufficiency) from "Diagnostic or context
  only" (Hamed-Rao p, "95% CI for the OLS anomaly slope", labelled as targeting the OLS slope, not the Sen slope).
- Monthly anomaly chart with axis titles, locator map, comparison pages with the two-condition rule.
- Methods, provenance table, reproducibility table (evidence ID and the exact API request), software version and code
  revision, limitations, references with DOIs checked against Crossref.
- E3: printed metadata was checked against the live backend (product, version, period, months, slope, p-value).

## 5. Unicode and links

- Vietnamese and scientific symbols extract correctly: tested with "Nhiệt độ Đồng bằng sông Cửu Long ... (α = 0.05, ±,
  ≤, ≥, °C)" and "Lê Gia Hưng". No replacement characters.
- Every PDF has 13 to 17 live links: the NASA GES DISC dataset pages and 5 DOI links. No localhost link or text.

## 6. Print layout

- A4, `@page` margin boxes for the running footer and "Page X of Y".
- Each finding starts a new page; headings avoid breaking from their content; orphans and widows 3.
- Long titles shrink (two size steps) instead of pushing the cover onto a second page.
- No app control is printed (navigation, Experience switch, tutorial, toasts, wizard buttons).

## 7. Test results (2026-11-14)

| Suite | Result |
|---|---|
| Backend unit tests | 258 passed |
| Python dependency check | no broken requirements |
| Frontend unit tests | 54 passed (new: `tests/explorer.test.mjs`, 4 tests) |
| Typecheck and production build | pass |
| Live API end-to-end (real NASA data) | 22 passed, 5 skipped (Gemini, not requested) |
| of which PDF checks (`test_report_pdf.py`) | 9 passed |
| Browser end-to-end (headless Chrome) | 11 passed |

PDF checks run on 6 real PDFs (3 fixtures x 2 editions): text layer on every page, custom text verbatim (including the
note line break), PDF title metadata, Unicode, numbers equal to the backend, Explorer has no meter or "null hypothesis",
Scientist labels, links, no printed controls, no text outside the page, no near-empty page. Every page is rendered to
PNG in `web/e2e/out/pdf/` and the pages were inspected by eye.

Generated PDFs: single 4 / 5 pages, nonsig 4 / 5, multi 6 / 7 (Explorer / Scientist).

## 8. Accessibility status

- Real text, logical reading order, headings, table headers (`scope`), figure captions and a legend in words.
- Not done: Chrome's print path does not produce a tagged PDF (PDF/UA). Screen reader support in the PDF is therefore
  limited; the HTML report on screen is the accessible version.

## 9. Limitations

- Author and Subject PDF metadata cannot be set through browser printing; only the title is set.
- The PDF title replaces characters that are not allowed in file names (`/ : * ? " < > |`) with spaces, because
  Chrome also uses it as the default file name. The title printed on the page is exact.
- The final look depends on the browser: tested on Chrome. Other browsers were not tested.
- Manual check of text selection and Ctrl+F in a PDF viewer was not done by hand; it is covered by automated
  extraction with PyMuPDF.

## 10. How to test locally

```powershell
# backend on :8000 and web on :5173 must be running (scripts/start-local.ps1)
powershell -ExecutionPolicy Bypass -File .\scripts\test-all.ps1
# only the PDF checks (writes PDFs and PNGs to web/e2e/out/pdf)
$env:PYTHONUTF8='1'; .\.venv\Scripts\python.exe -m pytest -q backend/tests_e2e/test_report_pdf.py
```
