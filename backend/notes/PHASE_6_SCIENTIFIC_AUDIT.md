# Phase 6A independent scientific audit

Status: **completed for the bounded audit scope**. Date: 2026-11-14.
Branch: `feature/chat-foundation`. Statistical production changes: **none**.
This is software/numerical characterization, not external validation of NASA data or all inference assumptions.

## Reproducibility and scope

`PHASE_6_AUDIT_RESULTS.json` records installed package versions, eight protected code SHA256 hashes,
three actual NASA regional checks, and an isolated synthetic tie-correction comparison.
`scripts/audit_phase6.py` refuses to overwrite that artifact. All cube sizes/mtime values were unchanged
during the audit. Cubes were opened read-only; no global trend map was recomputed. Cube metadata
checks are not full-file cryptographic integrity proofs or upstream reprocessing validation.

Independent formulas reside only in `backend/audit/reference.py`; production does not import them.
Twenty-two audit tests pass. Absolute numerical tolerances are 1e-12 for S/variance/z/p/slope and OLS
checks, 1e-15 for BH, and 1e-10 for unit conversions/NASA regression. Very small p-values use a
two-sided normal survival function; pyMannKendall's subtraction from one can underflow, so tests
do not assert meaningful relative accuracy for probabilities near machine precision.

## Analytical pipeline map

| Stage | Code | Actual operation |
| --- | --- | --- |
| NASA products | `pipeline/giovanni_adapter.py:HOSS_VARIABLES`, `backend/app/catalog.py` | GPM_3IMERGM V07 precipitation; GLDAS Noah 2.1 land model; MERRA-2 M2IMNXASM 5.12.4 reanalysis |
| Native monthly files to cube | `pipeline/giovanni_adapter.py:read_grid_file/build_cube` | Transpose to time/lat/lon, block means onto 1 degree grid, reindex global centers, month-start labels, unit conversion, float32 output |
| Unit conversion | `pipeline/units.py:convert_units`, adapter `convert_cube` | IMERG rate ×24×days/month; soil kg/m2 /100 for 0–10 cm; K−273.15; evap flux ×86400 to mm/day; source unit assertion |
| Cube loading | `backend/app/bridge.py`, `pipeline/api.py:load_cube` | Existing processed cube read; legacy loader loads full cube in memory even for a bounded regional request |
| Variable/region selection | `catalog.py`, `service.get_variable/resolve_region` | Catalog ID mapping, preset or spatial bbox; point/polygon reduced to spatial selection with warnings |
| Spatial aggregation | `pipeline/grid.py:region_series` | Inclusive center selection in bbox, cos(latitude) weights, renormalize over available cells each month; fraction is unweighted valid-cell count |
| Temporal handling | `service._check_time/_region_values` | Reindex every requested month, missing observations kept as NaN; no region interpolation; no observations is an error |
| Regional trend | `pipeline/trends.py:trend_one`, `service._compute_trend` | Seasonal MK/Sen on raw monthly sequence; anomaly HR and OLS diagnostics; significance suppressed below completeness threshold |
| Regional verdict | `service._compute_trend` | Raw seasonal p < request alpha (default .05), not adjusted p; legacy direction label can say no_trend for a nonzero nonsignificant slope |
| Grid trend | `pipeline/grid.py:grid_trend` | Separate vectorized seasonal S/variance/Sen implementation; whole years; no tie variance correction, no HR; ≥10 observed years, not regional 70% rule |
| Grid FDR/API | `pipeline/trends.py:bh_fdr`, `bridge.grid_result`, `service.trend_grid` | BH on finite raw cell p across full variable/time grid before bbox crop; q < alpha drives mask |
| Comparison/Hunt | `pipeline/contradictions.py:pair_difference_test`, `service.compare` | Nonseasonal Sen of anomaly difference, HR MK on difference, 1000 residual block bootstrap samples (12-month blocks, seed 0); significant needs p < alpha AND CI excludes zero |
| API/evidence | `schemas.py`, `web/src/api.ts`, Detective/Explore/Report | Original raw and adjusted values, quality, source, estimator labels; OLS interval now separate from Sen line |
| Gemini | `tools.py`, `agent.py`, `llm/grounding.py`, `advisor.py`, `trust.py` | Allowlisted execution, reference binding, bounded evidence; approved deterministic sentences decide numeric conclusions, not model confidence |

## Seasonal MK and slope details

