# Terra-scope AI

**Become an Earth trend detective: pick a place, ask a question, get an honest answer from NASA data.**

NASA Space Apps Challenge 2026 · Challenge: *Be An Earth System Trend Detective!*

- **Live app:** https://terra-scope-nasa.vercel.app/
- **Technical report:** [report/Terra-scope_AI_Technical_Report.pdf](report/Terra-scope_AI_Technical_Report.pdf)
- **Pitch deck:** https://www.canva.com/design/DAHa8U-ibRg/uep93YIb23vUrkqF0aZ1kw/view

Terra-scope AI is not an official NASA product and is not endorsed by NASA.

## What it does

Pick a NASA variable, a place anywhere on Earth and a period between 2001 and 2025. Terra-scope AI builds the monthly
time series, removes the seasonal cycle, tests the trend and tells you in plain words whether the change is clear or
"not proven yet", with the numbers behind it.

| Tool | What you can do |
| --- | --- |
| **Explore** | Choose a variable, a region (preset, country, city, point, or a box drawn on the map or 3D globe) and a month range. See a global trend or value map, the monthly series with its Sen trend line, and a result card: change per decade, p-value, data coverage. Play a month-by-month time-lapse. |
| **Contradiction Hunter** | Compare two regions, two NASA datasets or two periods. Two regions count as truly different only when a test on the difference series passes. "Same cause, opposite trends" (also one click from an Explore result) finds a rising and a falling place for one variable, tests both and the gap, and shows one source-checked explanation without testing the cause. |
| **AI Detective** | Ask in everyday language. Gemini explains the result using only numbers computed by the statistics engine; the backend checks every number and falls back to a fixed template if a check fails. |
| **Outlook (experimental)** | Short-range outlook from climate indices, shown with its backtested skill ("No skill" where there is none). |
| **Report** | Export PDF, Markdown or JSON in an Explorer edition (plain language) or a Scientist edition (methods, tables, reproduction details). |

Explorer and Scientist modes show the same numbers and verdicts; only the wording and depth change.

## NASA data

GES DISC products are downloaded for the whole globe through NASA Harmony; MODIS climate-modeling-grid files come
from NASA LP DAAC (each 0.5° cell is the mean of its valid 0.05° pixels). Everything is regridded to a common
0.5 degree monthly grid, 2001-01 to 2025-12.

