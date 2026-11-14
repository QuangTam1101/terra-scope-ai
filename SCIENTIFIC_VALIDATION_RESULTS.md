# Scientific validation results

Date: 15 November 2026. Plan: [SCIENTIFIC_E2E_TEST_PLAN.md](SCIENTIFIC_E2E_TEST_PLAN.md). Machine-readable: [scientific_validation_results.json](scientific_validation_results.json). Report and PDF audit: [REPORT_NUMERICAL_AUDIT.md](REPORT_NUMERICAL_AUDIT.md).

## Summary

| Status | Count |
|---|---|
| PASS | 48 |
| INCONCLUSIVE | 1 (SY12, a measurement) |
| FAIL | 0 |
| BLOCKED | 0 |
| NOT RUN | 4 (Gemini, bootstrap recomputation, map-drag box, forecast) |

Every executed case met its tolerance. This shows that the app computes and displays what the documented method says on the processed NASA grids. It does not show that the method itself is the best choice for autocorrelated climate series: see findings B1 and B2.

## Regional cases: oracle vs API (TC-01 to TC-23)

Slopes are per decade in the variable's unit (mm/month, °C, m³/m³). "Oracle p" is the raw Seasonal Mann-Kendall p used for the verdict; "HR p" is the Hamed-Rao p on anomalies (diagnostic only). The API returns p as 0 when it underflows below about 1e-16.