Installed pyMannKendall 1.4.3 reshapes monthly observations into 12 seasonal columns (pads a partial
last year with NaNs), skips NaNs within each column, sums pair signs S and tie-corrected within-season
variances. It uses a continuity-corrected normal z and two-sided p. The reference calculation assumes
cross-season covariance is absent; no claim is made that actual climate data satisfies that assumption.
`period=12` is positional: correct monthly reindexing is essential. Backend regional extraction performs
that reindexing. Seasonal slopes pool within-month pairs with elapsed year positions and multiply by
10, not 120. Nonseasonal monthly difference slopes in Hunt multiply by 120. Slopes of monthly rainfall
amounts retain mm/month per decade, not annual precipitation totals.

Grid computes the same S and pooled pair slopes on complete years, with independent-season variance
without ties. Missing values keep year spacing for slope pairs. A 12-year fixture with observations
only in January passes the grid's year-count rule, while the regional 70% rule rejects inference.
Constant grid and regional series return slope 0 and p=1; fewer than ten grid years yields NaN p.
A short regional series can have a numerical p internally but is marked insufficient and its API
significance suppressed. An all-missing direct library call raises ZeroDivisionError; the regional
API rejects no-observation selections before inference. No missing/degenerate result proves the
absence of a physical trend.

## Serial dependence and uncertainty

HR is **a separate MK on anomalies**, not a variance adjustment to the computed Seasonal MK statistic.
Installed HR removes NaNs, detrends using Sen slope, ranks residuals, computes an ACF, and by default
considers lags 1 through n−1; only lags outside ±normal quantile/sqrt(n) contribute weighted variance
inflation/deflation. The call uses library alpha .05 for lag selection even if API decision alpha is
different. Missing observations are compressed for HR's lag sequence; calendar gaps are not retained
as explicit missing lags. Neither calibrated Type I error under realistic missingness nor an optimal
lag policy has been established by this audit. Regional selected verdict remains raw seasonal p.

OLS regresses monthly anomalies against elapsed days/365.25. The interval half-width is a Student-t
quantile times ordinary regression slope standard error. No HAC, residual block bootstrap or Sen
targeted interval is used here. A manual centered least-squares calculation matches its numbers; this
does not validate interval coverage under serial dependence. Current UI has no OLS-as-Sen shaded band.

## FDR

