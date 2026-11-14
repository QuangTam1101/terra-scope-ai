# Dual-audience UX: Explorer Mode and Scientist Mode

Status: implemented on branch `integration/phase7` (uncommitted), 14 Nov 2026. Code written with AI assistance (Claude Code).

## 1. User journey

```
Landing page (#landing)
  -> Get Started
  -> Experience choice (#start): "Explore Earth" or "Scientific Analysis"
  -> App opens on Explore (#explore) in the chosen mode
  -> First time for that mode: its interactive tutorial starts once
  -> Experience switch at the top of every app page: Explorer | Scientist
```

- The landing page is unchanged; every Get Started / Open the app button now opens the experience choice.
- Deep links (`#explore`, `#report?case=...`) still work. Without a stored preference they use the documented
  default, Explorer (`DEFAULT_AUDIENCE` in `web/src/audience.ts`).
- Browser back from `#start` returns to the landing page; refresh keeps the route.

## 2. Experience choice (`web/src/pages/ModeSelect.tsx`)

- Heading "How would you like to explore Earth?", two equal cards (compass and flask icons), one primary
  button each: "Continue as Explorer", "Continue as Scientist".
- Nothing is preselected. The previous choice is only marked "Last used". An explicit click always wins over
  the stored preference.
- Keyboard: the heading receives focus; cards are plain sections with real buttons; visible focus and hover
  states; reduced motion removes the lift animation. One column below 760 px.
- Works without the backend or Gemini (no request is made).

## 3. Shared state architecture

| Concern | Where | Notes |
|---|---|---|
| Scientific analysis state (selection, run, history, comparisons, chat, cases) | `web/src/store.tsx` | Unchanged; single source of truth for evidence |
| Audience preference | `audience` / `setAudience` in the same store, persisted by `web/src/audience.ts` | Key `terra-scope:audience-mode:v1`, values `explorer` / `scientist`; unavailable storage never throws |
| Presenters | `web/src/ResultViews.tsx` (`ExplorerResult`, `ScientistResult`), `web/src/report/PlainDoc.tsx`, page copy | Read the same `TrendResponse`; never compute statistics |

Switching mode only changes `audience`. It does not reload, refetch, cancel a running analysis, clear chat,
reset the map or touch reports. A running analysis keeps its progress box and is shown in the new mode when it
finishes. Verified in the browser: switching after a Mekong Delta analysis made 0 new API requests and kept the
same slope.

## 4. Presentation rules

Explorer result order: What did we find? / What does the data show? / How strong is the evidence? (p-value
meter + data coverage), then expandable "Why might this matter?" and "How was this calculated?" (all four
statistics).

Scientist result order: Analysis metadata (product, version, region preset or box, period, grid, sample) /
Statistical estimates (Sen slope, raw p, adjusted p, OLS interval) / Significance and uncertainty / Methodology /
Warnings / Assumptions, limitations and provenance.

The plain finding sentence (`plainFinding`) uses only the sign of the backend slope and the backend verdict.
A non-significant result is never described as a clear change. Example, Mekong Delta IMERG 2001 to 2024:
Explorer "The estimated trend in precipitation is upward, but the evidence is not strong enough to confirm a
clear change under the test used..."; Scientist "Positive seasonal Sen slope; raw Seasonal MK p = 0.077,
alpha = 0.05; the reported significance criterion is not met (not significant)."

Other pages: Explore setup labels become guided questions in Explorer; Hunt is titled "Where do the results
disagree?" (Explorer) or "Contradiction hunt" with the exact test rule (Scientist); Detective offers
audience-specific sample questions; Forecast uses the app-wide Experience instead of its own Simple/Scientist
switch (Explorer = Simple view, Outlook mode).

## 5. Glossary and contextual help

`web/src/glossary.ts`: 17 terms (trend, time series, p-value, statistical significance, null hypothesis, Sen
slope, Seasonal Mann-Kendall, autocorrelation, confidence interval, FDR, anomaly, reanalysis, spatial
resolution, data provenance, missing data, uncertainty, forecast versus historical trend), each with a plain
definition, a technical definition, an example and related terms.

`web/src/Term.tsx`: a small "?" button next to a word. Click, tap, Enter or Space opens it; Escape or a click
elsewhere closes it; never hover-only; the touch target is enlarged. Explorer sees the plain text first,
Scientist the technical text. Home has a full "Science words" / "Glossary" list.

The p-value text never says it is the probability that the null hypothesis is true, that p > 0.05 proves no
trend, or that p < 0.05 proves a cause (unit tested).

## 6. Tutorials (`web/src/onboarding.ts`, `web/src/Tour.tsx`)

- Explorer: the existing 12 steps (finish step now mentions the Experience switch). Keeps the original key
  `terra-scope:onboarding:v1`, so people who already finished the first tour are not asked again.
- Scientist: 10 technical steps (product, period and sufficiency, cell-wise FDR map, regional analysis,
  decision basis, Contradiction Hunter rule, Method Advisor, reproducible report). Key
  `terra-scope:onboarding:scientist:v1`. Targets exist on their pages (unit tested); a new `data-tour="result"`.
- The tour starts automatically once after the experience choice if that mode's tour was never completed.
- Switching mode in the app never starts a tour; it shows "Take a quick tour of X Mode?" with Start tour / Skip.
- Replay Tutorial replays the tour of the current mode.

## 7. Chat (Gemini and Template)

- `ChatRequest.audience_mode`: `"explorer" | "scientist" | null` (validated; other values return 422). The
  frontend sends the current mode with every chat request. `null` keeps the original wording.
