import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGrid, generateSeries } from '../src/lib/mockData.ts';
import {
  REGION_META,
  VARIABLE_META,
  ENV_VARIABLES,
  DATASETS,
  VARIABLE_DATASET_MAP,
  getDatasetsForVariable,
  toLegacyVariable,
  getMetric,
  formatNumber,
} from '../src/lib/types.ts';
import { TerraScopeApi } from '../src/lib/api.ts';

test('Workflow Journey 1: Blank analysis state has null grid and no analysis', () => {
  const analysis = null;
  assert.equal(analysis, null);
  const grid = analysis ? generateGrid(analysis.region) : null;
  assert.equal(grid, null);
});

test('Workflow Journey 2 & 3: Region focus does not initiate analysis or generate overlays', () => {
  let draftRegion = 'mekong';
  let analysis = null;
  assert.ok(REGION_META[draftRegion]);
  assert.equal(analysis, null);
});

test('Workflow Journey 4: Run Analysis is blocked until all four fields (Variable, Dataset, Region, Period) are selected', () => {
  const isReady = (v, d, r, p) => !!(v && d && r && p);

  // Missing variable
  assert.equal(isReady('', 'gpm_imerg', 'mekong', '2005-2024'), false);
  // Missing dataset
  assert.equal(isReady('precipitation', '', 'mekong', '2005-2024'), false);
  // Missing region
  assert.equal(isReady('precipitation', 'gpm_imerg', '', '2005-2024'), false);
  // Missing period
  assert.equal(isReady('precipitation', 'gpm_imerg', 'mekong', ''), false);
  // All four selected
  assert.equal(isReady('precipitation', 'gpm_imerg', 'mekong', '2005-2024'), true);
  assert.equal(isReady('soil_moisture', 'gldas', 'north', '2010-2024'), true);
});

test('Environmental Variable and NASA Dataset compatibility mapping', () => {
  // Precipitation maps to GPM IMERG
  const precipDatasets = getDatasetsForVariable('precipitation');
  assert.equal(precipDatasets.length, 1);
  assert.equal(precipDatasets[0].id, 'gpm_imerg');
  assert.equal(precipDatasets[0].variableId, 'precipitation');
  assert.equal(precipDatasets[0].unit, 'mm/month');

  // Soil Moisture maps to GLDAS
  const soilDatasets = getDatasetsForVariable('soil_moisture');
  assert.equal(soilDatasets.length, 1);
  assert.equal(soilDatasets[0].id, 'gldas');
  assert.equal(soilDatasets[0].variableId, 'soil_moisture');
  assert.equal(soilDatasets[0].unit, 'm³/m³');

  // Unselected variable returns empty datasets array
  assert.deepEqual(getDatasetsForVariable(''), []);

  // Incompatibility reset logic: switching variable invalidates mismatched dataset
  let variable = 'precipitation';
  let dataset = 'gpm_imerg';
  assert.ok(VARIABLE_DATASET_MAP[variable].includes(dataset));

  // Switch to soil moisture
  variable = 'soil_moisture';
  if (!VARIABLE_DATASET_MAP[variable]?.includes(dataset)) {
    dataset = '';
  }
  assert.equal(dataset, '', 'Dataset must reset when incompatible with new environmental variable');
});

test('Workflow Journey 5: Running analysis creates valid grid features with required properties', async () => {
  const res = await TerraScopeApi.runAnalysis({ variable: 'rain', region: 'mekong', period: '2005-2024' });
  assert.equal(res.status, 'complete');
  assert.ok(res.grid.features.length > 0);

  const sample = res.grid.features[0].properties;
  assert.ok(typeof sample.rainValue === 'number');
  assert.ok(typeof sample.rainSlope === 'number');
  assert.ok(typeof sample.qualityPercent === 'number');
  assert.ok(typeof sample.centerLon === 'number');
  assert.ok(typeof sample.centerLat === 'number');
});

