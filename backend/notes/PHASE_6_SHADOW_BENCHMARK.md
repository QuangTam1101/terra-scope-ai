# Phase 6B shadow benchmark

Status: **shadow research only. Not production results. No production statistic, threshold, cube or API
output was changed.** Approval status for every candidate: **pending (Đăng + project owner)**.

- Date: 2026-11-14. Branch: `feature/phase6-scientific-validation`, base commit
  `1acedfe6b10a2d6b8b55604548718f6fffcaa58e` (`feature/chat-foundation`, synchronized with origin).
- Script: `backend/shadow/benchmark_phase6.py` (nothing in production imports it). Raw output:
  `backend/shadow/results/phase6_benchmark.json`. Seed `20261114`; total runtime 239 s on one laptop CPU.
- Reproduce: `.venv/Scripts/python.exe backend/shadow/benchmark_phase6.py --out <file>` (`--quick` for a smoke run).
- Versions: Python 3.11.17, numpy 2.4.6, scipy 1.17.1, pandas 3.1.1, xarray 2026.9.0, pymannkendall 1.4.3.
- "Current" methods are the production functions called read-only: `pipeline.trends.trend_one`,
  `pipeline.grid.grid_trend`, `pipeline.trends.bh_fdr`. "Shadow" methods come from `backend/shadow/methods.py`
  (existing, by the previous developer) or from the benchmark script (Newey-West HAC).
- Rates are shown as `rate ± Monte Carlo standard error` (binomial). Nominal alpha = 0.05.

## Simulation design

All synthetic series: 24 years × 12 months (288 months, the same length as the NASA reference period),
seasonal cycle `3·sin(2πm/12)`, unit-variance noise, linear trend `beta` in noise-SD units per decade.

| Noise scenario | Meaning |
| --- | --- |
| `iid` | Independent normal months |
| `ar1_0.3`, `ar1_0.6` | Monthly AR(1), lag-1 correlation 0.3 / 0.6 (adjacent months in the same year are correlated) |
| `year_effect` | iid months plus a shared interannual anomaly (AR(1) across years, rho 0.5, SD 0.6) added to all 12 months of a year (an ENSO-like regime). This violates the Seasonal MK assumption that the 12 seasonal sub-series are independent |

Additional designs: tied precipitation-like data (integer mm, 70% exact zeros in Jan to Apr) for C1;
missingness patterns for C3; a 15 × 15 grid with Gaussian spatial correlation (sigma 1.5 cells) and 25 true
trend cells for C5. A bounded read-only shadow on the real IMERG 1° cube (Mekong box, 432 cells) is included.

Not covered: real autocorrelation structure of each NASA product, non-normal heavy tails beyond the tie case,
nonlinear trends, step changes from input-data changes (relevant for GLDAS forcing and MERRA-2 assimilation).

---

## C1: grid tie correction

| | Type I error (tied null, n = 4000) |
| --- | --- |
| Current grid (no tie term) | **0.036 ± 0.003** (conservative) |
| C1 proposal (tie-corrected variance) | **0.048 ± 0.003** (nominal) |
| Regional production (pymannkendall, tie-corrected) | 0.048 ± 0.003 |

- Equivalence check: production `grid_trend` p-values equal the shadow no-tie formula exactly (max |Δp| = 0).
- Tie-corrected variance / current variance: median 0.873, minimum 0.771 for this tied design.
- **Real NASA bounded shadow** (IMERG, 432 Mekong cells, 2001 to 2024): max |Δp| = 0.00056,
  **0 cells change raw significance**. Cube size/mtime unchanged.
- Reference: Kendall (1975) tie-corrected variance; Hirsch, Slack & Smith (1982) seasonal Kendall test.
- Runtime impact: negligible (one `unique` per season and cell; must be vectorized for the global grid).
- Limitations: the real-cell check covers one product and one region at 1°; desert cells with many zero
  months (GLDAS, IMERG over the Sahara) will change more.
- **Recommendation: approve for a full-grid shadow run, then deployment.** It makes the grid match the
  regional library and nominal error, and is low risk. Deploy with a versioned cache key and keep v1 maps.

## C2: regional verdict and serial dependence

Rejection rate at p < 0.05 (n = 1000 for raw and HR, n = 300 for the bootstrap, 199 draws each).

