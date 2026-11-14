# Phase 6C QA record and manual Chrome checklist

Date: 2026-11-14. Status: **partially verified**. Phase 6B remains **pending scientific approval**.
The browser tool returned `The browser access host is unavailable`; no native-app bypass was attempted.
No browser console, real click, download, screenshot, screen-reader session, device viewport or map
interaction is claimed to have passed.

## Available verification

| Area | Passed | Not verified |
| --- | --- | --- |
| Home | Offline React SSR, semantic controls, navigation planning logic | Actual Start/example button clicks and rendered layout |
| Explore | SSR with selected series/trend/source, raw/diagnostic p labels; routing tests | Dataset/place control interaction, map layers, real chart resize, request timing |
| Hunt | SSR region controls; real two-region comparison via Template conversation smoke | Real selection/click and chart interactions |
| Detective | SSR conversation log/evidence; panel SSR; 7-step Template flow, 8 scientific Template questions, one live Gemini advisor request | Focus, long-chat scrolling, actual retry button, card navigation clicks, narrow viewport layout |
| Report | SSR selected history, provenance, interval/p labels, export button; export method wording reviewed | Markdown download and print/PDF dialogs; exported file integrity after actual download |
| API | Backend health/docs, frontend/proxy, real regional series/trends/compare/provenance; client timeout+retry mocked offline | Browser network/console behavior under a real outage |
| Accessibility | Native details/summary, role log/status/alert, focus-visible CSS, seven sampled text-palette pairs ≥4.5:1 | Full DOM contrast, disabled controls, icons/maps, keyboard traversal, screen reader and mobile/touch audit |

Backend: **224/224 passed**, including **22 independent numerical/characterization audit cases**.
Frontend: **16/16 passed** (panel, navigation, five-page SSR, hash routing, timeout/retry, sampled palette).
Typecheck/build passed; `pip check` found no broken requirements. Unit/component tests make no live
Gemini calls. SSR uses a separate temporary Vite cache and stub store/fetch, preserving the actual dev
server/cache. These tests do not execute browser effects or event handlers.

## Safe presentation and behavior fixes

- Route-level lazy loading defers Explore, Hunt, Detective and Report until needed. Home remains eager.
  A status fallback and recoverable chunk-error boundary prevent a failed lazy module from silently
  blanking the app. Reload explicitly warns that session chat/results clear.
- Production entry JS decreased from **503.61 kB (171.29 kB gzip)** to **386.16 kB (131.27 kB gzip)**.
  Analysis pages and shared chart code are separate chunks. The 500 kB warning is gone with unchanged
  build settings. This defers code the Home page does not need; it is not a measured browser speedup.
  Geographic place lookup remains in the shared bundle because `store` imports `pointPlace` from the
  countries/place catalog. Further splitting requires profiling, not arbitrary warning suppression.
- Direct unknown hashes now resolve to Home rather than an empty page; hashchange synchronizes
  browser back/forward navigation with app state. Existing routes and navigation parameters are retained.
- Explore labels raw Seasonal MK p as the verdict basis and adjusted p as a separate diagnostic.
- Report export wording matches the actual regional raw policy, separate HR, OLS-targeted interval
  and temporally unadjusted grid BH-FDR. Removed an unsupported specific process claim about GLDAS
  from the generic caveat; product documentation remains authoritative.
- Charts have max-width containment and allow vertical touch scrolling. Long chat text and numeric
  pills can wrap; reduced-motion preference disables skeleton animation. No chart numeric geometry,
  estimator, scientific threshold, source cube or verdict was changed.

## Live and NASA checks

Current model/provider: **Gemini / gemini-4-argon**. A single Phase 6 live chat,
`Why use Seasonal Mann-Kendall?`, returned `mode=llm`, successful `advise_statistical_method`,
`trust=limited`, and identical deterministic NASA evidence. Tool results are only populated through
the actual allowlisted planner execution path; offline unit mocks are not counted as live proof.
No repeated live retries or load test was performed.

Template conversation: trend → p-value → significance → positive slope → plot → Hanoi comparison →
provenance, **7/7 passed**. Scientific Template questions **8/8 passed**. The numerical NASA reference
remains 288 valid months, slope `3.163604736328125 mm/month/decade`, raw p `0.11031644898805326`,
`significant=false`. The answer does not claim a significant precipitation increase.

## Manual Chrome checklist (all items pending actual browser execution)

Use normal Chrome at `http://localhost:5173/`. Open DevTools Console and Network, preserve log, then
test desktop **1440×900**, tablet **768×1024**, mobile **375×812**, and a **320px** narrow viewport.
Record observed results and screenshots instead of checking boxes merely from source inspection.

1. **Home / navigation:** select every page with mouse and Tab/Enter; check active desktop/sidebar and
   mobile tabbar, direct hashes, Back/Forward, reload and `#unknown` fallback. Confirm no React errors,
   failed dynamic chunks or horizontal page overflow.
2. **Explore setup:** choose precipitation → GPM IMERG, Mekong Delta, 2001–2024. Run once; verify units,
   provenance, period, 288 valid months, non-significance, slope/raw p from the reference above. Test
   supported temperature/model choices without confusing GLDAS/MERRA with direct observations.