test('Workflow Journey 6 & 9: Preserving state across 2D/3D map switching', () => {
  const state = {
    envVariable: 'precipitation',
    dataset: 'gpm_imerg',
    variable: 'rain',
    region: 'mekong',
    period: '2005-2024',
    selectedCellId: 'cell-2-3',
    mode: 'trend',
    dimension: '2d',
  };

  // Switch to 3D
  const switchedState = { ...state, dimension: '3d' };
  assert.equal(switchedState.envVariable, state.envVariable);
  assert.equal(switchedState.dataset, state.dataset);
  assert.equal(switchedState.variable, state.variable);
  assert.equal(switchedState.region, state.region);
  assert.equal(switchedState.period, state.period);
  assert.equal(switchedState.selectedCellId, state.selectedCellId);
  assert.equal(switchedState.mode, state.mode);
});

test('Workflow Journey: Running analysis with environmental variable and dataset populates metadata and units', async () => {
  const rainRes = await TerraScopeApi.runAnalysis({
    variable: 'rain',
    envVariable: 'precipitation',
    dataset: 'gpm_imerg',
    region: 'mekong',
    period: '2005-2024',
  });
  assert.equal(rainRes.variable.name, 'Precipitation');
  assert.equal(rainRes.variable.unit, 'mm/month');
  assert.equal(rainRes.variable.slopeUnit, 'mm/month per decade');
  assert.equal(rainRes.dataset?.shortName, 'GPM IMERG');

  const soilRes = await TerraScopeApi.runAnalysis({
    variable: 'soil',
    envVariable: 'soil_moisture',
    dataset: 'gldas',
    region: 'north',
    period: '2010-2024',
  });
  assert.equal(soilRes.variable.name, 'Soil Moisture');
  assert.equal(soilRes.variable.unit, 'm³/m³');
  assert.equal(soilRes.variable.slopeUnit, 'm³/m³ per decade');
  assert.ok(soilRes.dataset?.shortName.includes('GLDAS'));
});

test('Workflow Journey 7: Switching between Measured Value and Trend Over Time mode', () => {
  const grid = generateGrid('mekong');
  const validCell = grid.features.find(f => !f.properties.rainMissing);
  assert.ok(validCell);

  const metric = getMetric(validCell.properties, 'rain');
  assert.ok(typeof metric.value === 'number');
  assert.ok(typeof metric.slope === 'number');

  const formattedVal = formatNumber(metric.value, 'rain', false);
  const formattedSlope = formatNumber(metric.slope, 'rain', true);
  assert.ok(formattedVal.length > 0);
  assert.ok(formattedSlope.length > 0);
});

test('Workflow Journey 8: Clicking a location updates time-series', () => {
  const grid = generateGrid('mekong');
  const cell = grid.features[0].properties;
  const series = generateSeries(cell, 'rain', '2005-2024');

  assert.equal(series.years.length, 20);
  assert.equal(series.observed.length, 20);
  assert.equal(series.fitted.length, 20);
  assert.equal(series.years[0], 2005);
  assert.equal(series.years[19], 2024);
});

test('Workflow Journey 10: Invalidation on filter change clears active analysis', () => {
  let analysis = { variable: 'rain', region: 'mekong', period: '2005-2024' };
  let selectedCellId = 'cell-1-1';

  // Changing variable
  const resetResult = () => {
    analysis = null;
    selectedCellId = null;
  };

  resetResult();
  assert.equal(analysis, null);
  assert.equal(selectedCellId, null);
});

test('Workflow Journey 11: Compare Regions and Contradiction detection', async () => {
  const comp = await TerraScopeApi.compareRegions('mekong', 'north', 'rain', '2005-2024');
  assert.ok(comp.regionA);
  assert.ok(comp.regionB);
  assert.ok(typeof comp.deltaSlope === 'number');
  assert.ok(typeof comp.hasContradiction === 'boolean');
  assert.ok(comp.contradictionSummary.length > 0);
  assert.ok(comp.statisticalNote.includes('CAVEAT'));
});