| Scenario | beta (SD/decade) | Current raw Seasonal MK | HR anomaly diagnostic | Existing shadow year-block bootstrap |
| --- | --- | --- | --- | --- |
| iid | 0 (Type I) | **0.044 ± 0.006** | 0.116 ± 0.010 | 0.343 ± 0.027 |
| ar1 0.3 | 0 | **0.141 ± 0.011** | 0.115 ± 0.010 | 0.243 ± 0.025 |
| ar1 0.6 | 0 | **0.294 ± 0.014** | 0.170 ± 0.012 | 0.227 ± 0.024 |
| year effect | 0 | **0.508 ± 0.016** | 0.299 ± 0.015 | 0.283 ± 0.026 |
| iid | 0.3 (power) | 0.910 ± 0.009 | 0.936 ± 0.008 | 0.993 ± 0.005 |
| ar1 0.6 | 0.3 | 0.761 ± 0.013 | 0.606 ± 0.015 | 0.620 ± 0.028 |
| year effect | 0.3 | 0.668 ± 0.015 | 0.504 ± 0.016 | 0.510 ± 0.029 |

(Full table with beta 0.6 in the JSON.)

Findings:
1. **The current raw Seasonal MK is calibrated only when months are independent.** Correlation between
   adjacent months (ar1) or a shared interannual anomaly breaks the "independent seasons" assumption, and
   Type I error rises to 14%, 29% and 51%. Real monthly climate series usually have both.
2. **HR on anomalies is not a calibrated replacement:** 11.6% Type I even for iid data (lag-selection
   noise at n = 288) and still 17% to 30% under dependence. This supports the proposal's warning not to
   substitute HR blindly.
3. **The existing shadow year-block bootstrap (`methods.block_bootstrap`) is miscalibrated: 34% Type I
   for iid data.** Likely cause (hypothesis, not proven): resampling whole years with replacement creates
   identical duplicate year vectors; their pairwise differences are exactly 0, which pulls the Sen median of
   the resampled residuals towards 0, so the null distribution is too narrow. It should not be considered
   further in its current form.

Assumptions and reference: Hirsch, Slack & Smith (1982) assume independent seasons; **Hirsch & Slack (1984)**
give a covariance-corrected Seasonal Kendall test that estimates the covariance between seasons from the
data and is the standard remedy for exactly the `year_effect`/ar1 cross-season dependence above. Hamed &
Rao (1998) is a non-seasonal correction.

- **Recommendation: do not change the production verdict yet.** Next shadow candidate to implement and
  benchmark: the Hirsch-Slack (1984) covariance-corrected Seasonal Kendall test (optionally with a
  year-block bootstrap of the S statistic, not of the Sen median). Approve only if it reaches about 5%
  Type I in all four scenarios with acceptable power.
- Impact if adopted later: some currently "significant" regional trends would become "not proven yet".
  The NASA reference (IMERG Mekong, raw p = 0.110, not significant) cannot become significant under a
  more conservative test.

## C3: completeness policy

Eligibility and Type I among eligible series (iid null, n = 1000).

| Missingness | Current grid (≥ 10 years with any month) | Current regional (+ ≥ 70% of months) | Shadow (+ ≥ 10 values in every calendar month) |
| --- | --- | --- | --- |
| 20% random | eligible 1.00, Type I 0.053 ± 0.007 | 1.00, 0.053 | 1.00, 0.053 |
| 50% random | **eligible 1.00**, Type I 0.049 ± 0.007 | 0.00 | 0.00 |
| only Jan to Mar observed | **eligible 1.00**, Type I 0.051 ± 0.007 | 0.00 | 0.00 |
| wet season missing in the first 12 years | eligible 1.00, Type I 0.055 ± 0.007 | 1.00, 0.055 | 1.00, 0.055 |

- Under independent noise, Type I stays near 5% even with heavy missingness. The real problem is
  **meaning and precision, not calibration**: the grid reports a trend from only three months of the year as
  if it were an annual trend, and slope noise grows (null slope SD 0.17 vs 0.10 SD/decade with 20% missing).
- The regional 70% rule and the per-season shadow rule agree in all four patterns here; neither catches
  the "wet season missing in early years" pattern, which can bias slopes when seasons differ.
- **Recommendation: align the grid with the regional 70% rule plus a per-season minimum** (policy decision
  for Đăng). It changes the tested family size for C5. Keep v1 masks for comparison.

## C4: confidence intervals

True slope 0.5 SD/decade; nominal coverage 95% (n = 1000 for OLS/HAC, n = 300 for the bootstrap).

