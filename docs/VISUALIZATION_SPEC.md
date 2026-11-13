# Map visualization specification and proposed API contract

**Status:** proposal for teammate review. Not yet agreed with Hưng or Đăng.

## Why both maps?

The original team requirements say: **"Heatmap hiển thị xu hướng tăng/giảm theo vùng"** (heatmap showing increasing/decreasing trends by region). Both views are useful, but answer different questions:

| Mode | Question answered | Input | Color scale |
| --- | --- | --- | --- |
| Measured value (sequential heatmap-style map) | Where are values high or low? | Regional mean/aggregated value | Light to dark blue |
| Trend over time (diverging choropleth) | Where are values increasing or decreasing, and how fast? | Theil-Sen slope or another validated trend estimate | Orange through neutral to purple |

**Terminology:** The current prototype renders colored GeoJSON grid polygons in both modes, not a kernel-density heatmap. For environmental raster/cell measurements this is often more appropriate. A density heatmap for point events would answer a different question.

**Default:** Trend over time, because change is the product's main scientific question. Both modes share the same map extent and selected grid cell.

## Visual encodings

- Trend slope < 0: orange. Slope near 0: light neutral. Slope > 0: purple.
- Significance: not a third color dimension. Reduce opacity for trends that do not meet the team's significance criterion. Always show the numeric p-value and confidence interval separately.
- Missing/invalid data: gray, with "No data" in the tooltip. A production implementation may add hatch patterns for stronger accessibility.
- Measured value: sequential blue palette, with units in the legend.
- Each map legend must show the variable, statistic, units, numerical endpoints, and what faded/gray cells mean.
- Use text as well as color to convey direction and significance; do not rely on color alone.
- Treat p-value and confidence interval as results from the backend. **The frontend must not calculate scientific significance.**

## Proposed frontend/backend contract (requires Hưng's approval)

The frontend should be independent of NASA dataset specifics. The backend should normalize the following schema. These are **illustrative examples**, not real measurements.

### GET /variables

```json
{
  "variables": [
    {"id": "precipitation", "label": "Precipitation", "dataset_id": "gpm_imerg", "value_unit": "mm/month", "slope_unit": "mm/month/year"},
    {"id": "soil_moisture", "label": "Soil moisture", "dataset_id": "gldas", "value_unit": "m3/m3", "slope_unit": "m3/m3/year"}
  ]
}
```

### POST /trends (proposed, confirm method with Hưng)

```json
{
  "dataset_id": "gpm_imerg",
  "variable_id": "precipitation",
  "region_id": "demo_region",
  "start_date": "2005-01-01",
  "end_date": "2024-12-31",
  "aggregation": "annual_mean_of_monthly_values"
}
```

### Response (proposed)

```json
{
  "analysis_id": "example-analysis-id",
  "status": "complete",
  "source": {"dataset_id": "gpm_imerg", "provider": "NASA", "version": "to_be_filled_by_backend"},
  "variable": {"id": "precipitation", "value_unit": "mm/month", "slope_unit": "mm/month/year"},
  "period": {"start": "2005-01-01", "end": "2024-12-31"},
  "statistics": {"slope_method": "theil_sen", "test_method": "to_be_confirmed", "alpha": 0.05, "multiple_testing_method": "to_be_confirmed"},
  "cells": {
    "type": "FeatureCollection",
    "features": [{
      "type": "Feature",
      "id": "cell-1",
      "properties": {
        "id": "cell-1", "label": "Cell 1", "value": 150.0, "slope": 0.8,
        "p_value": 0.02, "ci_low": 0.1, "ci_high": 1.5,
        "significant": true, "valid_fraction": 0.96, "status": "ok"
      },
      "geometry": {"type": "Polygon", "coordinates": [[[105,10],[106,10],[106,11],[105,11],[105,10]]]}
    }]
  }
}
```

For missing cells, set `status` to `insufficient_data` or `missing`, set unsupported numbers to `null`, and provide a reason. Do not encode missing data as zero. The `significant` flag must reflect the approved statistical procedure, including multiple-testing corrections when applicable. The `ci_low` and `ci_high` here refer to the **slope** and use the same slope units. Metadata should include how cells were aggregated and the observation quality rules.

### GET /series?analysis_id=...&cell_id=... (proposed)

```json
{
  "analysis_id": "example-analysis-id",
  "cell_id": "cell-1",
  "value_unit": "mm/month",
  "points": [
    {"date": "2005-01-01", "value": 120.0, "valid_fraction": 0.95},
    {"date": "2006-01-01", "value": 125.0, "valid_fraction": 0.98}
  ],
  "trend_line": [{"date": "2005-01-01", "value": 121.0}, {"date": "2006-01-01", "value": 121.8}]
}
```

The backend and Đăng should determine the actual observation aggregation, slope method, trend-line meaning, confidence interval method, and how seasonality/autocorrelation/multiple comparisons are handled. **Do not draw a per-year confidence band from a confidence interval on the slope.**

## UI states and acceptance tests

1. New visitor sees a three-step analysis guide and understands the difference between the two modes.
2. Both map modes work without changing the chosen region; each has its own legend and units.
3. Clicking a cell updates details and chart; hover shows a value with units.
4. Non-significant trends are visually distinct from significant trends, and text explains that distinction.
5. Missing data never appear as zero or as a significant trend.
6. On narrow screens, controls stack above the map and the legend stays readable.
7. When connected to real APIs, show explicit loading, empty, timeout, and retry states.
8. The evidence report must include dataset/version, temporal/spatial resolution, aggregation, units, statistical method, uncertainty, and limitations.
9. Production spatial visualization must use an appropriate projection/aggregation and performance strategy for raster resolution.
10. The demo must always disclose when it uses synthetic data.

## What to confirm with teammates

- **Đăng:** whether precipitation is mean rate, monthly accumulation, or another derived statistic; statistical significance and CI definition.
- **Long:** spatial grid/polygon encoding, QA mask, null semantics, aggregation and performance for real rasters.
- **Hưng:** endpoint methods, normalized JSON keys, async status handling, request IDs, errors, and response pagination/tiling.
- **Team:** default map mode, visual palette, demo geography, and whether both modes should ship in the first release.