BH sorts finite p-values, computes ordered m*p/rank, reverse cumulative minimum and caps at one.
NaNs/masked cells remain NaN and do not enter m. Independent SciPy BH matches. Only finite, valid
probabilities generated by the test are meaningful inputs; the internal helper does not separately
validate a finite out-of-range caller value. Grid cells have no serial correction before BH. Spatial
dependence must be assessed (BH's independence/positive-dependence conditions are not demonstrated);
BY is an option for review, not an automatically superior deployed policy. Recomputing BH on a displayed
bbox would change the hypothesis family and is not the current behavior. No global grid or tested-cell
count for a NASA variable was recomputed here; m depends on the full finite mask for that variable/period.

## Bounded cross-product checks (actual local API/cube metadata)

All examples cover 2001-01 through 2024-12, 288 monthly observations, with units/product identity matching
the processed cube and catalog. Range checks are descriptive and do not establish scientific validity.

| Product / region | Regional observed range | Sen slope/decade | Raw p | HR anomaly p | Current verdict |
| --- | --- | --- | --- | --- | --- |
| IMERG / Mekong | 1.614118–575.677673 mm/month | 3.163604736328125 | .11031644898805326 | .4504139636836846 | false |
| GLDAS soil / Mekong | .140739–.393796 m3/m3 | −.00083962585881441 | .6011759045831846 | .9781397271857428 | false |
| MERRA-2 T2M / Hanoi | 10.533197–29.41189 degC | .27617021040483114 | .00019104258527824491 | .05218531994054265 | true |

These are regional averages, not global extrema. The values fall within broad physically possible
ranges for the quantities, but have not been compared with independent stations. NASA source files
were not redownloaded, so processing correctness is checked by code, metadata and dimensional fixtures,
not by a native-file replay. February leap-year conversion is independently checked. IMERG is a merged
precipitation estimate, GLDAS a land-model product, and MERRA-2 a reanalysis; none is a local station record.

## Findings register

| ID / severity | Location | Current vs expected / evidence | Impact and recommended action | Approval / regression |
| --- | --- | --- | --- | --- |
| S01 High, policy uncertainty | `trends.trend_one`, `service._compute_trend` | Raw Seasonal MK drives verdict; separate anomaly HR differs. MERRA example crosses .05 between diagnostics. Expected: explicitly approved dependence policy, not silent field substitution. | Can change interpretation. Review target hypothesis, seasonal/serial dependence and lag choice; shadow compare first. | Both approvals required; preserve all three NASA baselines and AR/missing fixtures. |
| S02 High, confirmed implementation difference | `grid.grid_trend` | Grid omits tie variance correction; reference fixture p=1.4887711743154682e−37 vs tie-corrected 3.304006476300492e−40, same S=648/slope=3.333333333333333. | Tested tie case has larger current p; direction of arbitrary downstream impacts not quantified. Review tie correction before changing maps/FDR. | Required; independent tied/untied S/variance/p and map shadow fixtures. |
| S03 High, confirmed policy difference | `grid.grid_trend` vs `service._insufficient` | 12 Januaries in 144 months can get grid inference; regional rule rejects 8.3% completeness. | Sparse grid inference may be misleading. Choose documented common or deliberately separate coverage policy. | Required; missing-by-season and 70% boundary tests. |
| S04 High, methodological limitation | `grid_trend`, `bh_fdr` | FDR uses temporally unadjusted p; spatial dependence assumptions not demonstrated. | Do not claim fully corrected significance. Review marginal validity and family/dependence before choosing BH/BY. | Required; calibrated synthetic dependence study and stable finite mask/family tests. |
| S05 High, interval limitation | `trends.trend_one` | Ordinary OLS anomaly interval is not Sen uncertainty; no HAC. Independent OLS arithmetic matches, coverage is untested. | Keep estimator labels; choose HAC for OLS or separately justified Sen-targeted interval. | Statistical change requires approval; interval coverage and estimator attribution tests. |
| S06 Medium, confirmed semantics | `service._compute_trend.direction` | no_trend can mean non-significance with nonzero slope. Advisor derives direction separately. | Preserve API compatibility; present estimated direction and test verdict separately. Do not equate lack of detection with zero slope. | Presentation fix allowed; changing API numeric/decision policy requires review. |
| S07 Medium, method uncertainty | installed HR + `pair_difference_test` | HR skips missing observations, potentially compressing calendar lags; bootstrap uses residual blocks with original gaps. | Assess robustness with structured missingness; do not label all serial dependence resolved. | Required for computational change; structured gaps and repeatability fixtures. |
| S08 Medium, confirmed estimator distinction | `contradictions.pair_difference_test` | Sen(anomaly A−B) is not generally Sen(A)−Sen(B); independent synthetic example proves nonlinearity. | Interpret difference estimator as a trend in paired anomaly differences, not exact subtraction of regional estimates. | Labels allowed; estimator changes require approval. |
| S09 Medium, provenance validation limit | adapter/catalog/cubes | Metadata and converted ranges agree; native NASA files were not replayed and changing spatial masks can change contributing area over time. | Preserve model/reanalysis attribution; obtain independent native/station QA and mask sensitivity review. | Reprocessing requires approval; units/calendar and mask-weight fixtures. |
| S10 Low/Medium, UI verification gap | all pages | Browser host unavailable in prior phases; HTTP/SSR does not verify actual controls/export/contrast. | Record current browser outcome, add component tests and manual matrix. | No statistical approval for presentation-only work. |

No critical incorrect NASA conclusion was independently demonstrated. Confirmed implementation
differences and methodological risks are not proof that a particular real-world trend is false.

## References

- [Installed reference package source](https://github.com/mmhs013/pyMannKendall/blob/master/pymannkendall/pymannkendall.py): seasonal MK/Sen and HR implementation; local installed source was inspected.
- [SciPy FDR documentation and BH/BY references](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.false_discovery_control.html).
- [SciPy ordinary least-squares regression](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.linregress.html).
- [NASA IMERG](https://gpm.nasa.gov/data/imerg), [NASA MERRA-2](https://gmao.gsfc.nasa.gov/gmao-products/merra-2/), and catalog product citations for GLDAS.

## Acceptance / next gate

Pipeline mapped; twenty-two independent/characterization checks pass; three real NASA products checked;
Mekong baseline unchanged. Production numerical code hashes remain unchanged. Phase 6B is pending
both Đăng and project-owner approval. See `PHASE_6_CORRECTION_PROPOSAL.md`; do not interpret the
isolated reference formulas as approved production patches.
