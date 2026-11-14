# Phase 6B decision package — pending scientific approval

No corrections to production statistics are implemented. Approval is required from **both Đăng
(statistics lead) and the project owner**, identifying candidate ID, exact method, policy, and scope.
No approval is inferred from the Phase 6 task, test success, or permission to call Gemini.

## Current vs proposed choices

| ID | Current | Proposed option for review (not deployed) | NASA impact / compatibility | Evidence and required tests |
| --- | --- | --- | --- | --- |
| C1 | Grid variance has no tie term | Subtract per-season sum t(t−1)(2t+5)/18 before summing variances; handle zero variance explicitly. | Grid p/q/masks can change; regional slopes and raw p remain unchanged. Full NASA grid impact is not quantified because no global shadow run was authorized/performed; do not approve deployment on the tiny fixture alone. Preserve v1 maps and add a versioned v2 result/cache key. | MK tie formula and installed seasonal reference; existing independent tied/untied tests. Test constant, ties, NaN masks and a bounded real-cell shadow before rollout. |
| C2 | Regional verdict uses raw Seasonal MK p | First approve a documented dependence-aware hypothesis/seasonal test design and lag/missing policy; compare raw vs separate HR diagnostically. Do NOT substitute HR blindly. | MERRA-Hanoi current raw p=.00019104258527824491 (significant) vs HR=.05218531994054265 (not below .05). IMERG raw=.11031644898805326 vs HR=.4504139636836846, both not significant. These HR values already exist; they are not a validated replacement policy. Version decision_basis and retain legacy verdict. | HR 1998 method as implemented, assumptions require review; AR seasonal/null calibration, structured missingness and all stored NASA baselines. |
| C3 | Grid ≥10 years with any valid month, regional additionally ≥70% requested months | Decide whether to align grid with regional coverage or retain explicit distinct criteria. Specify within-season coverage as well. | Sparse-cell masks and BH family size will change; p/q/coverage can change even elsewhere. The 12-January fixture is accepted by grid, rejected regionally. Keep old masks/outputs for comparison. | Existing sparse fixture; add exact threshold boundaries, uneven seasons, rolling masks and finite-family tests. |
| C4 | Ordinary OLS-anomaly interval, no HAC | Choose HAC uncertainty for OLS with reviewed bandwidth OR a separately validated seasonal Sen interval/bootstrap. Do not label HAC as Sen CI. | Bounds can change while seasonal Sen point estimate remains unchanged; add explicit estimator/method/version fields, no historical interval replacement. NASA before/after bounds cannot be supplied until the estimator/bandwidth is approved for a shadow implementation. | SciPy OLS baseline matches independent arithmetic. Add coverage simulations under dependence, seed reproducibility and separate estimator attribution tests. |
| C5 | BH across full finite grid of raw seasonal p | Establish marginal p validity first, then approve hypothesis family and BH assumptions or a more conservative alternative such as BY. | q/masks can change, not just selected viewport. No automatic BY switch or bbox-specific FDR. Document actual tested family size and retained mask. | Independent SciPy BH baseline, NaN/finite mask tests; assess spatial/temporal dependence under a reviewed simulation design. |

## Required approval record

For each candidate, record:

1. Đăng's explicit scientific approval and project-owner approval (names/date).
2. Target statistic/hypothesis, exact algorithm/reference, alpha and tuning parameters.
3. Approved shadow evaluation scope and deployment acceptance criteria.
4. Expected compatibility/version changes and NASA baseline retention.
5. Separate approval to deploy if the requested approval covers only shadow evaluation.

Recommended first decision: review the bounded evidence and approve or revise a **shadow evaluation
plan**, not immediate deployment of all five candidates. Current evidence does not establish a single
best replacement policy. Until both approvals are supplied, production statistical code, thresholds,
cube processing and historical scientific outputs remain untouched. Existing reference formulas are
isolated test fixtures only, not a production patch.

Phase 6B status: **pending scientific approval**. Independent Phase 6C presentation/QA work may proceed.