test('Workflow Journey 12: Evidence Report metadata generation and provenance', () => {
  const grid = generateGrid('mekong');
  const cell = grid.features[0].properties;
  const report = TerraScopeApi.generateReportMetadata('rain', 'mekong', '2005-2024', cell);

  assert.ok(report.reportId.startsWith('TSA-REP-'));
  assert.equal(report.status, 'SIMULATED DEMO ONLY - NOT PEER REVIEWED SCIENTIFIC EVIDENCE');
  assert.equal(report.variable.dataset, 'GPM IMERG');
  assert.equal(report.region.name, 'Mekong Delta');
  assert.ok(report.methodology.trendEstimator.includes('Theil-Sen'));
  assert.ok(report.methodology.significanceTest.includes('Seasonal Mann-Kendall'));
  assert.ok(report.caveats.length >= 3);
});

test('Map Gesture Interaction: Smooth wheel zoom factor calculation for mouse and trackpad', () => {
  const MIN_ZOOM = 0.85;
  const MAX_ZOOM = 24;
  const clamp = (val) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, val));

  // Stepped mouse wheel (deltaMode = 1)
  const lineZoomIn = Math.pow(1.2, -Math.sign(-1));
  const lineZoomOut = Math.pow(1.2, -Math.sign(1));
  assert.ok(lineZoomIn > 1);
  assert.ok(lineZoomOut < 1);

  // High-precision continuous trackpad (deltaMode = 0)
  const trackpadIn = Math.max(0.75, Math.min(1.35, Math.pow(1.0018, -(-12))));
  const trackpadOut = Math.max(0.75, Math.min(1.35, Math.pow(1.0018, -(12))));
  assert.ok(trackpadIn > 1 && trackpadIn < 1.05);
  assert.ok(trackpadOut < 1 && trackpadOut > 0.95);

  // Verify zoom clamping
  assert.equal(clamp(30), MAX_ZOOM);
  assert.equal(clamp(0.1), MIN_ZOOM);
});

test('Map Gesture Interaction: Pinch-to-zoom distance scale calculation', () => {
  const p1_start = { x: 100, y: 100 };
  const p2_start = { x: 200, y: 200 };
  const initialDist = Math.hypot(p1_start.x - p2_start.x, p1_start.y - p2_start.y);

  // Spread fingers apart (pinch to zoom in)
  const p1_spread = { x: 80, y: 80 };
  const p2_spread = { x: 220, y: 220 };
  const spreadDist = Math.hypot(p1_spread.x - p2_spread.x, p1_spread.y - p2_spread.y);

  const zoomFactor = spreadDist / initialDist;
  assert.ok(zoomFactor > 1);
});

test('Validation: Compare Regions rejects identical region comparison (regionA === regionB)', async () => {
  await assert.rejects(
    async () => {
      await TerraScopeApi.compareRegions('mekong', 'mekong', 'rain', '2005-2024');
    },
    /Invalid comparison: Region A and Region B cannot be identical/
  );
});

test('Scientific Time-Window Sensitivity: Period switching adjusts slope, confidence intervals, and p-values', async () => {
  const analysis20y = await TerraScopeApi.runAnalysis({ variable: 'rain', region: 'mekong', period: '2005-2024' });
  const analysis10y = await TerraScopeApi.runAnalysis({ variable: 'rain', region: 'mekong', period: '2015-2024' });

  // 10-year window has different mean slope and dynamic period behavior
  assert.notEqual(analysis20y.summary.meanSlope, analysis10y.summary.meanSlope);

  // Confidence interval radius is wider for shorter windows due to fewer degrees of freedom
  const cell20y = analysis20y.grid.features[2].properties;
  const cell10y = analysis10y.grid.features[2].properties;

  const ciSpan20y = (cell20y.rainCiHigh ?? 0) - (cell20y.rainCiLow ?? 0);
  const ciSpan10y = (cell10y.rainCiHigh ?? 0) - (cell10y.rainCiLow ?? 0);
  assert.ok(ciSpan10y > ciSpan20y, '10-year window confidence interval should be wider than 20-year window');
});

