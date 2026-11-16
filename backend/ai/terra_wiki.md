# Terra-scope knowledge base (for the Terra Detective AI)

This file is the only background knowledge the Terra Detective may use, together with the FACTS block that the
backend attaches to every question. It describes how Terra-scope works. It contains no results: every number about a
place comes from FACTS, never from this file.

Last checked against the code: 14/11/2026 (backend `app/service.py`, data-pipeline `pipeline/trends.py`,
`pipeline/grid.py`, `pipeline/contradictions.py`, `preprocess/clean.py`).

---

## 1. What Terra-scope is

Terra-scope helps people check whether an environmental variable is really changing in a place, using NASA Earth
data. The user picks four things:

1. **What to check**: a variable (for example precipitation, soil moisture, air temperature, land water storage, fire).
2. **Which data**: the NASA dataset that measured or modelled it.
3. **When**: a start year and an end year (at least 10 years are needed for a test).
4. **Where**: a country, a city, coordinates, a box drawn on the map, a preset area, or the whole world.

Terra-scope then answers: how fast the variable rose or fell per decade, and whether that change is statistically
significant or could be chance.

Terra-scope describes **what changed in the past**. It does **not** explain why it changed and it does **not**
forecast the future.

---

## 2. Data

### 2.1 Grid and period
- All data are monthly, on a common **global grid of 0.5° cells** (about 55 km at the equator; cells get narrower
  towards the poles). If the 0.5° files are missing on a server, the backend falls back to an older **1° grid**. The
  real cell size is in FACTS (`cell_size_deg` or `spatial_resolution_deg`); use that, not this sentence.
- Period: **January 2001 to December 2025**. Precipitation (IMERG) currently ends in **September 2025** because NASA
  publishes the final product about 3.5 months late; the last months of 2025 are empty for it.
- A city is analysed as the single grid cell that contains it, so the value is an average over about 55 km, not a
  reading at one street or station.

### 2.2 Variables and datasets available now

| Variable (app name) | Dataset | What it is | Units | Coverage |
|---|---|---|---|---|
| Precipitation | **GPM IMERG** Final Run monthly, V07 (`GPM_3IMERGM`), NASA GES DISC | Satellite rainfall estimate, calibrated with rain gauges | mm/month | Land and sea, whole globe |
| Soil moisture (0 to 10 cm) | **GLDAS Noah** 0.25° monthly v2.1 (`GLDAS_NOAH025_M`), NASA GES DISC | Water in the top 10 cm of soil, from a land surface **model** fed with observations | m³/m³ (volume of water per volume of soil) | Land only, 60°S to 90°N |
| Air temperature over land | **GLDAS Noah** v2.1 | Near-surface air temperature from the land model | °C | Land only, 60°S to 90°N |
| Air temperature (2 m) | **MERRA-2** (`M2IMNXASM` v5.12.4), NASA GMAO / GES DISC | Air temperature about 2 m above the ground, from a **reanalysis** (a weather model that assimilates observations) | °C | Land and sea, whole globe |
| Evapotranspiration | **GLDAS Noah** v2.1 | Water moving from land to air: evaporation from soil and water plus transpiration from plants | mm/month | Land only, 60°S to 90°N |
| Potential evapotranspiration | **GLDAS Noah** v2.1 (`PotEvap_tavg`) | How much water the air could take from the land if water were unlimited (atmospheric demand), converted from W/m² to mm/month | mm/month | Land only, 60°S to 90°N |
| Vegetation greenness (NDVI) | **MODIS Terra MOD13C2** v061, monthly 0.05° Climate Modeling Grid, NASA LP DAAC | Satellite index of how green and dense plants are, from about −0.2 (water, bare) to 1 (dense forest); only good and marginal pixels used | unitless | Land only; months with persistent cloud or snow can be missing |
| Land surface temperature (day / night) | **MODIS Terra MOD11C3** v061, monthly 0.05° Climate Modeling Grid, NASA LP DAAC | Temperature of the ground surface itself (not the air) seen by the satellite at about 10:30 and 22:30 local time, clear-sky only | °C | Land only; cloudy months can be missing |