| ID | Case | Variable | Box (W,S,E,N) | Period | Oracle slope/dec | API slope/dec | Oracle p | API p | HR p | n | Verdict | Max value delta | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TC-01 | Mekong Delta, Vietnam | imerg_precip | 104.4, 8.5, 106.9, 11.1 | 2001-01 to 2024-12 | 3.4290 | 3.4290 | 0.0770 | 0.0770 | 0.2927 | 288 | not significant | 4.99e-07 | PASS |
| TC-02 | Hanoi, Vietnam | merra2_air_temperature_2m | 105.3, 20.5, 106.1, 21.4 | 2001-01 to 2025-12 | 0.2277 | 0.2277 | 6.62e-04 | 6.62e-04 | 0.0898 | 300 | significant | 4.97e-07 | PASS |
| TC-03 | Sahara Desert | merra2_air_temperature_2m | -10, 18, 30, 30 | 2001-01 to 2025-12 | 0.2271 | 0.2271 | 1.00e-04 | 1.00e-04 | 0.0051 | 300 | significant | 4.99e-07 | PASS |
| TC-04 | Amazon Basin | imerg_precip | -75, -15, -50, 5 | 2001-01 to 2024-12 | -7.1223 | -7.1223 | 8.98e-05 | 8.98e-05 | 0.0326 | 288 | significant | 4.92e-07 | PASS |
| TC-05 | California, USA | gldas_soil_moisture_0_10cm | -124.5, 32.5, -114, 42 | 2001-01 to 2025-12 | 0.0019 | 0.0019 | 0.1435 | 0.1435 | 0.3815 | 300 | not significant | 4.99e-07 | PASS |
| TC-06a | Australia | merra2_air_temperature_2m | 113, -39, 154, -11 | 2001-01 to 2025-12 | 0.2861 | 0.2861 | 2.88e-08 | 2.88e-08 | 4.12e-04 | 300 | significant | 5.00e-07 | PASS |
| TC-06b | Australia | gldas_air_temperature | 113, -39, 154, -11 | 2001-01 to 2025-12 | 0.7513 | 0.7513 | 2.39e-20 | 0.0000 | 2.34e-06 | 300 | significant | 4.95e-07 | PASS |
| TC-07 | Arctic (north of 66.5 N) | merra2_air_temperature_2m | -180, 66.5, 180, 90 | 2001-01 to 2025-12 | 0.3221 | 0.3221 | 2.63e-09 | 2.63e-09 | 5.18e-07 | 300 | significant | 4.96e-07 | PASS |
| TC-08 | Central Africa (Congo Basin) | gldas_evapotranspiration | 10, -5, 30, 5 | 2001-01 to 2025-12 | 5.5768 | 5.5768 | 1.44e-20 | 0.0000 | 0.0012 | 300 | significant | 4.95e-07 | PASS |
| TC-09 | Coastal Bangladesh (land and sea cells) | gldas_soil_moisture_0_10cm | 88, 21, 92.5, 23 | 2001-01 to 2025-12 | -0.0048 | -0.0048 | 1.65e-05 | 1.65e-05 | 0.0085 | 300 | significant | 4.98e-07 | PASS |
| TC-10 | User box: Wisconsin, USA | merra2_air_temperature_2m | -92.9, 42.5, -86.8, 47.1 | 2001-01 to 2025-12 | 0.2098 | 0.2098 | 0.1549 | 0.1549 | 0.4135 | 300 | not significant | 4.99e-07 | PASS |
| TC-11 | Whole world | merra2_air_temperature_2m | -180.0, -90.0, 180.0, 90.0 | 2001-01 to 2025-12 | 0.1668 | 0.1668 | 8.48e-22 | 0.0000 | 0.0110 | 300 | significant | 4.99e-07 | PASS |
| TC-12 | Box crossing the antimeridian | merra2_air_temperature_2m | 170, -20, -170, -10 | 2001-01 to 2025-12 | n/a | n/a | n/a | n/a | n/a | n/a | {'http': 422, 'code': None} | n/a | PASS |
| TC-13 | Mekong Delta, March start and November end | merra2_air_temperature_2m | 104.4, 8.5, 106.9, 11.1 | 2003-03 to 2024-11 | 0.2070 | 0.2070 | 2.22e-06 | 2.22e-06 | 0.0014 | 261 | significant | 4.99e-07 | PASS |
| TC-14 | Open Pacific Ocean, land-only variable | gldas_soil_moisture_0_10cm | -150, -10, -140, 0 | 2001-01 to 2025-12 | n/a | n/a | n/a | n/a | n/a | n/a | {'http': 404, 'code': 'NO_DATA'} | n/a | PASS |
| TC-15 | Mekong Delta, 7 years only | imerg_precip | 104.4, 8.5, 106.9, 11.1 | 2018-01 to 2024-12 | 3.8076 | 3.8076 | n/a | n/a | n/a | 84 | insufficient | 4.87e-07 | PASS |
| TC-16 | Mekong Delta, period including months without IMERG data | imerg_precip | 104.4, 8.5, 106.9, 11.1 | 2001-01 to 2025-12 | 4.2292 | 4.2292 | 0.0408 | 0.0408 | 0.1476 | 297 | significant | 4.99e-07 | PASS |
| TC-17 | Central Highlands, Vietnam | gldas_evapotranspiration | 107.2, 11.2, 109.0, 15.5 | 2001-01 to 2025-12 | 6.7867 | 6.7867 | 1.90e-13 | 1.90e-13 | 1.61e-06 | 300 | significant | 4.99e-07 | PASS |
| TC-18 | Northern Vietnam | gldas_soil_moisture_0_10cm | 104.5, 20.1, 107.25, 22.25 | 2001-01 to 2025-12 | 0.0013 | 0.0013 | 0.2490 | 0.2490 | 0.4232 | 300 | not significant | 4.98e-07 | PASS |
| TC-19 | Mekong region (whole basin) | imerg_precip | 94.0, 8.0, 110.0, 35.0 | 2001-01 to 2024-12 | 3.1826 | 3.1826 | 0.0701 | 0.0701 | 5.50e-04 | 288 | not significant | 4.98e-07 | PASS |
| TC-20a | Sahel | merra2_air_temperature_2m | -17, 10, 30, 18 | 2001-01 to 2025-12 | -0.2122 | -0.2122 | 4.01e-04 | 4.01e-04 | 0.0286 | 300 | significant | 4.97e-07 | PASS |
| TC-20b | Sahel | gldas_air_temperature | -17, 10, 30, 18 | 2001-01 to 2025-12 | 0.7968 | 0.7968 | 3.61e-18 | 0.0000 | 1.98e-04 | 300 | significant | 4.99e-07 | PASS |
| TC-21 | Box smaller than one grid cell | merra2_air_temperature_2m | 105.1, 10.1, 105.2, 10.2 | 2001-01 to 2025-12 | n/a | n/a | n/a | n/a | n/a | n/a | {'http': 400, 'code': 'REGION_TOO_SMALL'} | n/a | PASS |
| TC-22 | Southern Ocean and Antarctica (south of 60 S) | merra2_air_temperature_2m | -180, -90, 180, -60 | 2001-01 to 2025-12 | -0.2618 | -0.2618 | 3.38e-05 | 3.38e-05 | 0.2304 | 300 | significant | 4.99e-07 | PASS |
| TC-23 | Sahara Desert, precipitation (many tied zero months) | imerg_precip | -10, 18, 30, 30 | 2001-01 to 2024-12 | -0.1330 | -0.1330 | 0.1853 | 0.1853 | 0.2847 | 288 | not significant | 4.99e-07 | PASS |