| Scenario | Current OLS-anomaly interval | Newey-West HAC OLS (bandwidth 5 months) | Existing year-block bootstrap Sen interval |
| --- | --- | --- | --- |
| iid | **0.943 ± 0.007**, width 0.33 | 0.925 ± 0.008, width 0.32 | 0.670 ± 0.027, width 0.17 |
| ar1 0.6 | **0.656 ± 0.015**, width 0.33 | 0.873 ± 0.011, width 0.53 | 0.743 ± 0.025, width 0.43 |
| year effect | **0.477 ± 0.016**, width 0.37 | 0.582 ± 0.016, width 0.50 | 0.677 ± 0.027, width 0.59 |

- The Sen point estimate fell inside the OLS interval in 100% of simulated series (the NASA case where it
  does not, mentioned in the audit, comes from skewed real data, not from this design).
- The current interval is valid only for independent months; it is far too narrow under dependence.
- HAC with the default Newey-West bandwidth (5 lags) fixes most monthly autocorrelation but cannot see a
  shared interannual anomaly (12-month scale); a longer bandwidth or year-block resampling is needed.
- The existing bootstrap interval under-covers even for iid data (same duplicate-block issue as C2).
- Runtime: OLS and HAC are microseconds per series; bootstrap about 13 ms per series (199 draws).
- **Recommendation:** keep the label "OLS anomaly interval" (never "Sen interval"). Next shadow candidate:
  HAC with a bandwidth covering at least 12 to 24 months, benchmarked again on all three scenarios. Do not
  deploy the existing bootstrap.

## C5: false discovery rate on the grid

225 cells, 25 true trend cells, spatially correlated noise, 200 replications.

| Temporal noise | Method | Empirical FDR | Power | P(any false cell) |
| --- | --- | --- | --- | --- |
| iid | BH (current) | **0.032 ± 0.005** | 0.9996 | 0.285 |
| iid | BY (shadow) | 0.006 ± 0.002 | 0.9968 | 0.070 |
| iid | no correction | 0.228 ± 0.011 | 1.000 | 0.910 |
| year effect | BH (current) | **0.767 ± 0.006** | 0.884 | 1.000 |
| year effect | BY (shadow) | 0.696 ± 0.010 | 0.822 | 1.000 |

- With correctly calibrated cell p-values, **BH controls FDR below 5% even with this spatial correlation**;
  BY is much more conservative with little power loss in this easy design.
- With temporally dependent data (miscalibrated cell p-values), **neither BH nor BY controls FDR (77% and
  70% false discoveries)**. This confirms the audit statement: FDR does not repair incorrectly calibrated
  temporal p-values.
- Real NASA bounded shadow (subset family, not the production family): 79 cells significant with BH vs 36
  with BY in the 432 Mekong cells.
- **Recommendation: keep BH; fix cell-level calibration first (C2-type correction applied per cell),
  then re-run this benchmark.** Switching to BY alone would halve the significant cells without fixing
  the real error source.

---

## Summary for the approval meeting

| ID | Current | Proposed / evaluated | Evidence | Recommendation | Approval |
| --- | --- | --- | --- | --- | --- |
| C1 | Grid MK variance without ties | Tie-corrected variance | Type I 3.6% → 4.8%; real Mekong cells: 0 verdict changes | Full-grid shadow, then deploy (versioned) | Pending |
| C2 | Raw Seasonal MK verdict | HR (rejected), year-block bootstrap (rejected) | Raw: 14% to 51% Type I under dependence; HR and bootstrap also miscalibrated | Implement and benchmark Hirsch-Slack 1984 next; no production change | Pending |
| C3 | Grid ≥ 10 years only | Grid = regional 70% + per-season minimum | Grid accepts series with 50% missing or 3 months only | Align (policy decision) | Pending |
| C4 | OLS anomaly interval, no HAC | HAC (NW 5 lags), year-block bootstrap | OLS 48% to 66% coverage under dependence; HAC better but not enough for interannual; bootstrap broken | Benchmark HAC with 12 to 24 month bandwidth next | Pending |
| C5 | BH on raw cell p | BY | BH fine if p calibrated; both fail if not | Keep BH; fix C2 at cell level first | Pending |

Scientific uncertainty that remains: how strong the cross-season and interannual dependence actually is in
each NASA product and region (estimate it from the residuals of the real cubes before choosing a method);
the effect of input-data changes over time in GLDAS and MERRA-2; and the global-grid runtime of any new test.

References: Kendall (1975) *Rank Correlation Methods*; Hirsch, Slack & Smith (1982) Water Resour. Res. 18(1);
Hirsch & Slack (1984) Water Resour. Res. 20(6); Hamed & Rao (1998) J. Hydrol. 204; Newey & West (1994) Rev.
Econ. Stud. 61; Benjamini & Hochberg (1995) JRSS-B 57; Benjamini & Yekutieli (2001) Ann. Stat. 29.