3. **Chart:** switch Values/Anomaly; check series and dashed Sen line, explicit separate OLS interval,
   absence of a Sen confidence band, tooltip readability, and resizing. At mobile width drag/scroll
   vertically over the chart and confirm the page is not trapped. Do not label display precision as
   exact statistical precision.
4. **Map:** test Values layer, legend, region click and bbox selection; then test one Trend layer and
   q/FDR legend. Cold trend maps can trigger an existing full-grid computation; avoid repeatedly
   changing periods/variables as a load test. Record first vs cached response time. Confirm region
   selection, data masks and estimate/significance colors are not conflated.
5. **Hunt:** choose Mekong and Hanoi with same variable/period. Check both series, separate regional
   estimates and anomaly-difference statistical test. Same/opposite descriptive signs alone must not
   imply a significant difference. Verify both selected regions persist when opening Hunt from chat.
6. **Template:** start `-Mode Template`; run the seven-step conversation above and the method/CI/FDR/
   causality questions. Inspect evidence/source and expand Methods and limitations using Enter/Space.
   Applied vs recommended labels must remain separate. P-value must not turn into an unrelated CI answer.
7. **Gemini:** start `-Mode Gemini`. Use one NASA/method question and confirm actual `mode=llm`,
   `tool_executed` safe backend diagnostic and evidence. A Template fallback is not a Gemini success;
   inspect warnings, stop repeated retries on quota/network failure, never expose the key.
8. **Context/navigation:** open the matching Explore, Hunt and Report actions; check exact dataset,
   regions and whole-year period. A month-specific context should remain in Detective with an accurate
   limitation rather than rounding silently. Change selection and ensure stale evidence is not reused.
9. **Loading/error/retry:** temporarily use DevTools offline for localhost requests, submit once,
   inspect loading and accessible error, restore connection and click retry once. Ensure no double
   submission, unrelated prior result navigation or stuck busy state. Frontend abort limits waiting;
   native backend computation may finish afterward under existing resource guards.
10. **Long content:** ask several bounded follow-ups, expand the largest panel, inspect long product
    descriptions and source IDs at all viewports. Verify wrapping, usable input, scroll access to the
    newest response and Clear chat. Check that Clear preserves other page results as designed.
11. **Report:** verify selected history values, actual period, units and source. Download Markdown and
    open the file; compare p, verdict, OLS label and NASA links with the screen. Test Print / save PDF
    manually, including pagination/table clipping. **Export remains unverified until these actions pass.**
12. **Accessibility:** Tab/Shift+Tab through navigation, form, details, source links, retry and export;
    confirm visible focus and no keyboard trap. Test a screen reader's heading order, conversation
    announcements and chart description. Contrast-check actual rendered states including hover,
    disabled controls and color-only map encodings; sampled palette checks are not full WCAG compliance.

## Approval and statistical limits

No Phase 6B statistical patch is active. In particular, raw vs adjusted regional decisions, grid ties,
coverage rules, BH family/serial assumptions and OLS intervals remain as audited. Both Đăng and the
project owner must approve exact statistical method/scope before changes. See
`PHASE_6_CORRECTION_PROPOSAL.md`. Do not call Phase 6 scientifically validated while this is pending.

## Files changed in Phase 6

Added:

- `backend/audit/reference.py`, `backend/tests/test_independent_audit.py`
- `backend/scripts/audit_phase6.py`, `backend/PHASE_6_AUDIT_RESULTS.json`
- `backend/PHASE_6_SCIENTIFIC_AUDIT.md`, `backend/PHASE_6_CORRECTION_PROPOSAL.md`, this QA record
- `web/src/pageRouting.ts`, `web/tests/pages.test.mjs`

Modified:

- `web/src/App.tsx`, `web/src/store.tsx`, `web/src/TrendChart.tsx`, `web/src/styles.css`
- `web/src/pages/Explore.tsx`, `web/src/pages/Report.tsx`, `web/package.json`
- Backend/frontend README links

Other dirty files predate this task. Production statistical code hashes match the audit baseline;
no NASA files, real `.env`, requirements, lockfile, Vite config, launcher or ACL were changed.
No commit, push, reset or rebase. Phase 7 was not started.

## Local commands

```powershell
Set-Location 'D:\Projects\terra-scope-ai'
& '.\scripts\start-local.ps1' -Mode Gemini
# Explicit deterministic mode:
& '.\scripts\start-local.ps1' -Mode Template
# Stop only launcher-managed servers:
& '.\scripts\start-local.ps1' -Stop

.\.venv\Scripts\python.exe -m pytest -q backend/tests
.\.venv\Scripts\python.exe -m pip check
Set-Location '.\web'
npm test
npm run typecheck
npm run build
```

Final localhost is left in Gemini Mode at `http://localhost:5173/`, backend
`http://127.0.0.1:8000/docs`. The immutable audit script refuses to overwrite the existing JSON record;
do not delete baseline artifacts just to repeat it. Use a separately named artifact for a later review.
