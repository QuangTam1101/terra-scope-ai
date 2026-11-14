# Phase 5: Scientific Method Advisor and Statistical Trust

Date: 2026-11-14. Branch: `feature/chat-foundation`. Existing uncommitted Phase 3/4/live repair work
was preserved. No commit/push, dataset, statistical algorithm, real environment file, dependency,
launcher or NTFS permission change was made. Phase 6 was not started.

## Sequential checkpoints

| Milestone | Validation | Result |
| --- | --- | --- |
| 5A | 184 backend tests; frontend typecheck/build | Deterministic reference-only advisor, seventh safe tool, typed rules/method status |
| 5B | 191 backend tests | Explicit decision basis, direction vs inference, missing metadata, uncertainty caveats |
| 5C/final | 202 backend tests; 8 frontend tests; typecheck/build; pip check | Chat/agent/panel integration, NASA regression, Template and live advisor checks |

Passing software tests does not scientifically validate the methods or their assumptions.

## Actual statistical implementation audit

| Capability | Implementation/evidence | Interpretation |
| --- | --- | --- |
| Regional Seasonal MK | `pipeline/trends.py:trend_one`, `mk.seasonal_test(period=12)` | Uses raw monthly series, compares matching calendar months; no automatic seasonality diagnostic |
| Seasonal Sen slope | Seasonal test slope multiplied by 10 | Rate per decade, original response units preserved; distinct from the significance decision |
| Regional raw verdict | `service._compute_trend`, `p_value < alpha` | Uses raw Seasonal MK p, with `autocorrelation_adjusted=False`; policy unchanged |
| Hamed-Rao adjustment | `mk.hamed_rao_modification_test` on monthly anomalies | Separate computed p-value when finite/sufficient; not used for the regional verdict |
| OLS slope interval | `scipy.stats.linregress` on anomalies, Student-t multiplier times standard error | OLS estimator interval, not a Sen interval; no HAC/Newey-West covariance |
| Ordinary MK | Library capability, not exposed as a standalone regional operation | Requiring review, never marked as applied to the regional result |
| Sen-targeted interval | Not supplied by the regional backend | Unsupported; do not relabel the OLS interval |
| Grid MK/Sen | `pipeline/grid.py:grid_trend`, vectorized seasonal calculation | Raw cell p-values; no serial-dependence correction; tie correction omitted |
| Grid FDR | `bh_fdr(p)` over full finite variable/time grid before bbox slicing | BH q-values drive `q < alpha`; FDR does not repair invalid marginal test assumptions |
| Regional completeness | At least 10 distinct years with observations and 70% requested months present | Missing months and coverage are exposed; not a representativeness guarantee |
| Spatial coverage warning | Regional mean valid cell fraction below 0.5 | Existing warning threshold only; not a newly invented cutoff |
| Grid completeness | At least 10 years with any finite month | No equivalent 70% monthly completeness requirement; must not import regional thresholds |
| Region comparison | Existing `pair_difference_test`, Hamed-Rao on anomaly difference and moving-block bootstrap interval | Separate between-region test; not replaced by regional advisor conclusions |