| Land water storage | **GRACE / GRACE-FO** JPL Mascon RL06.3 v04 (CRI), NASA JPL / PO.DAAC | Change in all water on and under the land (groundwater, soil water, snow, ice, lakes) from tiny changes in Earth's gravity, relative to the 2004–2009 average | cm of water | Land only; April 2002 onward, 11-month gap 2017-07 to 2018-05; each mascon is about 300 km wide |
| Snow water | **GLDAS Noah** v2.1 (`SWE_inst`) | Water stored in the snowpack | kg/m² (= mm of water) | Land only, 60°S to 90°N; ice sheets and glaciers (never snow-free) removed |
| Air haze: all aerosols / desert dust | **MERRA-2** (`M2TMNXAER` v5.12.4, `TOTEXTTAU` / `DUEXTTAU`), NASA GMAO | Aerosol optical depth at 550 nm: how much smoke, dust, pollution and sea salt dim sunlight (0 = clear, about 1 = very hazy) | unitless | Land and sea, whole globe |
| Daytime highs / night-time lows | **CRU TS 4.10** `tmx` / `tmn`, University of East Anglia (not NASA) | Monthly mean of daily maximum / minimum air temperature, interpolated from weather stations | °C | Land only; cells with no nearby station removed |
| Fire activity | **MiCASA v1** (`MICASA_FLUX_M`, `FIRE`), NASA GES DISC, driven by MODIS burned area | Carbon released by fires each month | g C/m²/month | Land only, 2001–2024 |
| Number of fires | **NASA FIRMS** MODIS Collection 6.1 active fires (MCD14ML, Terra + Aqua) | Fires detected per month in each 1° cell (vegetation fires, confidence ≥ 30 %) | fires/month | Land; 2003 onward (both satellites); Terra and Aqua orbits drift since 2020 / 2022 |
| Drought (root zone / groundwater) | **GRACE-DA-DM** Global v3.0, NASA GSFC (Catchment model assimilating GRACE) | Share of weeks in the month with root-zone soil water / groundwater at or below the 20th percentile of 1948–2012 (moderate drought or worse) | % of weeks | Land, 60°S to 90°N; February 2003 onward |
| Tropical storms | **IBTrACS** v04r01, NOAA NCEI (not NASA) | Number of tropical storms, typhoons or hurricanes (≥ 34 knots) whose centre passed within 500 km, per month | storms/month | Places a storm reached in 2001–2025; 2025 tracks provisional |

Count variables (number of fires, fire carbon, tropical storms, drought weeks) are zero in most months in many places.
Their trend slope is a median over the 12 calendar months, so it can be exactly 0, or far smaller than the 95 % range
(a different method), while the p-value is still significant: then say the number of events is changing and point to
the Month by year view. A global or regional tropical-storm count rarely shows a significant trend: storms are rare.

MODIS evapotranspiration (marked "not available yet" in the app) has **no data on the server**. Never describe results
for it. Land surface temperature is the skin of the ground and is usually hotter than the air by day; do not compare
it with air temperature as if they were the same quantity.

### 2.3 How the data were prepared
1. Downloaded from NASA GES DISC through the Harmony service (HOSS), global, without cutting regions.
2. Cleaned: fill values set to missing; physically impossible values removed (for example soil moisture above
   0.95 m³/m³, which marks ice cells in GLDAS); units converted (IMERG mm/hour to mm/month, GLDAS soil water kg/m² to
   m³/m³, Kelvin to °C, evapotranspiration to mm/month).
3. Re-gridded to 0.5°: a 0.5° cell keeps a value only if at least 50% of its area had valid data in the original grid.
   MODIS (NDVI, land surface temperature) is downloaded from NASA LP DAAC as global monthly 0.05° files; a 0.5° cell
   is the mean of its valid 0.05° pixels and needs at least 25 of its 100 pixels.
4. Checked independently (data-pipeline `reports/03_verification.md`): recomputed from the raw files, compared with
   published values and with independent rain gauge products.

### 2.4 Important properties of each source
- **Model and reanalysis data (GLDAS, MERRA-2) are not direct measurements.** They combine observations with
  physics models. Their trends can be affected by changes in the observations fed into them.
- **Two datasets can disagree about the same variable in the same place.** Air temperature from GLDAS (land only)
  and MERRA-2 (land and sea) can give different, even opposite, trends in some regions. When FACTS contains both,
  report both and say they disagree. Never pick one as "the truth".
- **GLDAS does not simulate irrigation or flooded rice fields**, so soil moisture in heavily irrigated farmland may
  not match reality on the ground.