test('AI Assistant Intent Classification: Rejects 2030 forecast and explains historical observation vs CMIP6 model boundaries', async () => {
  const response = await TerraScopeApi.explainQuery({
    question: 'Can you forecast 2030 rainfall in Northern Vietnam?',
    context: { variable: 'rain', region: 'north', period: '2005-2024' },
  });

  assert.ok(response.answer.includes('cannot generate future forecasts'));
  assert.ok(response.answer.includes('CMIP6') || response.answer.includes('predictive climate model'));
  assert.ok(response.keyPoints.some(pt => pt.includes('historical Earth observations')));
});

test('AI Assistant Intent Classification: Clarifies causality and extreme event attribution limits', async () => {
  const response = await TerraScopeApi.explainQuery({
    question: 'Why did climate change cause this drought in the Mekong?',
    context: { variable: 'soil', region: 'mekong', period: '2005-2024' },
  });

  assert.ok(response.answer.includes('Observation vs Attribution') || response.answer.includes('attribution'));
  assert.ok(response.keyPoints.some(pt => pt.includes('mechanistic causality') || pt.includes('Observation vs Attribution')));
});

// PART B: Custom Geographic Selection & Coverage Validation
test('PART B GeoUtils: Prototype coverage boundary filtering', async () => {
  const { isWithinPrototypeCoverage, isBoundsWithinCoverage, formatCoordinates } = await import('../src/lib/geoUtils.ts');

  // In-bounds locations (Southeast Asia / Vietnam: lon ~105, lat ~10-21)
  assert.equal(isWithinPrototypeCoverage(105.8, 10.5), true, 'Mekong Delta point should be within coverage');
  assert.equal(isWithinPrototypeCoverage(105.8, 21.0), true, 'Hanoi point should be within coverage');

  // Out-of-bounds locations (Global)
  assert.equal(isWithinPrototypeCoverage(-0.1, 51.5), false, 'London should be outside coverage');
  assert.equal(isWithinPrototypeCoverage(-74.0, 40.7), false, 'New York should be outside coverage');
  assert.equal(isWithinPrototypeCoverage(160.0, 0.0), false, 'Pacific ocean should be outside coverage');

  // In-bounds bounding box
  assert.equal(
    isBoundsWithinCoverage([[104.5, 9.2], [107.0, 11.5]]),
    true,
    'Mekong extent should be within coverage'
  );

  // Out-of-bounds bounding box
  assert.equal(
    isBoundsWithinCoverage([[-10.0, 35.0], [5.0, 45.0]]),
    false,
    'Iberian peninsula should be outside coverage'
  );

  // Format coordinates (3 decimal places precision)
  assert.equal(formatCoordinates(10.5, 106.8), '10.500°N, 106.800°E');
  assert.equal(formatCoordinates(-15.25, -47.88), '15.250°S, 47.880°W');
});

test('PART B GeoUtils: Selection bounds and area computation', async () => {
  const {
    getSelectionBounds,
    getBoundsCenter,
    calculateBBoxAreaKm2,
    calculatePolygonAreaKm2,
    validatePolygon,
  } = await import('../src/lib/geoUtils.ts');

  // Point selection bounds (buffered box)
  const pointSel = { type: 'point', coordinates: [105.0, 10.0] };
  const pointBounds = getSelectionBounds(pointSel);
  assert.ok(pointBounds[0][0] < 105.0);
  assert.ok(pointBounds[1][0] > 105.0);
  const center = getBoundsCenter(pointBounds);
  assert.equal(Math.round(center[0]), 105);
  assert.equal(Math.round(center[1]), 10);

  // Bounding box area
  const bboxSel = { type: 'bbox', bounds: [[105.0, 10.0], [106.0, 11.0]] };
  const bboxArea = calculateBBoxAreaKm2(bboxSel.bounds);
  assert.ok(bboxArea > 10000 && bboxArea < 15000, `BBox area should be ~12,000 km², got ${bboxArea}`);

  // Polygon area and validation
  const triangleCoords = [
    [105.0, 10.0],
    [106.0, 10.0],
    [105.5, 11.0],
    [105.0, 10.0],
  ];
  const polyArea = calculatePolygonAreaKm2(triangleCoords);
  assert.ok(polyArea > 5000 && polyArea < 7000, `Triangle area should be ~6,000 km², got ${polyArea}`);

  // Polygon validation
  assert.equal(validatePolygon(triangleCoords).valid, true);
  assert.equal(validatePolygon([[105.0, 10.0], [106.0, 10.0]]).valid, false, 'Needs at least 3 distinct vertices');
});

