/**
 * Terra-Scope AI - Scientific Environmental Heatmap Renderer
 * 
 * Generates continuous, bilinearly-interpolated georeferenced rasters
 * from discrete satellite grid measurements for NASA-grade visualizations.
 */

import {
  VARIABLE_META,
  getMetric,
  type Grid,
  type MapMode,
  type Variable,
} from './types.ts';

/** Color stop interface */
interface ColorStop {
  t: number; // 0.0 to 1.0
  r: number;
  g: number;
  b: number;
  a: number;
}

// Trend Over Time diverging scientific color ramp:
// Decreasing (Rich Amber/Orange) -> Neutral (Soft Ivory/Sand) -> Increasing (Deep Forest Emerald)
const TREND_RAMP_RAIN: ColorStop[] = [
  { t: 0.0, r: 180, g: 83, b: 9, a: 0.92 },     // Strong decrease (amber-700)
  { t: 0.25, r: 217, g: 119, b: 6, a: 0.85 },   // Moderate decrease (amber-600)
  { t: 0.42, r: 245, g: 158, b: 11, a: 0.75 },  // Slight decrease (amber-500)
  { t: 0.50, r: 245, g: 245, b: 240, a: 0.65 }, // Neutral zero trend (ivory)
  { t: 0.58, r: 74, g: 222, b: 128, a: 0.75 },  // Slight increase (green-400)
  { t: 0.75, r: 22, g: 163, b: 74, a: 0.85 },   // Moderate increase (green-600)
  { t: 1.0, r: 20, g: 83, b: 45, a: 0.92 },     // Strong increase (green-900)
];

const TREND_RAMP_SOIL: ColorStop[] = [
  { t: 0.0, r: 194, g: 65, b: 12, a: 0.92 },    // Drying trend (orange-700)
  { t: 0.25, r: 234, g: 88, b: 12, a: 0.85 },   // Moderate drying
  { t: 0.42, r: 251, g: 146, b: 60, a: 0.75 },  // Slight drying
  { t: 0.50, r: 248, g: 245, b: 238, a: 0.65 }, // Neutral zero
  { t: 0.58, r: 56, g: 189, b: 248, a: 0.75 },  // Slight moistening
  { t: 0.75, r: 14, g: 165, b: 233, a: 0.85 },  // Moderate moistening
  { t: 1.0, r: 12, g: 74, b: 110, a: 0.92 },    // Strong moistening (sky-900)
];

// Measured Value sequential scientific color ramps:
// Precipitation: Light azure -> Cyan -> Rich Ocean Teal
const VALUE_RAMP_RAIN: ColorStop[] = [
  { t: 0.0, r: 224, g: 242, b: 254, a: 0.70 },
  { t: 0.2, r: 125, g: 211, b: 252, a: 0.78 },
  { t: 0.45, r: 56, g: 189, b: 248, a: 0.84 },
  { t: 0.7, r: 14, g: 165, b: 233, a: 0.90 },
  { t: 0.88, r: 2, g: 132, b: 199, a: 0.93 },
  { t: 1.0, r: 15, g: 76, b: 129, a: 0.95 },
];

// Soil Moisture: Soft Sand -> Chartreuse -> Deep Aqua
const VALUE_RAMP_SOIL: ColorStop[] = [
  { t: 0.0, r: 254, g: 249, b: 195, a: 0.70 },
  { t: 0.25, r: 217, g: 249, b: 157, a: 0.78 },
  { t: 0.5, r: 132, g: 204, b: 22, a: 0.84 },
  { t: 0.75, r: 20, g: 184, b: 166, a: 0.90 },
  { t: 1.0, r: 19, g: 78, b: 74, a: 0.95 },
];

function sampleRamp(ramp: ColorStop[], t: number): [number, number, number, number] {
  const clampedT = Math.max(0, Math.min(1, t));
  for (let i = 0; i < ramp.length - 1; i++) {
    const s0 = ramp[i];
    const s1 = ramp[i + 1];
    if (clampedT >= s0.t && clampedT <= s1.t) {
      const span = s1.t - s0.t;
      const f = span > 0 ? (clampedT - s0.t) / span : 0;
      return [
        Math.round(s0.r + (s1.r - s0.r) * f),
        Math.round(s0.g + (s1.g - s0.g) * f),
        Math.round(s0.b + (s1.b - s0.b) * f),
        s0.a + (s1.a - s0.a) * f,
      ];
    }
  }
  const last = ramp[ramp.length - 1];
  return [last.r, last.g, last.b, last.a];
}

/**
 * Generate a continuous, bilinearly smoothed raster canvas from a discrete Grid.
 * Applies visual interpolation without fabricating underlying measurements.
 */