- **GLDAS has no data over oceans or Antarctica.** A region that is mostly sea has low data coverage for GLDAS
  variables (see `quality.coverage_fraction` in FACTS).
- **MODIS is an optical satellite sensor**: it cannot see through clouds. Very cloudy months (monsoon seasons,
  the humid tropics) and snow-covered months (for NDVI) can be missing, so coverage can be lower than for model data.
- **Terra orbit drift:** since its last orbit adjustment in February 2020 the Terra satellite crosses the equator
  earlier than 10:30 / 22:30 as it ends its mission. Recent daytime MODIS land surface temperatures can therefore read
  slightly cooler (night-time ones slightly warmer). When FACTS show a land surface temperature trend, mention that
  checking a period ending in 2019 is a good robustness test.
- **There is no salinity or river flow data** in Terra-scope at the moment. Groundwater is seen inside GRACE land
  water storage (which also includes soil water, snow and ice) and as groundwater drought (GRACE-DA); air pollution only as aerosol haze (MERRA-2).
- **Lightning has no continuous record in Terra-scope**: NASA's TRMM LIS/OTD record ends in April 2015 and the space-station
  sensor covers only 2017-03 to 2023-11; joining sensors with different sensitivity would make a false trend.

---

## 3. How a result is calculated

### 3.1 From a place to a monthly series
- The backend takes every grid cell whose **centre** lies inside the chosen box and averages them for each month,
  weighting each cell by cos(latitude) so cells near the poles (which are smaller) count less.
- A single point (city, coordinates, map click) becomes the one grid cell that contains it. A box drawn on the map uses
  every cell whose centre is inside the box. Drawn boxes that cross the 180° meridian are not supported.
- A **country** follows its real border (Natural Earth 1:110m): only cells whose centre is inside the border count, so
  a neighbour or the sea inside the country's bounding box is left out. Countries split by the 180° meridian (Russia,
  Fiji) work. A country smaller than one grid cell (Luxembourg or Cyprus on the 1° grid) uses the cell nearest its
  centre, and the result says so.

### 3.2 Removing the seasons (anomalies)
- The **anomaly** of a month is its value minus the average of that same calendar month over all years
  (for example, July 2015 minus the average of all Julys). This removes the normal seasonal cycle so the trend is not
  confused with summer and winter.
- In the app, the chart's "Anomaly" mode shows these values; "Values" mode shows the raw monthly values.

### 3.3 The trend test
- **Seasonal Mann-Kendall test** (period 12 months): checks whether values tend to go up or down over the years,
  comparing each calendar month with the same month in other years. It gives the main **p-value** (`p_value`).
- **Sen's slope** (Theil-Sen): the median of the slopes between pairs of years, robust to outliers. It is the
  headline rate, reported **per decade** (`slope_per_decade`), in the variable's units. For event counts that come in
  a short season (fires, storms, drought weeks, MiCASA fire carbon), `slope_method` is `sen_annual`: Sen's slope of
  the yearly averages, because the seasonal version reads 0 when most months have no events. The p-value is unchanged.
- **Hamed-Rao modified Mann-Kendall test** on the anomalies: a second p-value (`p_value_autocorr_adjusted`) that
  corrects for months that depend on each other (autocorrelation). Climate series are often autocorrelated, which can
  make the first p-value look more confident than it should.
- **95% confidence interval** (`slope_ci`): from a linear least-squares fit on the anomalies, per decade.
  **It comes from a different method than Sen's slope**, so in some places the Sen slope can fall outside this
  interval. If that happens in FACTS, say so plainly.

### 3.4 When a trend is "significant"
- **Enough data** (`quality.sufficient` is true): at least **10 different years** with data **and** at least **70%**
  of the months in the period have data. Otherwise no p-value is reported and the answer is "not enough data".
- **Significant** (`significant` is true): enough data **and** Seasonal Mann-Kendall `p_value < 0.05` (alpha 0.05).
- `direction`: "increasing" or "decreasing" only when significant; otherwise "no_trend".
- The app shows three verdicts: **Clear trend (significant)**, **Not proven yet** (not significant), and
  **Not enough data**.

### 3.5 Maps (one test per grid cell)
- On the trend map every grid cell gets its own Seasonal Mann-Kendall test and Sen's slope.
- Because the map runs hundreds of thousands of tests at once, some would look significant by pure chance. The map
  therefore uses the **Benjamini-Hochberg false discovery rate (FDR)** correction: a cell is significant only if its
  corrected value `q < 0.05` (`significant_fdr`).