Max deltas over all regional cases:
- chart data: monthly anomalies: 5e-07
- all monthly values: 5e-07
- coverage_fraction (API rounds to 3 dp): 0.000293
- Sen slope per decade: 4.09e-14
- Z statistic: 0
- raw Seasonal MK p: 1.67e-16
- Hamed-Rao adjusted p: 2.22e-16


## Grid maps, full family (GR-01, GR-02)

| ID | Data | Period | Cells | FDR family | Significant (API) | Max slope / p / q delta | Flag mismatches | Status |
|---|---|---|---|---|---|---|---|---|
| GR-01 | MERRA-2 air temperature 2 m | 2001-01 to 2025-12 | 259,200 | 259,200 | 163,713 | 5.0e-7 / 5.0e-7 / 5.0e-7 | 0 | PASS |
| GR-02 | IMERG precipitation | 2001-01 to 2024-12 | 258,483 | 257,760 | 73,266 | 5.0e-7 / 5.0e-7 / 5.0e-7 | 0 | PASS |

Tie correction: the map follows its documented rule (no tie correction in the variance). For MERRA-2 this changes nothing (0 cells change FDR verdict, max p change 2e-5). For IMERG, where dry months are tied at 0, 4,151 cells would change verdict and p would fall by up to 0.763 with the correction. The map is therefore conservative for rainfall in dry regions.

## Region comparison (CMP-01)

Sahel `-17, 10, 30, 18` vs Wisconsin `-92.9, 42.5, -86.8, 47.1`, MERRA-2, 2001-01 to 2025-12: PASS.

| Quantity | Oracle | API |
|---|---|---|
| Sahel slope | -0.21216 °C/decade | -0.21216 |
| Wisconsin slope | +0.20984 | +0.20984 |
| Difference trend (Sen slope of anomaly A minus anomaly B) | -0.38315 | -0.38315 |
| Difference p (Hamed-Rao on the difference series) | 0.021896 | 0.021896 |
| 95% interval (moving-block bootstrap) | not recomputed | [-0.865, 0.117] |
| Verdict | p < 0.05 but interval contains 0, so not significant | opposite_not_significant |

Two calls gave identical results. The simple subtraction of the two Sen slopes is -0.422, a different quantity from the difference trend; the report now names both correctly (finding E1).

## Synthetic cases (SY01 to SY15)

15/15 pytest cases pass against the production functions (`trend_one`, `grid_trend`, `bh_fdr`): constant series, linear increase and decrease with known slope, strong seasonality with no trend, missing months, many ties, uneven coverage, short series (insufficient), noise, Hamed-Rao and OLS agreement with the oracle, grid FDR on a planted signal, BH with NaN p-values, and the no-tie map being conservative.

SY12 (INCONCLUSIVE, a measurement): AR(1) series with phi = 0.8 and no trend, 200 simulations. Raw Seasonal MK rejected 51.5% of the time, Hamed-Rao 24%. The nominal rate is 5%.

## Browser and PDF (UI-01 to UI-05, PDF-01)

All PASS. Details in [REPORT_NUMERICAL_AUDIT.md](REPORT_NUMERICAL_AUDIT.md).