| Product | Variable | Native grid |
| --- | --- | --- |
| [GPM IMERG Final Monthly V07](https://doi.org/10.5067/GPM/IMERG/3B-MONTH/07) | Precipitation (mm/month), data to 2025-09 | 0.1° |
| [GLDAS Noah Monthly V2.1](https://doi.org/10.5067/SXAVCZFAQLNO) | Soil moisture 0 to 10 cm, air temperature, evapotranspiration (land only) | 0.25° |
| [MERRA-2 instM_2d_asm_Nx V5.12.4](https://doi.org/10.5067/5ESKGQTZG7FO) | 2 m air temperature (land and sea) | 0.5° x 0.625° |
| [MODIS Terra MOD13C2 V061](https://doi.org/10.5067/MODIS/MOD13C2.061) | Vegetation greenness (NDVI), good and marginal pixels only | 0.05° |
| [MODIS Terra MOD11C3 V061](https://doi.org/10.5067/MODIS/MOD11C3.061) | Land surface temperature, day and night (clear sky) | 0.05° |
| [GLDAS Noah Monthly V2.1](https://doi.org/10.5067/SXAVCZFAQLNO) `PotEvap_tavg` | Potential evapotranspiration (land only) | 0.25° |
| [GRACE/GRACE-FO JPL Mascon RL06.3 v04](https://doi.org/10.5067/TEMSC-3JC634) | Land water storage change (cm), 2002-04 onward | 0.5° (mascons ~3°) |
| [GLDAS Noah Monthly V2.1](https://doi.org/10.5067/SXAVCZFAQLNO) `SWE_inst` | Snow water (land only) | 0.25° |
| [MERRA-2 tavgM_2d_aer_Nx V5.12.4](https://doi.org/10.5067/FH9A0MLJPC7N) | Aerosol optical depth: total and dust | 0.5° x 0.625° |
| [MiCASA v1 monthly](https://disc.gsfc.nasa.gov/datasets/MICASA_FLUX_M_1/summary) | Fire carbon emission (from MODIS burned area), 2001–2024 | 0.1° |
| CRU TS 4.10 `tmx`/`tmn` (not NASA) | Daytime highs and night-time lows (stations, land only) | 0.5° |

The variables added on 16/11/2026 (last five rows) are built straight from the raw files into 1° cubes by
`data-pipeline/build_extra_cubes.py`.

Regional series were validated against [Giovanni](https://giovanni.gsfc.nasa.gov/giovanni/) Time Series,
Area-Averaged (r = 0.9996 over 293 months), and each Explore result links to the same query in Giovanni.
The Outlook uses NOAA climate indices and NASA GISS GISTEMP v4 as a reality check.

## Method

1. Area mean of the grid cells in the region, weighted by cos(latitude).
2. Monthly anomalies (value minus the mean of the same calendar month).
3. Seasonal Mann-Kendall test with the seasonal Sen slope, reported per decade; p below 0.05 is a clear trend.
   A result needs at least 10 years and 70% of months.
4. Extra checks shown alongside: Hamed-Rao autocorrelation-adjusted p-value and an OLS confidence interval.
5. Maps test every 0.5° cell and mark a cell significant only after Benjamini-Hochberg false discovery rate control.
6. Two-region comparison: test on the anomaly difference series (Hamed-Rao p below 0.05 and a block-bootstrap
   interval that excludes zero).

An independent re-implementation in [`validation/`](validation) (no shared code) checked 25 regional cases,
2 global maps and 15 synthetic series: 48 passed, 0 failed, 1 inconclusive. See
[validation/SCIENTIFIC_VALIDATION_RESULTS.md](validation/SCIENTIFIC_VALIDATION_RESULTS.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `web/` | Frontend: React 19, TypeScript, Vite, d3-geo |
| `backend/` | FastAPI service, trend engine bridge, Gemini Detective (`backend/ai/` holds the system prompt and knowledge base) |
| `data-pipeline/` | NASA download (`download/`), cleaning to the 0.5° grid (`preprocess/`), statistics (`pipeline/`), forecast training |
| `validation/` | Independent oracle, its results and test plan, and simulated-user test scenarios |
| `report/` | Technical report, with the scripts that rebuild its figures |
| `presentation/` | Pitch deck (PPTX and PDF) and the scripts that build it |
| `docs/` | Design notes with screenshots (`docs/design/`) and the deployment guide |

## Run it locally

Requirements: Python 3.11, Node.js 20+, and a free [NASA Earthdata Login](https://urs.earthdata.nasa.gov) with the
GES DISC application authorised.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r backend/requirements.txt   # use .venv/bin/python on macOS and Linux

# NASA data (about 2.8 GB download), then the 0.5 degree grid
cd data-pipeline
../.venv/Scripts/python download/giovanni_hoss.py
../.venv/Scripts/python preprocess/clean.py precip_imerg sm_0_10cm_gldas tair_gldas evap_gldas t2m_merra2
cd ..

# Backend on :8000 (optional: copy backend/.env.example to backend/.env and add a Gemini key)
.venv/Scripts/python -m uvicorn backend.app.main:app --port 8000

# Frontend on :5173 (proxies /api to :8000)
cd web && npm install && npm run dev
```

Without a Gemini key the Detective runs in Template mode. Forecast models are published as the GitHub release
`forecast-models-v1` (`scripts/fetch-forecast-models.py`). On Windows, `scripts/start-local.ps1` starts both servers
and `scripts/test-all.ps1` runs every test suite.

## Tests

Backend unit tests (`pytest backend/tests`), frontend unit tests (`npm test` in `web/`), live API tests on real data
(`backend/tests_e2e`), headless-browser end-to-end tests (`npm run e2e`) and simulated user mistakes
(`validation/user_scenarios/run_api.py`). See [TESTING.md](TESTING.md).

## References

Hirsch, Slack and Smith (1982); Hirsch and Slack (1984); Sen (1968); Hamed and Rao (1998); Benjamini and Hochberg
(1995); Kunsch (1989); Hussain and Mahmud (2019), pymannkendall. Full citations with DOIs are in the
[technical report](report/Terra-scope_AI_Technical_Report.pdf). Coastlines: Natural Earth via world-atlas.

## Team

Le Gia Hung · Dang Ngo Duy Phu · Thieu Quang Tam · Le Truong Minh Dang · Tran Bao Long