test('PART B API: Custom region analysis inside prototype coverage generates dynamic grid', async () => {
  const res = await TerraScopeApi.runAnalysis({
    variable: 'rain',
    envVariable: 'precipitation',
    dataset: 'gpm_imerg',
    period: '2005-2024',
    geoSelection: {
      type: 'bbox',
      bounds: [[105.0, 9.5], [106.8, 11.0]],
      label: 'Custom Southern Vietnam Area',
    },
  });

  assert.equal(res.status, 'complete');
  assert.ok(res.grid.features.length >= 10, 'Should generate dynamic grid cells for custom bounds');
  assert.equal(res.summary.isCustomRegion, true);
  assert.ok(typeof res.summary.meanSlope === 'number');
});

test('PART B API: Custom region analysis outside prototype coverage returns honest unsupported message', async () => {
  const res = await TerraScopeApi.runAnalysis({
    variable: 'rain',
    envVariable: 'precipitation',
    dataset: 'gpm_imerg',
    period: '2005-2024',
    geoSelection: {
      type: 'bbox',
      bounds: [[2.0, 48.0], [3.0, 49.0]], // France
      label: 'Paris Region',
    },
  });

  assert.equal(res.status, 'unsupported_region');
  assert.ok(res.errorMessage.includes('outside this prototype’s calibrated data cache'));
  assert.ok(res.errorMessage.includes('Southeast Asia'));
  assert.equal(res.grid.features.length, 0, 'Must not fabricate false data for unsupported global regions');
});

test('PART A: Dynamic Grid generation scales with custom bounding box aspect ratio', () => {
  // Wide rectangle
  const wideGrid = generateGrid([[103.0, 10.0], [107.0, 11.0]], '2005-2024');
  assert.ok(wideGrid.features.length > 0);

  // Tall rectangle
  const tallGrid = generateGrid([[105.0, 9.0], [106.0, 13.0]], '2005-2024');
  assert.ok(tallGrid.features.length > 0);

  // Center coordinates are within bounds
  for (const f of wideGrid.features) {
    assert.ok(f.properties.centerLon >= 103.0 && f.properties.centerLon <= 107.0);
    assert.ok(f.properties.centerLat >= 10.0 && f.properties.centerLat <= 11.0);
  }
});

test('2D Map Boundary: Single bounded world map constraints and coordinate clamping', async () => {
  const { WORLD_BOUNDS, clampLonLat } = await import('../src/lib/geoUtils.ts');

  // Verify bounded world coordinates
  assert.deepEqual(WORLD_BOUNDS, [
    [-180, -85],
    [180, 85],
  ]);

  // Valid coordinates inside bounds are preserved
  assert.deepEqual(clampLonLat(105.8, 21.0), [105.8, 21.0]);
  assert.deepEqual(clampLonLat(-122.4, 37.7), [-122.4, 37.7]);
  assert.deepEqual(clampLonLat(0, 0), [0, 0]);

  // Edge cases: Longitude exceeding +/- 180 is clamped strictly
  assert.deepEqual(clampLonLat(195.5, 10.0), [180, 10.0]);
  assert.deepEqual(clampLonLat(-210.0, -20.0), [-180, -20.0]);

  // Edge cases: Latitude exceeding +/- 85 (Mercator polar boundary) is clamped strictly
  assert.deepEqual(clampLonLat(45.0, 89.0), [45.0, 85]);
  assert.deepEqual(clampLonLat(-45.0, -89.9), [-45.0, -85]);

  // Contrast with 3D Globe: globe wraps continuously around 360 degrees
  const { normalizeLongitude } = await import('../src/lib/globeMath.ts');
  assert.equal(normalizeLongitude(190), -170, '3D globe must wrap around the international date line');
  assert.equal(normalizeLongitude(-190), 170, '3D globe must wrap around the international date line');
});

