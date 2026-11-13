# Terra-Scope AI UI implementation notes

## Navigation

Three pages: **Dashboard** (includes all trend-exploration features), **Compare Regions**, and **Evidence Report**. Trend Explorer was removed because it duplicated Dashboard's map, time series and selected-location statistics.

## Shared map state

The Dashboard owns `mapDimension` (`2d` / `3d`), `mode` (`value` / `trend`), `draftVariable`, `draftRegion`, `draftPeriod`, `analysis`, and `selectedCellId`. The same props are passed to the 2D and 3D map components. Switching dimensions does not reset the selected location or analysis. Changing an input clears stale analysis results.

## Screen states

| State | 2D or 3D | Environmental overlay | Evidence |
|---|---|---|---|
| First visit | Global Earth | None | Hidden |
| Region chosen | Focused region | None | Hidden |
| All inputs selected | Focused region | None | Hidden |
| Analysis complete | Focused region | Simulated geographic raster | Prompt to select a location |
| Location selected | Focused region | Simulated raster + selected cell | Statistics + ECharts line chart |

## Environmental visualization

- **Measured value:** Sequential green palette for lower-to-higher simulated values.
- **Trend over time:** Diverging orange / near-neutral / green palette for decreasing / near-zero / increasing slopes.
- Significance and missing-data quality must be communicated separately from the slope direction.
- The raster is rendered in geographic coordinates on both the 2D MapLibre map and the orthographic 3D globe.
- The 3D globe uses a Canvas2D spherical renderer with bundled geographic coastline data and does not need WebGL. It is not a terrain-elevation map.

## Scientific warning

All analysis values are synthetic. The final backend must calculate the slopes, p-values, confidence intervals, quality and uncertainty using validated statistical methods. Confirm units, aggregation, seasonality, autocorrelation and multiple-testing treatment with Đăng and Long.

## API handoff

Proposed routes: `/variables`, `/regions`, `/series`, `/trends`, `/compare`, `/explain`, `/reports`. Coordinate JSON schemas with Hưng before integration. For raster data, supply geographic bounds and source metadata; for a selected location, supply series, slope, CI, p-value, completeness and quality flags.