- Template Mode: Explorer gets plain glossary answers (`FAQ_PLAIN`) and an "In short:" lead; Scientist gets the
  technical answers plus "Decision basis: raw Seasonal Mann-Kendall p = ..., alpha = 0.05; the significance
  criterion is met / not met". New reviewed answers: BH-FDR scope, significance basis, what to investigate next.
- Gemini: the audience is passed in the model payload and only changes the wording of education answers
  (system prompt rule). Data answers are still built from approved statements; the same audience frame is then
  added from the backend verdict (`with_audience`), without touching evidence. Live check, Mekong Delta IMERG
  2001 to 2024: both modes return slope 3.43 and p 0.077, Explorer starts "In short: ... not strong enough to
  confirm", Scientist ends "the significance criterion is not met".
- Unchanged: grounding validator, tool bounds, statistical rules, evidence authority.

## 8. Reports

The Report page follows design "Form D" (canvas https://claude.ai/artifact/GAfJhVUTjgLx4XJrHyTFyD, page Form D):
a three-step wizard in `web/src/pages/Report.tsx`, with the printed editions in `web/src/report/EditionDoc.tsx`
and pure helpers in `web/src/report/formd.ts`.

1. Who will read it: Simple or Scientist edition (defaults to the current Experience).
2. Pick findings: every Explore and Hunt result, tick to include, arrows to reorder; findings with insufficient
   data start unticked.
3. Preview and download: Simple / Scientist switch, report title and author, optional reworded finding titles
   (a warning appears when a title overclaims, contradicts the verdict or states a cause), author notes (printed
   as "not part of the evidence"), quick check, Download PDF, Text (.md), Data file (.json), saved cases.

Both editions use an academic register: abstract, numbered results with figures, formal result statements
("the null hypothesis of no monotonic trend is not rejected; this outcome does not demonstrate the absence of a
trend"), criteria for a significant difference, limits of inference, methods, references (Mann 1945, Kendall
1975, Hirsch et al. 1982, Sen 1968, Hamed and Rao 1998, Benjamini and Hochberg 1995, plus the NASA products).

- Simple edition: cover with abstract and key findings, one result page per finding (title, Sen slope, result
  statement, annual-mean figure drawn from the monthly anomalies for readability, position of the raw p-value
  relative to alpha), comparison pages, and a closing page with methods, limitations, a technical appendix of
  every number, four defined terms and references.
- Scientist edition: cover with abstract and Table 1, result pages with monthly anomaly figure, statistics split
  into "Used for the verdict" and "Context only", study-region map, comparison pages with figure and table, the
  Methods and provenance page and a references page.
- The edition and the wording never change a number or a verdict; the Markdown export contains the full
  statistics for both editions and the JSON export does not depend on the edition (unit tested).

## 9. Accessibility

Real buttons with `aria-pressed` for the switches, `aria-expanded` / `aria-controls` for glossary buttons,
labelled groups, focus moved to the choice heading, reduced-motion support, no horizontal scroll at 375 px
(checked in the browser), no long dash characters in new copy.

## 10. Tests

| Suite | Result |
|---|---|
| Backend unit (`pytest backend/tests`) | 254 passed (7 new in `test_audience.py`) |
| Frontend unit (`npm test`) | 43 passed (11 new: `tests/audience.test.mjs` and Explorer renders in `pages.test.mjs`) |
| Typecheck and build | pass |
| Browser e2e (`npm run e2e`, headless Chrome, real data) | 11 passed (new: experience choice, mode switch keeps the analysis with no new request, Plain-language then Scientific report) |
| Live API e2e (`pytest backend/tests_e2e`) | 13 passed, 5 skipped (billable Gemini checks need `TERRA_E2E_GEMINI=1`) |

New checks include: preference storage and fallbacks, `#start` routing, separate tour completion, Scientist
tour targets, glossary coverage and forbidden claims, identical numbers in both Markdown styles, experience
choice has no default, Explorer renders keep backend numbers and never upgrade a non-significant result, chat
audience validation, identical evidence across audiences, plain vs technical glossary answers, Scientist method
questions answered, model payload carries the audience only as wording, frame applied once.

## 11. Browser QA (in-app browser, real backend and NASA data)

- New visitor: Get Started opened `#start`; both cards shown; "Continue as Scientist" opened Explore with the
  Scientist tour (step 1 of 10); preference stored as `scientist`; Skip stored Scientist tour completion.
- Mekong Delta IMERG 2001 to 2025 (0.5 degree grid): Scientist view showed +4.23 mm/month per decade, raw p
  0.041, adjusted p 0.148, OLS interval -1.02 to 17.4; switching to Explorer showed the same numbers, 0 new API
  requests, and offered the Explorer tour.
- Glossary button opened the Sen slope definition (`aria-expanded=true`).
- Report: Plain-language and Scientific both contain +4.23 and 0.041; plain has the technical appendix,
  Scientific keeps "not a Sen confidence interval"; no horizontal overflow.
- Mobile 375 x 812: experience switch visible at the top, no horizontal scroll.

## 12. Limitations

- Copy for Explorer is written in English only, like the rest of the UI.
- Gemini data answers stay built from approved statements; the audience changes the frame, not those statements.
- Replay Tutorial is in the sidebar, which is hidden on phones (unchanged behaviour).
- The PDF for both styles uses the browser print dialog (no server-side PDF).
- The Forecast page keeps its own structure; it only follows the Experience switch.
