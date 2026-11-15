# Pitch deck (7 slides, 16:9)

- `Terra-scope-AI_pitch-deck.pptx`: editable deck, speaker notes on every slide (about 3 minutes in total).
- `Terra-scope-AI_pitch-deck.pdf`: exported with PowerPoint (searchable text).
- `previews/slide-N.png`: rendered pages used for visual QA.
- `screenshots/`: real screenshots of the local app (web :5173, backend :8000, 15/11/2026); `crops/` are the parts used in the deck; `capture_log.json` is the page text at capture time.
- `source/`: `shots.mjs` (headless Chrome capture, uses `web/e2e/cdp.mjs`), `build.js` (pptxgenjs), `topdf.ps1` (PowerPoint to PDF), `slide_text.md`.

## Numbers used and where they come from

| Slide | Claim | Source |
|---|---|---|
| 3 | Mekong Delta air temperature +0.19 °C per decade (0.187), 2001 to 2025, p < 0.001, MERRA-2 | Explore result, Scientist panel, Detective answer (live app) |
| 3 | 259,200 cells: 55% rising, 8% falling, 37% could be chance | Explore trend map caption |
| 4 | Sahel −0.21 vs Wisconsin +0.21 °C per decade; gap p 0.022, bootstrap [−0.87, +0.12] | Hunt (live) + `validation/SCIENTIFIC_VALIDATION_RESULTS.md` |
| 5 | 64% above-normal Dec 2026, confidence low; Satellite ≤ 12 months, Outlook ≤ 18 months; skill 1/3/6/12 months | Forecast page (live), `data-pipeline/docs/05`, `models/metrics.json` |
| 7 | 48 PASS, 1 inconclusive, 0 FAIL | `validation/SCIENTIFIC_VALIDATION_RESULTS.md` |
| 7 | Correlation 0.9996 with Giovanni (soil moisture, 293 months) | WIKI.md, check on 14/11/2026 |

## Fonts

Headings use Arial Rounded MT Bold, body Calibri, because Fredoka and Nunito are not installed on this machine (PowerPoint would substitute them). To use the brand fonts, install Fredoka and Nunito, then change the theme fonts once (Design > Variants > Fonts).

AI assistance: deck layout and script generated with Claude Code; all screenshots are from the real app, no AI-generated images.
