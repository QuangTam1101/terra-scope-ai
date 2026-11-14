// Phase 8.5C/D helpers: search extents, compatible dataset pairs, and descriptive statistics used by the
// exploration views. Nothing here decides significance: verdicts always come from the backend test.
import type { BBox, SeriesPoint, Variable } from "./api";

export const EXTENTS: { id: string; name: string; bbox: BBox }[] = [
  { id: "sea", name: "Southeast Asia", bbox: [90, -12, 150, 30] },
  { id: "sahel", name: "Sahel and Sahara", bbox: [-20, 0, 40, 25] },
  { id: "europe", name: "Europe", bbox: [-12, 35, 45, 72] },
  { id: "na", name: "North America", bbox: [-170, 15, -50, 75] },
  { id: "sa", name: "South America", bbox: [-85, -57, -30, 15] },
  { id: "africa", name: "Africa", bbox: [-20, -36, 55, 38] },
  { id: "world", name: "Whole world (use 10° or 20° tiles)", bbox: [-180, -90, 180, 90] },
];

// Same pairs as backend app/hunt.py COMPATIBLE: same physical quantity, same units.
const PAIRS: [string, string][] = [
  ["gldas_air_temperature", "merra2_air_temperature_2m"],
  ["gldas_evapotranspiration", "modis_et"],
];
export function compatiblePartner(id: string, variables: Variable[]): Variable | null {
  for (const [a, b] of PAIRS) {
    const other = id === a ? b : id === b ? a : null;
    const v = other ? variables.find((x) => x.id === other && x.available) : undefined;
    if (v) return v;
  }
  return null;
}

/** Pearson correlation over months where both values exist (descriptive). */
export function correlation(a: (number | null)[], b: (number | null)[]): { r: number; n: number } | null {
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== null && b[i] !== null) { xs.push(a[i]!); ys.push(b[i]!); }
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? { r: sxy / Math.sqrt(sxx * syy), n } : null;
}

/** Theil-Sen slope (median of pairwise slopes) for yearly values, per decade. Descriptive only: no test. */
export function senPerDecade(years: number[], values: number[]): number | null {
  const s: number[] = [];
  for (let i = 0; i < years.length; i++) for (let j = i + 1; j < years.length; j++)
    if (years[j] !== years[i]) s.push((values[j] - values[i]) / (years[j] - years[i]));
  if (!s.length) return null;
  s.sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10;
}

export const SEASONS: { id: string; name: string; months: number[] }[] = [
  { id: "djf", name: "Dec to Feb", months: [12, 1, 2] }, { id: "mam", name: "Mar to May", months: [3, 4, 5] },
  { id: "jja", name: "Jun to Aug", months: [6, 7, 8] }, { id: "son", name: "Sep to Nov", months: [9, 10, 11] },
];

/** Yearly mean of the chosen calendar months (values, not anomalies). December counts toward the next year's
 *  Dec to Feb season. A year is kept only when every chosen month has data. */
export function seasonalYears(points: SeriesPoint[], months: number[]): { year: number; value: number }[] {
  const by = new Map<number, number[]>();
  for (const p of points) {
    const y = Number(p.t.slice(0, 4)), m = Number(p.t.slice(5, 7));
    if (!months.includes(m) || p.value === null) continue;
    const key = months.includes(12) && months.includes(1) && m === 12 ? y + 1 : y;
    by.set(key, [...(by.get(key) ?? []), p.value]);
  }
  return [...by.entries()].filter(([, v]) => v.length === months.length).sort((a, b) => a[0] - b[0])
    .map(([year, v]) => ({ year, value: v.reduce((s, x) => s + x, 0) / v.length }));
}

/** Time windows already explored (D3): a cap keeps the number of requests and multiple comparisons small. */
export const MAX_WINDOWS = 8;