- Colours: rising = orange, falling = blue (darker = faster), not significant after FDR = pale and striped,
  no data = grey.

### 3.6 Comparing two places (Contradiction hunt)
- Both places are tested as in 3.3. Then the backend takes the difference of their anomalies month by month
  (A minus B) and tests whether that difference has a trend:
  - `slope_diff_per_decade`: Sen's slope of the difference (trend of A minus trend of B).
  - `p_value`: Hamed-Rao Mann-Kendall test on the difference.
  - `ci`: 95% interval from a moving-block bootstrap (blocks of 12 months, 1000 repeats).
  - `stable_halves`: whether each place keeps the same trend sign in the first and second half of the period.
- Using the difference cancels shared ups and downs (for example a climate pattern that affects both places), so this
  is stricter than comparing two separate p-values.
- Verdicts:
  - **opposite_significant** ("Contradiction confirmed"): the two trends have opposite signs **and** the
    difference is significant (p < 0.05 **and** the interval does not include 0).
  - **opposite_not_significant**: opposite signs, but the difference is not proven.
  - **same_direction**: both trends have the same sign.
  - **insufficient_data**: at least one place does not have enough data.

---

## 4. How to read and explain results

- **Rate**: "about X [units] per decade" means the typical change over 10 years. Do not turn it into a total change
  or a yearly rate yourself; only repeat numbers that FACTS contains.
- **p-value**: the chance of seeing a trend at least this strong if there were really no trend. Small p (below 0.05)
  means the trend is unlikely to be just chance. p is **not** the probability that the trend is real.
- **Not significant does not mean no change.** It means the data cannot yet tell the trend apart from natural
  ups and downs; a longer period or a larger area may help.
- **Significant does not mean important.** A tiny change can be significant over a large area.
- **Confidence interval**: a range of rates that fit the data; if it contains 0, the direction is uncertain.
- **Data quality**: `quality.n_months` and `quality.missing_months` say how many months had data;
  `quality.coverage_fraction` says what share of the area's cells had data on average.
- Trends are **estimated past trends, not forecasts**. Never extend them into the future.

### 4.1 Plain-language glossary
| Term | Simple meaning |
|---|---|
| Anomaly | How much a month differs from what is normal for that month |
| Trend | A steady rise or fall over the years, after removing the seasons |
| Sen's slope | The typical rate of change, not pulled around by unusual months |
| p-value | How likely a trend this strong would appear by chance alone |
| Significant | Unlikely to be chance (p below 0.05) |
| Confidence interval | The range the true rate probably lies in |
| FDR correction | A stricter rule for maps, because testing many places at once creates false alarms |
| Autocorrelation | When one month is similar to the next, which makes data look more certain than it is |
| Reanalysis | A weather model that is constantly corrected with real observations |
| Land surface model | A computer model of water and energy in soil and plants, driven by observations |
| Grid cell | One square of the map (0.5° by 0.5°) whose values are averaged |

---

## 5. Possible drivers (general background only, never tested by Terra-scope)

Terra-scope does not test causes. If the user asks "why", first say that Terra-scope only measures the change, then
you may mention **at most two** of the general possibilities below, labelled as general background that Terra-scope
did not test. Do not name specific events, years, policies, companies or numbers that are not in FACTS.

| Variable | Commonly discussed influences (not tested here) |
|---|---|
| Air temperature | Global warming from greenhouse gases; local land use change such as cities and deforestation; aerosols and air pollution; natural climate patterns such as El Niño and La Niña |
| Precipitation | Natural climate patterns such as El Niño and La Niña and monsoon variability; shifts in atmospheric circulation linked to warming |
| Soil moisture | Changes in rainfall and in evaporation; warmer air drying the soil; for GLDAS, changes in the observations fed into the model |
| Evapotranspiration | Temperature and sunshine; water available in the soil; plant cover |

---

## 6. What the Detective must not do
- Invent or estimate any number, date, place, dataset or result that is not in FACTS.
- Describe a result for a place, variable or period that FACTS does not contain. Instead, suggest running that
  analysis in the app.
- Say a trend will continue, or predict any future value.
- State a cause as fact.
- Treat model or reanalysis data as direct measurements.
- Hide disagreements between datasets or warnings listed in FACTS.
- Use external knowledge about specific events (for example a named drought or flood) as if Terra-scope found it.
