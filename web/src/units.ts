// Temperature display units. The API always answers in °C; when the user picks °F we convert on the client.
// Absolute values: F = C × 9/5 + 32. Changes (slopes, anomalies, CI, differences): ΔF = ΔC × 9/5.
import type { CompareResponse, SeriesResponse, TrendGrid, TrendResponse, ValueGrid, Variable } from "./api";

export type TempUnit = "C" | "F";
export const isCelsius = (u: string | undefined) => u === "°C";

const abs = (v: number | null) => (v === null ? null : v * 1.8 + 32);
const dlt = (v: number | null) => (v === null ? null : v * 1.8);
const pair = (c: [number, number] | null): [number, number] | null => (c ? [c[0] * 1.8, c[1] * 1.8] : null);

/** Rewrite "+0.28 °C" style numbers inside sentences from the API (they are always changes, never absolute values). */
export function textToF(s: string): string {
  return s.replace(/([+\-−]?)(\d+(?:\.\d+)?)\s?°C/g, (_m, sign: string, num: string) => {
    const dec = (num.split(".")[1] ?? "").length;
    return `${sign}${(Number(num) * 1.8).toFixed(dec)} °F`;
  });
}

export const variableF = (v: Variable): Variable => (isCelsius(v.display_units) ? { ...v, display_units: "°F", units: "°F" } : v);

export const seriesF = (s: SeriesResponse): SeriesResponse => ({
  ...s, units: "°F",
  points: s.points.map((p) => ({ ...p, value: abs(p.value), anomaly: dlt(p.anomaly) })),
  climatology: s.climatology.map(abs),
});

export const trendF = (t: TrendResponse): TrendResponse => ({
  ...t, units: "°F", slope_per_decade: dlt(t.slope_per_decade), slope_ci: pair(t.slope_ci),
  trend_line: t.trend_line.map((p) => ({ ...p, value: p.value * 1.8 + 32 })),   // absolute values (Values chart)
  plain_summary: textToF(t.plain_summary),
});

export const trendGridF = (g: TrendGrid): TrendGrid => ({
  ...g, units: "°F",
  value_range: { min_slope: g.value_range.min_slope * 1.8, max_slope: g.value_range.max_slope * 1.8 },
  cells: g.cells.map((c) => ({ ...c, slope_per_decade: dlt(c.slope_per_decade) })),
});

export const valueGridF = (g: ValueGrid): ValueGrid => ({
  ...g, units: "°F",
  value_range: { min: abs(g.value_range.min)!, max: abs(g.value_range.max)!, p02: abs(g.value_range.p02)!, p98: abs(g.value_range.p98)! },
  cells: g.cells.map((c) => ({ ...c, value: abs(c.value) })),
});

export const compareF = (c: CompareResponse): CompareResponse => ({
  ...c, a: trendF(c.a), b: trendF(c.b),
  difference: { ...c.difference, slope_diff_per_decade: dlt(c.difference.slope_diff_per_decade), ci: pair(c.difference.ci) },
  plain_summary: textToF(c.plain_summary),
});
