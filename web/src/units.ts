// Display units. The API always answers in its own units (°C, m³/m³, kg/m²); the client may show friendlier ones:
// °F when the user picks it, and in Explorer mode soil water as "% water" (m³/m³ × 100) and kg/m² as "mm of water"
// (1 kg of water per m² is a 1 mm layer, so the number stays). Absolute values: v × k + add. Changes (slopes, anomalies,
// CI, differences): Δ × k. Significance never changes: only the numbers' scale and label.
import type { CompareResponse, SeriesResponse, TrendGrid, TrendResponse, ValueGrid, Variable } from "./api";

export type TempUnit = "C" | "F";
export const isCelsius = (u: string | undefined) => u === "°C";

export interface Conv { from: string; to: string; k: number; add: number; text: RegExp }
export const FAHRENHEIT: Conv = { from: "°C", to: "°F", k: 1.8, add: 32, text: /([+\-−]?)(\d+(?:\.\d+)?)\s?°C/g };
const WATER_SHARE: Conv = { from: "m³/m³", to: "% water", k: 100, add: 0, text: /([+\-−]?)(\d+(?:\.\d+)?)\s?m[³3]\/m[³3]/g };
const WATER_DEPTH: Conv = { from: "kg/m²", to: "mm of water", k: 1, add: 0, text: /([+\-−]?)(\d+(?:\.\d+)?)\s?kg\/m[²2]/g };
const EXPLORER = [WATER_SHARE, WATER_DEPTH];

/** The conversion to apply to raw API numbers of a variable, given its units: raw (from the catalog) or already shown
 * (a store variable that was converted), so both kinds of caller get the same answer. null = show as the API says. */
export function convFor(units: string | undefined, tempUnit: TempUnit, audience: string): Conv | null {
  if (units === FAHRENHEIT.from || units === FAHRENHEIT.to) return tempUnit === "F" ? FAHRENHEIT : null;
  if (audience === "scientist") return null;
  return EXPLORER.find((c) => units === c.from || units === c.to) ?? null;
}

// Event counts per month (fires) read better as a yearly RATE: only rates of change (slopes, their intervals and
// differences, map legend) are shown ×12 "a year". Exact, because their slope is fitted to yearly averages
// (data-pipeline ANNUAL_SLOPE). Monthly values (charts, value maps, a single season) stay per month, and data objects
// keep the API's numbers (saved cases, report evidence, chart trend lines), so convert only where the text is written.
const PER_YEAR: Record<string, string> = { "fires/month": "fires a year" };
export const rateUnit = (u: string) => PER_YEAR[u] ?? u;
export const rateOf = (x: number | null | undefined, u: string) => (x === null || x === undefined ? null : x * (PER_YEAR[u] ? 12 : 1));
export const rateCi = (c: [number, number] | null | undefined, u: string): [number, number] | null =>
  (c ? [rateOf(c[0], u)!, rateOf(c[1], u)!] : null);

/** Rewrite "+0.28 °C" style numbers inside sentences from the API (they are always changes, never absolute values). */
export function convText(s: string, c: Conv): string {
  const drop = Math.round(Math.log10(c.k));   // ×100 moves the decimal point two places
  return s.replace(c.text, (_m, sign: string, num: string) => {
    const dec = Math.max(0, (num.split(".")[1] ?? "").length - drop);
    return `${sign}${(Number(num) * c.k).toFixed(dec)} ${c.to}`;
  });
}

const absOf = (c: Conv) => (v: number | null) => (v === null ? null : v * c.k + c.add);
const dltOf = (c: Conv) => (v: number | null) => (v === null ? null : v * c.k);
const pairOf = (c: Conv) => (p: [number, number] | null): [number, number] | null => (p ? [p[0] * c.k, p[1] * c.k] : null);

export const convVariable = (v: Variable, c: Conv): Variable => ({ ...v, display_units: c.to, units: c.to });

export const convSeries = (s: SeriesResponse, c: Conv): SeriesResponse => {
  const abs = absOf(c), dlt = dltOf(c);
  return { ...s, units: c.to, points: s.points.map((p) => ({ ...p, value: abs(p.value), anomaly: dlt(p.anomaly) })), climatology: s.climatology.map(abs) };
};

export const convTrend = (t: TrendResponse, c: Conv): TrendResponse => ({
  ...t, units: c.to, slope_per_decade: dltOf(c)(t.slope_per_decade), slope_ci: pairOf(c)(t.slope_ci),
  trend_line: t.trend_line.map((p) => ({ ...p, value: p.value * c.k + c.add })),   // absolute values (Values chart)
  plain_summary: convText(t.plain_summary, c),
});

export const convTrendGrid = (g: TrendGrid, c: Conv): TrendGrid => ({
  ...g, units: c.to,
  value_range: { min_slope: g.value_range.min_slope * c.k, max_slope: g.value_range.max_slope * c.k },
  cells: g.cells.map((x) => ({ ...x, slope_per_decade: dltOf(c)(x.slope_per_decade) })),
});

export const convValueGrid = (g: ValueGrid, c: Conv): ValueGrid => {
  const abs = absOf(c);
  return { ...g, units: c.to,
    value_range: { min: abs(g.value_range.min)!, max: abs(g.value_range.max)!, p02: abs(g.value_range.p02)!, p98: abs(g.value_range.p98)! },
    cells: g.cells.map((x) => ({ ...x, value: abs(x.value) })) };
};

export const convCompare = (x: CompareResponse, c: Conv): CompareResponse => ({
  ...x, a: convTrend(x.a, c), b: convTrend(x.b, c),
  difference: { ...x.difference, slope_diff_per_decade: dltOf(c)(x.difference.slope_diff_per_decade), ci: pairOf(c)(x.difference.ci) },
  plain_summary: convText(x.plain_summary, c),
});

/** Free text from the API (chat answers): every conversion that applies in the current settings. */
export const convAllText = (s: string, tempUnit: TempUnit, audience: string) =>
  [...(tempUnit === "F" ? [FAHRENHEIT] : []), ...(audience === "scientist" ? [] : EXPLORER)].reduce((a, c) => convText(a, c), s);

// °F shorthands (existing callers).
export const variableF = (v: Variable): Variable => (isCelsius(v.display_units) ? convVariable(v, FAHRENHEIT) : v);
export const seriesF = (s: SeriesResponse) => convSeries(s, FAHRENHEIT);
export const trendF = (t: TrendResponse) => convTrend(t, FAHRENHEIT);
export const trendGridF = (g: TrendGrid) => convTrendGrid(g, FAHRENHEIT);
export const valueGridF = (g: ValueGrid) => convValueGrid(g, FAHRENHEIT);
export const compareF = (x: CompareResponse) => convCompare(x, FAHRENHEIT);