Primary references consulted:
[pyMannKendall documentation](https://github.com/mmhs013/pyMannKendall) and
[SciPy linregress](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.linregress.html).
The local code above, not a method name in a paper or UI, establishes what actually ran.

## Contracts and execution safety

New `scientific_schemas.py` defines `MethodGuidance`, `ScientificRule`, `MethodAdvice` and
`TrustAssessment`. Each guidance item has a deterministic method ID/status, rule ID, explanation
and evidence references. Applied, recommended, available-not-applied, unsupported and requiring-review
states are distinct. Recommendations never imply another computation.

`advise_statistical_method` accepts only `{ "analysis_id": "<existing trend ID>" }` through a strict
Pydantic schema. It reads server-stored evidence and performs no new numerical calculation. Unknown
or expired references fail safely; client summaries, code, URLs and extra properties are rejected.
The existing 4096-byte argument and 65536-byte result bounds and agent limits remain in effect.
The agent additionally binds the reference to the selected dataset, variable, region and period.
No new public analysis endpoint was added.

Advice includes `trust_assessment`. Chat evidence adds optional `scientific_advice`; the original
`TrendResponse`, numerical fields and existing `/explain` contract are unchanged. No trust percentage
or score is generated. `limited` means auditable evidence with stated limitations, not invalid data;
`requires_review` surfaces unknown decision basis, missing metadata or conflicting labels/verdict.
`not_assessed` applies when significance cannot be interpreted. A supported decision basis does not
imply verified independence or a scientifically validated analysis.

`trust.assess_trend` derives estimated direction from the reported slope, not the legacy `no_trend`
label (which can merely mean non-significant). It preserves raw and adjusted p-values and the actual
raw-test verdict, flags OLS/Sen interval mismatch, missing provenance, incomplete data, model/reanalysis
context and existing quality notes. Missing metadata is explicit. It never overwrites statistics.

`trust.assess_grid` is an internal typed helper for existing `GridResponse`, with FDR, serial-dependence,
tie and completeness caveats. It does not launch a global grid calculation and is not an LLM grid tool.
Regional advice explains this separate grid policy without claiming a grid was computed for the chat.
GridResponse itself lacks product provenance and serial-dependence diagnostics; these remain explicit
limitations, not fabricated fields.

## Detective integration

- Gemini receives the real seventh function declaration and uses normal FunctionCall/FunctionResponse
  orchestration. Advisor calls require matching server context. Composition selects only the reviewed
  topic explanation. Statistical decisions and numeric values remain deterministic.
- Template Mode directly executes the same registry tool. Method, FDR, dependence, interval and causal
  questions preserve compatible context and reuse verified evidence. Generic guidance without an
  analysis states explicitly that no computation was performed. A conflicting/expired reference asks
  for a valid analysis instead of borrowing another result.
- The p-value explanation remains distinct from CI, Sen slope, adjustment, FDR and significance.
  No causal inference is made from a temporal trend. A positive non-significant slope remains positive
  descriptively; non-significance is not proof of zero trend or a probability that the null is true.
- `ScientificPanel` uses native details/summary with labeled sections for applied methods,
  recommendations, unavailable methods, assumptions, verdict and limitations. Long references wrap.
  Existing mascot, chat, retry, clear, context and navigation remain.
- A confirmed visualization defect was fixed: TrendChart drew an OLS slope interval around a Sen line
  and labeled it the line's confidence band. That band is removed because the API supplies no valid
  Sen-targeted band. The Sen line remains; the numerical OLS interval remains in evidence/Explore/Report
  with explicit labels. Report wording now distinguishes raw monthly Seasonal MK from anomaly-based
  Hamed-Rao/OLS. No estimator, slope or CI number was changed.

## Validation record

- Backend: **202 passed**; no live network permitted during unit tests. Mock protocol tests cover
  advisor execution, context binding and original chat/explain compatibility. Rule tests cover monthly
  guidance, adjustment availability, positive/negative non-significant slopes, significant raw decisions,
  conflicts, missing provenance/observations, FDR caveats and OLS/Sen distinctions.
- Frontend: **8 passed**, including React SSR of the scientific panel and seven existing navigation
  checks. Typecheck and production build passed. The approximately 504 kB chunk warning remains.
- `pip check`: no broken requirements. No new dependency or lockfile change.
- Actual NASA reference through localhost matched: slope `3.163604736328125 mm/month/decade`,
  raw p `0.11031644898805326`, significance `false`, 288 valid months; positive but not significant.
- Eight Template scientific questions through Vite passed with the same original NASA evidence.
- Under the user's continuing live authorization, exactly one Phase 5 Gemini chat was made:
  "Why use Seasonal Mann-Kendall?" returned `mode=llm`, successful `advise_statistical_method`,
  `trust=limited`, and unchanged NASA evidence. This verifies the new tool live, not every future query.
- UI interaction remains **not tested**: browser inventory reported the browser access host unavailable.
  SSR markup, wrapping rules and HTTP checks do not certify real keyboard, screen reader, mobile
  viewport behavior or interactive navigation. Manual browser QA remains necessary.
- A first PowerShell assertion falsely failed despite matching printed NASA numbers; the numerical
  check was replaced by a Python smoke using explicit tolerances and typed boolean/count assertions.
  No statistic was changed to satisfy a test.

## Files changed in Phase 5

Added:

- `backend/app/scientific_schemas.py`, `backend/app/advisor.py`, `backend/app/trust.py`
- `backend/tests/test_advisor.py`, `backend/tests/test_trust.py`, `backend/tests/test_scientific_chat.py`
- `backend/scripts/smoke_science.py`, `backend/PHASE_5.md`
- `web/src/ScientificPanel.tsx`

Modified:

- `backend/app/schemas.py`, `backend/app/tools.py`, `backend/app/agent.py`, `backend/app/conversation.py`
- `backend/app/llm/function_calling.py`
- `backend/tests/test_tools.py`, `backend/tests/test_agent.py`, `backend/tests/test_detective_repair.py`
- `web/src/api.ts`, `web/src/pages/Detective.tsx`, `web/src/TrendChart.tsx`
- `web/src/pages/Explore.tsx`, `web/src/pages/Report.tsx`, `web/tests/chatNavigation.test.mjs`
- Backend and frontend README links

These are additive edits to existing dirty work. Other uncommitted Phase 3/4 files are not new Phase 5
changes. `service.py`, pipeline algorithms, cubes, launcher, Vite config and real `.env` were untouched.

## Local commands

```powershell
Set-Location 'D:\Projects\terra-scope-ai'
& '.\scripts\start-local.ps1' -Mode Gemini
# Explicit deterministic fallback:
& '.\scripts\start-local.ps1' -Mode Template
.\.venv\Scripts\python.exe backend/scripts/smoke_science.py --mode template
# After switching back to Gemini; one billable chat, no retries:
.\.venv\Scripts\python.exe backend/scripts/smoke_science.py --mode gemini --approve-billable
# Stop only launcher-owned servers:
& '.\scripts\start-local.ps1' -Stop
```

Frontend: http://localhost:5173/#detective. Backend: http://127.0.0.1:8000/docs.
The final running provider remains Gemini, model `gemini-4-argon`.

```powershell
.\.venv\Scripts\python.exe -m pytest -q backend/tests
.\.venv\Scripts\python.exe -m pip check
Set-Location '.\web'
npm test
npm run typecheck
npm run build
```

Safe review: `git status --short`, `git diff --stat`, `git diff --check`,
`git ls-files --others --exclude-standard`. Ordinary diff omits new files; review them individually.
Do not print or stage `backend/.env`, reset mixed work, or infer scientific validation from test counts.

## Review before Phase 6

A statistician should review serial dependence, whether/how the regional verdict should use adjusted
evidence, grid tie/completeness policies, validity of FDR assumptions, and interval estimator choice.
Any future policy or estimator change needs explicit scientific review and regression baselines.
Generic method advice is conditional, not an automatic optimal-method selector or assumption diagnostic.
Phase 6 is a recommendation for later work, not part of this implementation.