## Findings

Classes: A data, B method, C metadata or API, D visual, E wording, F interpretation risk, G test or UX coverage.

| ID | Class | Finding | Evidence | Action |
|---|---|---|---|---|
| B1 | B | The verdict uses the raw Seasonal MK p, which assumes independent years. Under strong autocorrelation the false-positive rate is far above 5% (SY12: 51.5% raw, 24% Hamed-Rao). | `validation/results/synthetic_extra.json` | Not changed (approved method). For Đăng and the project owner. |
| B2 | B | Raw and Hamed-Rao verdicts disagree in 4 of the 21 regional series with a p-value: TC-02 Hanoi (0.0007 vs 0.090), TC-16 Mekong Delta with 2025 (0.041 vs 0.148), TC-19 Mekong basin (0.070 vs 0.0005), TC-22 Southern Ocean (about 0 vs 0.230). | `validation/results/backend_cases.json` | Not changed. Scientist mode already shows both. |
| B3 | B | The grid map omits the tie correction; for IMERG 4,151 cells would change FDR verdict. Conservative, consistent with its documented rule. | `validation/results/grid_cases.json` | Not changed. |
| B4 | B | Dataset disagreement: Sahel MERRA-2 -0.212 vs GLDAS +0.797 °C/decade; Australia 0.286 vs 0.751. Both significant in each pair. | TC-20a/b, TC-06a/b | Not changed. Dataset agreement warning already exists. |
| C1 | C | The variable list advertises IMERG coverage to 2025-12, but the last month with data is 2025-09. The series handles the gap correctly (TC-16: 297 months, 3 missing). | TC-16 | Recommendation: report the last valid month in metadata. |
| D1 | D | The rotated y-axis title in report charts was clipped ("Monthly anomaly (mm/month)"). | page images before the fix | Fixed in `ReportDoc.tsx`, `EditionDoc.tsx`. |
| E1 | E | Report and Hunt text called the difference test "block-bootstrap p" and mixed the subtraction of two slopes with the difference trend. The p is Hamed-Rao on the anomaly difference; the bootstrap gives only the interval. | CMP-01 | Fixed in `onboarding.ts`, `Hunt.tsx`, `EditionDoc.tsx`, `ReportDoc.tsx`, `formd.ts`, `model.ts`. |
| F1 | F | The Explorer report converts the rate into a total change over the period ("adds up to roughly +8.23 mm/month") even when the trend is not significant. | `report-explorer.pdf` | Recommendation only (left unchanged). |
| F2 | F | Large blank space after some table page breaks in the PDFs. | `validation/results/pdf_pages/` | Minor, left unchanged. |
| G1 | G | In the browser an arbitrary box can only be entered by dragging on the map; typed coordinates select one cell. The suite tested arbitrary boxes through the API only. | UI-04 | Not run in the browser (NR-03). |
| G2 | G | UI-03 (Australia from the search list) uses the country box `113, -44, 154, -10`, not the TC-06 box `113, -39, 154, -11`; it was checked against its own oracle value (+0.2545). | UI-03 | None needed. |

No class A finding: the regional values reproduce the NetCDF files to the API's 6-decimal rounding in every case.

## Regression after the fixes

| Suite | Result |
|---|---|
| Backend unit | 258 passed |
| Pipeline | 63 passed, 2 skipped |
| Synthetic | 15 passed |
| Frontend unit | 54 passed |
| Typecheck and build | OK |
| Live API | 13 passed, 5 skipped (Gemini, not run) |
| App browser e2e | 11/11 |
| Report PDF tests | 9 passed |
| Scientific UI/PDF rerun | all PASS |

## Conclusion

On the processed 0.5 degree grids, the regional series, regional trends, grid maps with FDR, region comparison and both report editions agree with an independent reimplementation to within rounding, across 25 regional cases, 2 full grids, 1 comparison, 15 synthetic cases and 5 browser scenarios. This is evidence of computational and display correctness. It is not a claim that every reported trend is physically real: findings B1 to B4 should be read before presenting significance results.