export function generateSmoothedRaster(
  grid: Grid,
  variable: Variable,
  mode: MapMode,
  outWidth = 384,
  outHeight = 384
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  if (!grid.features || grid.features.length === 0) {
    return canvas;
  }

  // Determine grid dimensions (cols and rows) by unique X and Y center coordinates
  const lonSet = new Set<number>();
  const latSet = new Set<number>();
  for (const f of grid.features) {
    lonSet.add(f.properties.centerLon);
    latSet.add(f.properties.centerLat);
  }
  const uniqueLons = Array.from(lonSet).sort((a, b) => a - b);
  const uniqueLats = Array.from(latSet).sort((a, b) => b - a); // North to South
  const cols = uniqueLons.length;
  const rows = uniqueLats.length;

  if (cols < 2 || rows < 2) {
    return canvas;
  }

  // Populate 2D measurement matrix
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  const missingMatrix: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const sigFdrMatrix: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(true));

  const lonIndexMap = new Map<number, number>(uniqueLons.map((lon, i) => [lon, i]));
  const latIndexMap = new Map<number, number>(uniqueLats.map((lat, i) => [lat, i]));

  const vMeta = VARIABLE_META[variable];

  for (const f of grid.features) {
    const xi = lonIndexMap.get(f.properties.centerLon);
    const yi = latIndexMap.get(f.properties.centerLat);
    if (xi === undefined || yi === undefined) continue;

    const m = getMetric(f.properties, variable);
    if (m.missing) {
      missingMatrix[yi][xi] = true;
    } else {
      matrix[yi][xi] = mode === 'trend' ? m.slope : m.value;
      // Rule R4: Grid significance is determined by significant_fdr (False Discovery Rate)
      sigFdrMatrix[yi][xi] = m.significantFdr ?? m.significant;
    }
  }

  // Pre-calculate min/max for normalization
  let minVal = Infinity, maxVal = -Infinity;
  if (mode === 'trend') {
    const maxSlope = variable === 'rain' ? vMeta.range : vMeta.range;
    minVal = -maxSlope;
    maxVal = maxSlope;
  } else {
    minVal = vMeta.valueMin;
    maxVal = vMeta.valueMax;
  }

  const ramp = mode === 'trend'
    ? (variable === 'rain' ? TREND_RAMP_RAIN : TREND_RAMP_SOIL)
    : (variable === 'rain' ? VALUE_RAMP_RAIN : VALUE_RAMP_SOIL);

  const imgData = ctx.createImageData(outWidth, outHeight);
  const data = imgData.data;

  // Bilinear interpolation across grid centers with continuous color mapping
  for (let py = 0; py < outHeight; py++) {
    // Map pixel Y to continuous row index
    const gy = (py / (outHeight - 1)) * (rows - 1);
    const r0 = Math.floor(gy);
    const r1 = Math.min(rows - 1, r0 + 1);
    const fy = gy - r0;

    for (let px = 0; px < outWidth; px++) {
      // Map pixel X to continuous col index
      const gx = (px / (outWidth - 1)) * (cols - 1);
      const c0 = Math.floor(gx);
      const c1 = Math.min(cols - 1, c0 + 1);
      const fx = gx - c0;

      // Check missing flags in the 4 surrounding points
      const m00 = missingMatrix[r0][c0];
      const m10 = missingMatrix[r0][c1];
      const m01 = missingMatrix[r1][c0];
      const m11 = missingMatrix[r1][c1];

      const di = (py * outWidth + px) * 4;

      if (m00 && m10 && m01 && m11) {
        // Fully missing cell area: transparent
        data[di] = 0;
        data[di + 1] = 0;
        data[di + 2] = 0;
        data[di + 3] = 0;
        continue;
      }

      // Bilinear interpolation of value
      const v00 = matrix[r0][c0];
      const v10 = matrix[r0][c1];
      const v01 = matrix[r1][c0];
      const v11 = matrix[r1][c1];

      const top = v00 * (1 - fx) + v10 * fx;
      const bottom = v01 * (1 - fx) + v11 * fx;
      const interpolatedVal = top * (1 - fy) + bottom * fy;

      // Normalize to [0, 1]
      const t = maxVal > minVal ? (interpolatedVal - minVal) / (maxVal - minVal) : 0.5;
      const [r, g, b, alpha] = sampleRamp(ramp, t);

      // Rule R4 & Section 6: Non-significant cells (FDR) are rendered with subdued contrast rather than being hidden
      let finalAlpha = alpha;
      if (mode === 'trend') {
        const s00 = sigFdrMatrix[r0][c0] ? 1 : 0;
        const s10 = sigFdrMatrix[r0][c1] ? 1 : 0;
        const s01 = sigFdrMatrix[r1][c0] ? 1 : 0;
        const s11 = sigFdrMatrix[r1][c1] ? 1 : 0;
        const sigInterp = (s00 * (1 - fx) + s10 * fx) * (1 - fy) + (s01 * (1 - fx) + s11 * fx) * fy;
        finalAlpha = alpha * (0.58 + 0.42 * sigInterp);
      }

      data[di] = r;
      data[di + 1] = g;
      data[di + 2] = b;
      data[di + 3] = Math.round(finalAlpha * 255);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
