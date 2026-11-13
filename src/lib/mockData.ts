import type { Feature, Polygon } from 'geojson';
import { REGION_META, type CellProperties, type Grid, type RegionId, type Variable } from './types.ts';

// Deliberately synthetic. No observations, p-values or intervals here are from NASA.
export function generateGrid(
  regionOrBounds: RegionId | [[number, number], [number, number]],
  period = "2005-2024"
): Grid {
  let minLon: number, minLat: number, maxLon: number, maxLat: number;
  let cols = 9, rows = 7;
  let isNorth = false;

  if (typeof regionOrBounds === 'string') {
    [[minLon, minLat], [maxLon, maxLat]] = REGION_META[regionOrBounds].bounds;
    isNorth = regionOrBounds === 'north';
  } else {
    [[minLon, minLat], [maxLon, maxLat]] = regionOrBounds;
    const spanLon = Math.max(0.1, maxLon - minLon);
    const spanLat = Math.max(0.1, maxLat - minLat);
    cols = Math.max(5, Math.min(14, Math.round(spanLon / 0.25)));
    rows = Math.max(5, Math.min(12, Math.round(spanLat / 0.25)));
    isNorth = (minLat + maxLat) / 2 > 15;
  }

  const features: Feature<Polygon, CellProperties>[] = [];

  // Parse time window to derive scientifically realistic window-dependent statistics
  const [startYearRaw, endYearRaw] = period.split("-").map(Number);
  const startYear = isNaN(startYearRaw) ? 2005 : startYearRaw;
  const endYear = isNaN(endYearRaw) ? 2024 : endYearRaw;
  const span = Math.max(5, endYear - startYear + 1);

  // Decadal shift factors: shorter recent windows (e.g. 2015-2024) have slightly different sample slopes,
  // higher sampling variance, and wider confidence intervals (due to sqrt(N) degrees of freedom).
  const windowOffset = (startYear - 2005) / 10;
  const slopeScale = 1.0 + windowOffset * 0.28;
  const ciRadiusMultiplier = Math.sqrt(20 / span); // ~1.0 for 20y, ~1.15 for 15y, ~1.41 for 10y
  const powerPenalty = (20 - span) * 0.0035; // Lower degrees of freedom slightly elevate borderline p-values

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const west = minLon + (maxLon - minLon) * x / cols;
      const east = minLon + (maxLon - minLon) * (x + 1) / cols;
      const south = minLat + (maxLat - minLat) * y / rows;
      const north = minLat + (maxLat - minLat) * (y + 1) / rows;
      const centerLon = Number(((west + east) / 2).toFixed(3));
      const centerLat = Number(((south + north) / 2).toFixed(3));
      
      const baseRainSlope = (0.55 * (x - 4) + 0.62 * Math.sin(y * 1.35 + (isNorth ? 1.3 : 0)));
      const baseSoilSlope = (0.0014 * (x - 4) - 0.0005 * Math.cos(y * 1.7));

      const rainSlope = Number((baseRainSlope * slopeScale + (windowOffset * 0.12 * Math.cos(x * 1.2))).toFixed(4));
      const soilSlope = Number((baseSoilSlope * slopeScale + (windowOffset * 0.0003 * Math.sin(y * 1.5))).toFixed(6));

      const missing = (x + y * 3) % 17 === 0;
      const significance = (slope: number, threshold: number) => Math.abs(slope) > threshold && (x + y * 2) % 5 !== 0;
      const rainSignificant = !missing && significance(rainSlope, 0.45 * (span >= 15 ? 1.0 : 1.15));
      const soilSignificant = !missing && significance(soilSlope, 0.0009 * (span >= 15 ? 1.0 : 1.15));
      
      const interval = (slope: number, sig: boolean, buffer: number): [number, number] => {
        const radius = (sig ? Math.abs(slope) * 0.58 : Math.abs(slope) + buffer) * ciRadiusMultiplier;
        return [Number((slope - radius).toFixed(4)), Number((slope + radius).toFixed(4))];
      };
      const [rainCiLow, rainCiHigh] = interval(rainSlope, rainSignificant, 0.35);
      const [soilCiLow, soilCiHigh] = interval(soilSlope, soilSignificant, 0.0005);

      const baseRainP = rainSignificant ? 0.006 + ((x + y) % 7) * 0.004 : 0.12 + ((x + y) % 7) * 0.05;
      const baseSoilP = soilSignificant ? 0.008 + ((x + y) % 6) * 0.005 : 0.11 + ((x + y) % 6) * 0.07;
      
      const rainP = missing ? null : Number(Math.min(0.99, baseRainP + powerPenalty).toFixed(3));
      const soilP = missing ? null : Number(Math.min(0.99, baseSoilP + powerPenalty).toFixed(3));

      const valueShiftRain = windowOffset * (isNorth ? -2.4 : 3.6);
      const valueShiftSoil = windowOffset * (isNorth ? -0.004 : 0.006);
      const regionalBaseRain = isNorth ? 142 : 198;
      const regionalBaseSoil = isNorth ? 0.31 : 0.21;

      const props: CellProperties = {
        id: `cell-${x}-${y}`,
        label: `Grid cell ${x + 1}, ${y + 1}`,
        centerLon,
        centerLat,
        rainValue: Number((regionalBaseRain + (x - 4) * 6 + (y - 3) * 5 + 12 * Math.sin(x * 0.8 + y) + valueShiftRain).toFixed(2)),
        rainSlope,
        rainP,
        rainCiLow: missing ? null : rainCiLow,
        rainCiHigh: missing ? null : rainCiHigh,
        rainSignificant,
        rainSignificantFdr: rainSignificant && rainP !== null && rainP <= 0.045,
        rainMissing: missing,
        soilValue: Number((regionalBaseSoil + (x - 4) * 0.008 + (y - 3) * 0.005 + 0.012 * Math.cos(x + y * 0.7) + valueShiftSoil).toFixed(4)),
        soilSlope,
        soilP,
        soilCiLow: missing ? null : soilCiLow,
        soilCiHigh: missing ? null : soilCiHigh,
        soilSignificant,
        soilSignificantFdr: soilSignificant && soilP !== null && soilP <= 0.045,
        soilMissing: missing,
        qualityPercent: missing ? 20 : (isNorth ? 88 : 84) + ((x * 3 + y * 5) % 11),
      };
      features.push({
        type: 'Feature',
        id: props.id,
        properties: props,
        geometry: {
          type: 'Polygon',
          coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

export function generateSeries(props: CellProperties, variable: Variable, period = "2005-2024") {
  const value = variable === 'rain' ? props.rainValue : props.soilValue;
  const slope = variable === 'rain' ? props.rainSlope : props.soilSlope;
  const amplitude = variable === 'rain' ? 14 : 0.018;
  const [start, end] = period.split("-").map(Number);
  const years = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const midYear = (start + end) / 2;
  return {
    years,
    observed: years.map((year, i) => +(value + slope * (year - midYear) + amplitude * Math.sin(i * 1.7 + props.rainValue)).toFixed(variable === 'rain' ? 2 : 5)),
    fitted: years.map(year => +(value + slope * (year - midYear)).toFixed(variable === 'rain' ? 2 : 5)),
  };
}
